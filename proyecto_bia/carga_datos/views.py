import os
import logging
import unicodedata
from io import StringIO

import pandas as pd
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.core.validators import RegexValidator
from django.apps import apps  # <- import perezoso de modelos de otras apps

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from .forms import ExcelUploadForm
from .models import BaseDeDatosBia
from .serializers import BaseDeDatosBiaSerializer
from .views_helpers import limpiar_valor  # si ya lo tenés

logger = logging.getLogger('django.request')
digits_only = RegexValidator(r"^\d+$", "Solo dígitos.")

# =========================
# PARA DESCARGAR CSV
# =========================
import csv
from django.http import StreamingHttpResponse
from django.utils import timezone

# =========================
# CONFIGURACIÓN IMPORTANTE
# =========================
# Si True: si no existe la Entidad (por propietario o entidadinterna), se crea automáticamente.
CREATE_MISSING_ENTIDADES = True

# ==========
# UTILIDADES
# ==========
def _strip_accents(s: str) -> str:
    if s is None:
        return ""
    s = str(s)
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

def normalizar_columna(col):
    """
    Normaliza nombres de columnas para matchear contra campos del modelo:
    - s/ tildes, puntos, guiones, guiones bajos, espacios
    - upper
    """
    col = str(col).strip()
    col = _strip_accents(col)
    col = col.replace(".", "").replace("-", "").replace("_", "")
    col = col.upper().replace(" ", "")
    return col

def normalizar_valor_nombre(valor: str) -> str:
    """
    Normaliza valores de 'propietario' / 'entidadinterna' para comparación:
    - s/ tildes, espacios y puntuación común
    - lower
    """
    s = _strip_accents((valor or "").strip())
    for ch in ('.', '-', '_', ',', ';', ':', '/', '\\'):
        s = s.replace(ch, '')
    s = s.lower().replace(" ", "")
    return s

def validar_columnas_obligatorias(df_columns):
    """
    Verifica qué columnas del modelo faltan en el archivo.
    Si querés que 'creditos' sea opcional, podés excluirlo aquí como ejemplo.
    """
    columnas_modelo = [f.name for f in BaseDeDatosBia._meta.fields if f.name != 'id']
    # Ejemplo: si 'creditos' NO debe ser obligatoria, descomentar:
    # if 'creditos' in columnas_modelo:
    #     columnas_modelo.remove('creditos')

    columnas_modelo_norm = [normalizar_columna(c) for c in columnas_modelo]
    columnas_excel_norm  = [normalizar_columna(c) for c in df_columns]

    faltantes = []
    for i, normalizada in enumerate(columnas_modelo_norm):
        if normalizada not in columnas_excel_norm:
            faltantes.append(columnas_modelo[i])
    return faltantes

# ==============================
# RESOLVER FK ENTIDAD (OPCIÓN 3)
# ==============================
def _get_entidad_model():
    """Importa Entidad de forma perezosa para evitar ciclos de import."""
    return apps.get_model('certificado_ldd', 'Entidad')

def _build_entidad_cache():
    """
    Devuelve un dict clave-normalizada -> Entidad
    """
    Entidad = _get_entidad_model()
    cache = {}
    for e in Entidad.objects.all():
        cache[normalizar_valor_nombre(e.nombre)] = e
    return cache

def _resolver_entidad(propietario: str, entidadinterna: str, cache: dict, create_missing: bool):
    """
    Prioriza 'propietario'; si no, 'entidadinterna'.
    Usa cache para no pegar mil consultas.
    Si create_missing=True, crea Entidad cuando no exista.
    """
    Entidad = _get_entidad_model()

    for candidato in (propietario, entidadinterna):
        cand = (candidato or "").strip()
        if not cand:
            continue
        key = normalizar_valor_nombre(cand)
        if key in cache:
            return cache[key]
        # no está en cache
        if create_missing:
            # crear y cachear
            ent = Entidad.objects.create(nombre=cand, responsable="", cargo="")
            cache[key] = ent
            return ent
        # no crear => None (seguimos al siguiente candidato o devolvemos None)
    return None

# ==============
# VISTAS WEB UI
# ==============
@login_required
def confirmar_carga(request):
    """
    Versión web (no-API) que guarda lo que está en sesión.
    Ahora resuelve y setea la FK 'entidad' por propietario -> entidadinterna.
    """
    datos = request.session.get('datos_cargados', [])
    if not datos:
        return redirect('cargar_excel')

    try:
        columnas = [f.name for f in BaseDeDatosBia._meta.fields if f.name != 'id']

        entidad_cache = _build_entidad_cache()
        registros = []

        for fila in datos:
            # Resolver entidad (preferir propietario)
            ent = _resolver_entidad(
                fila.get('propietario'),
                fila.get('entidadinterna'),
                entidad_cache,
                CREATE_MISSING_ENTIDADES
            )

            # Construir kwargs limpios
            payload = {}
            for col in columnas:
                if col == 'entidad':
                    continue
                payload[col] = limpiar_valor(fila.get(col)) if 'limpiar_valor' in globals() else fila.get(col)

            obj = BaseDeDatosBia(**payload)
            if ent:
                obj.entidad = ent
            registros.append(obj)

        BaseDeDatosBia.objects.bulk_create(registros, batch_size=200)

        mensaje = f"✅ Se cargaron {len(registros)} registros correctamente."
        logger.info(f"[{request.user}] Confirmó carga de {len(registros)} registros desde interfaz web.")
    except Exception as e:
        mensaje = f"❌ Error al guardar los datos: {e}"
        logger.exception(f"[{request.user}] Error en confirmar_carga: {e}")

    request.session.pop('datos_cargados', None)
    return render(request, 'upload_form.html', {'form': ExcelUploadForm(), 'mensaje': mensaje})

@login_required
def cargar_excel(request):
    """
    Sube y guarda DIRECTO (flujo web). Resuelve FK 'entidad' por propietario -> entidadinterna.
    """
    mensaje = ""
    if request.method == 'POST':
        form = ExcelUploadForm(request.POST, request.FILES)
        if form.is_valid():
            archivo = request.FILES['archivo']
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
                    return render(request, 'upload_form.html', {'form': form, 'mensaje': "\n".join(errores)})

                # Mapeo columnas Excel -> modelo
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

                # Resolver FK 'entidad' por fila (propietario -> entidadinterna)
                entidad_cache = _build_entidad_cache()
                columnas = [f.name for f in BaseDeDatosBia._meta.fields if f.name != 'id']
                registros = []
                for i in df.index:
                    fila = {col: df.at[i, col] for col in columnas if col in df.columns}
                    ent = _resolver_entidad(
                        fila.get('propietario'),
                        fila.get('entidadinterna'),
                        entidad_cache,
                        CREATE_MISSING_ENTIDADES
                    )
                    obj = BaseDeDatosBia(**{k: fila.get(k) for k in columnas if k != 'entidad'})
                    if ent:
                        obj.entidad = ent
                    registros.append(obj)

                BaseDeDatosBia.objects.bulk_create(registros, batch_size=200)
                mensaje = f"✅ Se cargaron {len(registros)} registros."
                logger.info(f"[{request.user}] Cargó archivo '{archivo.name}' con {len(registros)} registros (web).")

            except Exception as e:
                mensaje = f"❌ Error al procesar el archivo: {e}"
                logger.exception(f"[{request.user}] Error en carga desde vista web: {e}")
    else:
        form = ExcelUploadForm()

    return render(request, 'upload_form.html', {'form': form, 'mensaje': mensaje})

# =========
# API REST
# =========
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_cargar_excel(request):
    """
    Sube y previsualiza (NO guarda). Deja los datos en sesión.
    La FK se resuelve definitivamente en api_confirmar_carga.
    """
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

        # Mapeo columnas Excel -> modelo
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

        # Previsualización (NO seteamos aún entidad_id para no “escribir nombres” sin querer)
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
    """
    Guarda registros enviados por el front (o la sesión de api_cargar_excel),
    resolviendo FK 'entidad' por propietario -> entidadinterna.
    """
    # a) Si el front manda 'records' directo:
    records = request.data.get('records', [])

    # b) Si no, usamos la sesión creada en api_cargar_excel
    if not records:
        records = request.session.get('datos_cargados', [])

    if not records:
        return Response({'success': False, 'error': 'No hay datos para confirmar'}, status=400)

    columnas = [f.name for f in BaseDeDatosBia._meta.fields if f.name != 'id']

    try:
        entidad_cache = _build_entidad_cache()
        registros = []

        for item in records:
            ent = _resolver_entidad(
                item.get('propietario'),
                item.get('entidadinterna'),
                entidad_cache,
                CREATE_MISSING_ENTIDADES
            )

            payload = {}
            for col in columnas:
                if col == 'entidad':
                    continue
                payload[col] = limpiar_valor(item.get(col)) if 'limpiar_valor' in globals() else item.get(col)

            obj = BaseDeDatosBia(**payload)
            if ent:
                obj.entidad = ent
            registros.append(obj)

        BaseDeDatosBia.objects.bulk_create(registros, batch_size=200)
        # limpiar sesión si venía de ahí
        if 'datos_cargados' in request.session:
            request.session.pop('datos_cargados', None)

        return Response({'success': True, 'created_count': len(registros)})

    except Exception as e:
        import traceback
        logger.error("Error en api_confirmar_carga:\n%s", traceback.format_exc())
        return Response({'success': False, 'error': str(e)}, status=500)

# =========================
# ERRORES VALIDACIÓN (web)
# =========================
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
    if request.GET.get('exportar') == 'txt':
        txt = "\n".join(errores)
        return HttpResponse(txt, content_type='text/plain')
    return Response({'success': True, 'errors': errores})

# =========================
# CONSULTA / EDICIÓN BIA
# =========================
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def mostrar_datos_bia(request):
    """
    GET /api/mostrar-datos-bia/?dni=...&id_pago_unico=...
    Devuelve coincidencias por dni OR id_pago_unico (paginado).
    """
    dni = (request.query_params.get('dni') or '').strip()
    idp = (request.query_params.get('id_pago_unico') or '').strip()

    if not dni and not idp:
        return Response({"detail": "Debes enviar un dni o un id_pago_unico"}, status=400)

    # Validaciones simples (ajustá si tus campos permiten letras)
    if dni and not dni.isdigit():
        return Response({"detail": "dni inválido. Use solo dígitos."}, status=400)
    if idp and not idp.isdigit():
        return Response({"detail": "id_pago_unico inválido. Use solo dígitos."}, status=400)

    qs = BaseDeDatosBia.objects.filter(Q(dni=dni) | Q(id_pago_unico=idp)).order_by('id')

    paginator = PageNumberPagination()
    page = paginator.paginate_queryset(qs, request)
    ser = BaseDeDatosBiaSerializer(page, many=True)
    return paginator.get_paginated_response(ser.data)

NO_EDITABLES = {'id'}  # podés sumar 'dni', 'id_pago_unico'

@api_view(['PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def actualizar_datos_bia(request, pk: int):
    """
    PUT/PATCH /api/mostrar-datos-bia/<id>/
    Actualiza parcialmente o totalmente el registro.
    Bloquea cambios de 'id' y (opcional) valida dni/id_pago_unico.
    """
    obj = get_object_or_404(BaseDeDatosBia, pk=pk)

    # si te mandan dni/id_pago_unico distinto, bloquear
    if 'dni' in request.data and str(request.data['dni']).strip() != str(obj.dni or '').strip():
        return Response({"detail": "El DNI del cuerpo no coincide con el registro."}, status=403)
    if 'id_pago_unico' in request.data and str(request.data['id_pago_unico']).strip() != str(obj.id_pago_unico or '').strip():
        return Response({"detail": "El id_pago_unico del cuerpo no coincide con el registro."}, status=403)

    clean = {k: v for k, v in request.data.items() if k not in NO_EDITABLES}
    ser = BaseDeDatosBiaSerializer(obj, data=clean, partial=True)
    ser.is_valid(raise_exception=True)
    ser.save()
    return Response(ser.data, status=200)



@api_view(['GET'])
@permission_classes([IsAuthenticated])
def exportar_datos_bia_csv(request):
    """
    GET /api/exportar-datos-bia.csv
    Exporta toda la tabla db_bia en CSV (opcionalmente filtrada por dni / id_pago_unico).
    """
    dni = (request.query_params.get('dni') or '').strip()
    idp = (request.query_params.get('id_pago_unico') or '').strip()

    # Campos a exportar: todos los fields del modelo (incluye 'id' y 'entidad_id' si existe)
    fields = [f.name for f in BaseDeDatosBia._meta.fields]

    # Query base + filtros opcionales
    qs = BaseDeDatosBia.objects.all().order_by('id')
    if dni:
        qs = qs.filter(dni=dni)
    if idp:
        qs = qs.filter(id_pago_unico=idp)

    # Stream CSV sin cargar todo en memoria (patrón Echo)
    class Echo:
        def write(self, value):  # csv.writer pide un "file-like object" con write()
            return value

    def row_iter():
        pseudo_buffer = Echo()
        writer = csv.writer(pseudo_buffer)
        # Header
        yield writer.writerow(fields)
        # Filas
        for row in qs.values_list(*fields).iterator(chunk_size=2000):
            yield writer.writerow(['' if v is None else str(v) for v in row])

    ts = timezone.localtime().strftime('%Y%m%d_%H%M%S')
    response = StreamingHttpResponse(row_iter(), content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="db_bia_{ts}.csv"'
    return response
