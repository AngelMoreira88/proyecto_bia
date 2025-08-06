import pandas as pd
import os
import logging
import unicodedata
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from .forms import ExcelUploadForm
from .models import BaseDeDatosBia
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from .views_helpers import limpiar_valor  # Helper de limpieza
from django.db import IntegrityError
from rest_framework import status
from .serializers import BaseDeDatosBiaSerializer

# Logger para registrar eventos importantes en el log de Django
logger = logging.getLogger('django.request')

# Normaliza una columna: elimina tildes, espacios, guiones, puntos y convierte a mayúsculas
# Esto permite comparar columnas sin importar formato o escritura
# También elimina guiones bajos para evitar errores de coincidencia

def normalizar_columna(col):
    col = str(col).strip()
    col = ''.join(c for c in unicodedata.normalize('NFD', col) if unicodedata.category(c) != 'Mn')  # quita tildes
    col = col.replace(".", "").replace("-", "").replace("_", "")  # quita puntos, guiones y guiones bajos
    col = col.upper().replace(" ", "")  # quita espacios y convierte a mayúsculas
    return col

# Compara las columnas del archivo con las del modelo, devolviendo las faltantes
# Devuelve columnas del modelo que no tienen su correspondiente equivalente normalizado en el archivo

def validar_columnas_obligatorias(df_columns):
    columnas_modelo = [f.name for f in BaseDeDatosBia._meta.fields if f.name != 'id']
    columnas_modelo_normalizadas = [normalizar_columna(c) for c in columnas_modelo]
    columnas_excel_normalizadas = [normalizar_columna(c) for c in df_columns]

    print("Columnas del modelo (normalizadas):", columnas_modelo_normalizadas)
    print("Columnas del Excel (normalizadas):", columnas_excel_normalizadas)

    faltantes = []
    for i, normalizada in enumerate(columnas_modelo_normalizadas):
        if normalizada not in columnas_excel_normalizadas:
            faltantes.append(columnas_modelo[i])

    return faltantes

# --- Resto del código sin cambios ---
# Las vistas confirmar_carga, cargar_excel, api_cargar_excel y api_confirmar_carga permanecen iguales
# ya que usan la función normalizar_columna actualizada automáticamente al llamarla
@login_required
def confirmar_carga(request):
    datos = request.session.get('datos_cargados', [])
    if not datos:
        return redirect('cargar_excel')

    try:
        columnas = [f.name for f in BaseDeDatosBia._meta.fields if f.name != 'id']
        registros = [BaseDeDatosBia(**{col: fila.get(col) for col in columnas}) for fila in datos]
        BaseDeDatosBia.objects.bulk_create(registros, batch_size=100)
        mensaje = f"✅ Se cargaron {len(registros)} registros correctamente."
        logger.info(f"[{request.user}] Confirmó carga de {len(registros)} registros desde interfaz web.")
    except Exception as e:
        mensaje = f"❌ Error al guardar los datos: {e}"
        logger.exception(f"[{request.user}] Error en confirmar_carga: {e}")

    request.session.pop('datos_cargados', None)
    return render(request, 'upload_form.html', {'form': ExcelUploadForm(), 'mensaje': mensaje})

@login_required
def cargar_excel(request):
    mensaje = ""
    if request.method == 'POST':
        form = ExcelUploadForm(request.POST, request.FILES)
        if form.is_valid():
            archivo = request.FILES['archivo']
            try:
                extension = os.path.splitext(archivo.name)[1].lower()

                # Lee CSV o Excel según corresponda
                if extension == '.csv':
                    try:
                        df = pd.read_csv(archivo)
                    except UnicodeDecodeError:
                        archivo.seek(0)
                        df = pd.read_csv(archivo, encoding='latin1')
                else:
                    df = pd.read_excel(archivo)

                df = df.where(pd.notnull(df), None)

                # Validación de columnas necesarias
                faltantes = validar_columnas_obligatorias(list(df.columns))
                if faltantes:
                    errores = ["❌ Faltan columnas obligatorias en el archivo:"] + [f"- Faltante: {col}" for col in faltantes]
                    logger.info(f"[{request.user}] Faltan columnas en archivo '{archivo.name}': {faltantes}")
                    return render(request, 'upload_form.html', {'form': form, 'mensaje': "\n".join(errores)})

                # Mapeo de columnas normalizadas
                columnas_modelo = [f.name for f in BaseDeDatosBia._meta.fields if f.name != 'id']
                columna_map = {}
                for col in df.columns:
                    col_norm = normalizar_columna(col)
                    for campo in columnas_modelo:
                        if normalizar_columna(campo) == col_norm:
                            columna_map[col] = campo
                            break

                df.rename(columns=columna_map, inplace=True)
                df = df.where(pd.notnull(df), None)

                columnas = [f.name for f in BaseDeDatosBia._meta.fields if f.name != 'id']
                registros = [
                    BaseDeDatosBia(**{col: df.at[i, col] for col in columnas if col in df.columns})
                    for i in df.index
                ]
                BaseDeDatosBia.objects.bulk_create(registros, batch_size=100)
                mensaje = f"✅ Se cargaron {len(registros)} registros."
                logger.info(f"[{request.user}] Cargó archivo '{archivo.name}' con {len(registros)} registros desde la interfaz web.")

            except Exception as e:
                mensaje = f"❌ Error al procesar el archivo: {e}"
                logger.exception(f"[{request.user}] Error en carga desde vista web: {e}")
    else:
        form = ExcelUploadForm()

    return render(request, 'upload_form.html', {'form': form, 'mensaje': mensaje})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_cargar_excel(request):
    form = ExcelUploadForm(request.POST, request.FILES)
    if not form.is_valid():
        logger.warning(f"[{request.user}] Formulario inválido.")
        return Response({'success': False, 'errors': ['Formulario inválido']}, status=400)

    archivo = request.FILES.get('archivo')
    if not archivo:
        logger.warning(f"[{request.user}] No se recibió archivo.")
        return Response({'success': False, 'errors': ['Archivo no recibido']}, status=400)

    try:
        extension = os.path.splitext(archivo.name)[1].lower()
        if extension == '.csv':
            try:
                df = pd.read_csv(archivo)
            except UnicodeDecodeError:
                archivo.seek(0)
                df = pd.read_csv(archivo, encoding='latin1')
        else:
            df = pd.read_excel(archivo)

        df = df.where(pd.notnull(df), None)

        # Validación de columnas
        faltantes = validar_columnas_obligatorias(list(df.columns))
        if faltantes:
            errores = ["❌ Faltan columnas obligatorias en el archivo:"] + [f"- Faltante: {col}" for col in faltantes]
            logger.info(f"[{request.user}] Faltan columnas en archivo '{archivo.name}': {faltantes}")
            return Response({'success': False, 'errors': errores}, status=400)

        # Mapeo de columnas
        columnas_modelo = [f.name for f in BaseDeDatosBia._meta.fields if f.name != 'id']
        columna_map = {}
        for col in df.columns:
            col_norm = normalizar_columna(col)
            for campo in columnas_modelo:
                if normalizar_columna(campo) == col_norm:
                    columna_map[col] = campo
                    break

        df.rename(columns=columna_map, inplace=True)
        df = df.where(pd.notnull(df), None)

        # Previsualización y almacenamiento temporal
        preview_html = df.head(5).to_html(escape=False, index=False)
        data = df.astype(str).where(pd.notnull(df), None).to_dict(orient='records')
        request.session['datos_cargados'] = data

        logger.info(f"[{request.user}] Previsualización cargada de '{archivo.name}' con {len(df)} registros.")
        return Response({'success': True, 'preview': preview_html, 'data': data})

    except Exception as e:
        logger.exception(f"[{request.user}] Error inesperado en carga: {e}")
        return Response({'success': False, 'errors': [f"Error al procesar archivo: {str(e)}"]}, status=500)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_confirmar_carga(request):
    # 1) Leer los registros enviados
    records = request.data.get('records', [])
    if not records:
        return Response(
            {'success': False, 'error': 'No hay datos para confirmar'},
            status=400
        )

    # 2) Preparar la lista de campos (sin el id automático)
    columnas = [f.name for f in BaseDeDatosBia._meta.fields if f.name != 'id']

    # 3) Crear instancias a partir de los datos
    try:
        registros = [
            BaseDeDatosBia(
                **{col: limpiar_valor(item.get(col)) for col in columnas}
            )
            for item in records
        ]
        # 4) Bulk insert
        BaseDeDatosBia.objects.bulk_create(registros, batch_size=100)
        return Response({'success': True, 'created_count': len(registros)})

    except Exception as e:
        import traceback
        logger.error("Error en api_confirmar_carga:\n%s", traceback.format_exc())
        return Response({'success': False, 'error': str(e)}, status=500)


@login_required
def errores_validacion(request):
    errores = request.session.get('errores_validacion', [])
    if not errores:
        return redirect('cargar_excel')

    if request.GET.get('exportar') == 'txt':
        buffer = StringIO()
        for err in errores:
            buffer.write(f"{err}\n")
        response = HttpResponse(buffer.getvalue(), content_type='text/plain')
        response['Content-Disposition'] = 'attachment; filename="errores_validacion.txt"'
        return response

    return render(request, 'errores_validacion.html', {'errores': errores})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_errores_validacion(request):
    errores = request.session.get('errores_validacion', [])
    if not errores:
        return Response({'success': False, 'error': 'Sin errores'}, status=404)
    # Exportar como texto si se pide
    if request.GET.get('exportar') == 'txt':
        txt = "\n".join(errores)
        return HttpResponse(txt, content_type='text/plain')
    return Response({'success': True, 'errors': errores})

@api_view(['GET'])
def mostrar_datos(request):
    dni = request.GET.get('dni')
    qs = BaseDeDatosBia.objects.all()
    if dni:
        qs = qs.filter(dni=dni)
    serializer = BaseDeDatosBiaSerializer(qs, many=True)
    return Response(serializer.data)