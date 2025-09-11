# carga_datos/views.py
import os
import logging
import unicodedata
import json
import hashlib
from io import StringIO

import pandas as pd
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.core.validators import RegexValidator
from django.apps import apps  # import perezoso de modelos de otras apps

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from .forms import ExcelUploadForm
from .models import BaseDeDatosBia, allocate_id_pago_unico_block
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

# (Opcional) Exigir clave en confirmación para considerar válida la fila.
# Si lo activás, sólo se aceptarán filas que tengan al menos DNI o id_pago_unico no vacío.
REQUIRE_KEY_FOR_ROW = False
KEY_FIELDS = ('dni', 'id_pago_unico')

# ========== UTILIDADES ==========
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
    # Ejemplo para hacer opcional:
    # if 'creditos' in columnas_modelo:
    #     columnas_modelo.remove('creditos')

    columnas_modelo_norm = [normalizar_columna(c) for c in columnas_modelo]
    columnas_excel_norm  = [normalizar_columna(c) for c in df_columns]

    faltantes = []
    for i, normalizada in enumerate(columnas_modelo_norm):
        if normalizada not in columnas_excel_norm:
            faltantes.append(columnas_modelo[i])
    return faltantes

# ---------- Helpers de limpieza de filas ----------
def df_drop_blank_rows(df: pd.DataFrame) -> pd.DataFrame:
    """
    Elimina filas completamente vacías (None/NaN/''/espacios).
    Evita que pandas cuente filas con formato/bordes como válidas.
    """
    if df is None or df.empty:
        return df

    # Normalizamos NaN -> None
    df = df.where(pd.notnull(df), None)

    # Drop filas con todo None/NaN
    df = df.dropna(how='all')
    if df.empty:
        return df

    # Considerar strings vacíos/espacios como vacíos
    def _row_is_blank(row) -> bool:
        for v in row:
            if v is None:
                continue
            if isinstance(v, str):
                if v.strip() != '':
                    return False
            else:
                # Números/fechas/etc. cuentan como "no vacío"
                return False
        return True

    mask = df.apply(_row_is_blank, axis=1)
    return df.loc[~mask]

def _row_is_blank_dict(d: dict) -> bool:
    """
    True si todas las celdas del dict están vacías (None/''/espacios).
    """
    if not isinstance(d, dict):
        return True
    for _, v in d.items():
        if v is None:
            continue
        if isinstance(v, str):
            if v.strip() != '':
                return False
        else:
            # Números/fechas/etc. significan "no vacía"
            return False
    return True

def _has_key_fields(d: dict) -> bool:
    for k in KEY_FIELDS:
        v = d.get(k)
        if v is None:
            continue
        if str(v).strip() != '':
            return True
    return False

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
        if create_missing:
            ent = Entidad.objects.create(nombre=cand, responsable="", cargo="")
            cache[key] = ent
            return ent
    return None

# ============== VISTAS WEB UI ==============
@login_required
def confirmar_carga(request):
    """
    Versión web: toma lo de sesión y aplica misma lógica que la API.
    """
    datos = request.session.get('datos_cargados', [])
    if not datos:
        return redirect('cargar_excel')

    # Reutilizamos la API por simplicidad
    from rest_framework.test import APIRequestFactory
    factory = APIRequestFactory()
    drf_request = factory.post('/carga-datos/api/confirmar/', {'records': datos}, format='json')
    drf_request.user = request.user  # forward auth
    resp = api_confirmar_carga(drf_request)

    # Render liviano con el resultado
    if resp.status_code == 200 and (resp.data or {}).get('success'):
        mensaje = f"✅ Se cargaron {resp.data.get('created_count', 0)} registros correctamente."
    else:
        mensaje = f"❌ Error al guardar los datos: {getattr(resp, 'data', {})}"

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

                # 🔧 NUEVO: eliminar filas totalmente vacías antes de seguir
                df = df_drop_blank_rows(df)
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

                # 🔧 NUEVO: por si el rename generó columnas vacías, limpiar otra vez
                df = df_drop_blank_rows(df)
                df = df.where(pd.notnull(df), None)

                # Resolver FK 'entidad' por fila (propietario -> entidadinterna)
                entidad_cache = _build_entidad_cache()
                columnas = [f.name for f in BaseDeDatosBia._meta.fields if f.name != 'id']
                registros = []
                for i in df.index:
                    fila = {col: df.at[i, col] for col in columnas if col in df.columns}
                    # Ignorar filas vacías defensivamente
                    if _row_is_blank_dict(fila):
                        continue
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

                if not registros:
                    mensaje = "⚠️ No se encontraron filas válidas para insertar."
                else:
                    BaseDeDatosBia.objects.bulk_create(registros, batch_size=200)
                    mensaje = f"✅ Se cargaron {len(registros)} registros."
                    logger.info(f"[{request.user}] Cargó archivo '{archivo.name}' con {len(registros)} registros (web).")

            except Exception as e:
                mensaje = f"❌ Error al procesar el archivo: {e}"
                logger.exception(f"[{request.user}] Error en carga desde vista web: {e}")
    else:
        form = ExcelUploadForm()

    return render(request, 'upload_form.html', {'form': ExcelUploadForm(), 'mensaje': mensaje})

# ========= API REST =========
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

        # 🔧 NUEVO: sacar filas completamente vacías
        df = df_drop_blank_rows(df)
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

        # 🔧 NUEVO: limpiar nuevamente tras rename
        df = df_drop_blank_rows(df)
        df = df.where(pd.notnull(df), None)

        # Previsualización
        preview_html = df.head(5).to_html(escape=False, index=False)
        data = df.astype(str).where(pd.notnull(df), None).to_dict(orient='records')

        # 🔧 NUEVO: Guardar SOLO filas no vacías en sesión
        data = [r for r in data if not _row_is_blank_dict(r)]
        if REQUIRE_KEY_FOR_ROW:
            data = [r for r in data if _has_key_fields(r)]

        if not data:
            return Response({'success': False, 'errors': ['No hay filas válidas en el archivo.']}, status=400)

        request.session['datos_cargados'] = data

        logger.info(f"[{request.user}] Previsualización cargada de '{archivo.name}' con {len(data)} registros (tras limpieza).")
        return Response({'success': True, 'preview': preview_html, 'data': data})

    except Exception as e:
        logger.exception(f"[{request.user}] Error inesperado en carga: {e}")
        return Response({'success': False, 'errors': [f"Error al procesar archivo: {str(e)}"]}, status=500)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_confirmar_carga(request):
    """
    Guarda registros enviados por el front (o desde la sesión),
    resolviendo FK 'entidad' y asignando id_pago_unico cuando venga vacío.
    También valida duplicados (payload y DB) y devuelve métricas.
    """
    records = request.data.get('records', []) or request.session.get('datos_cargados', [])
    if not records:
        return Response({'success': False, 'error': 'No hay datos para confirmar'}, status=400)

    # 🔧 NUEVO: Filtrar dicts "vacíos"
    records = [r for r in records if not _row_is_blank_dict(r)]
    if REQUIRE_KEY_FOR_ROW:
        records = [r for r in records if _has_key_fields(r)]
    if not records:
        return Response({'success': False, 'error': 'Todas las filas están vacías o sin claves requeridas.'}, status=400)

    # (Opcional) Guard anti-doble confirmación por hash de payload
    # payload_hash = hashlib.sha256(json.dumps(records, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()
    # last_hash = request.session.get('last_confirm_hash')
    # if last_hash == payload_hash:
    #     return Response({'success': False, 'error': 'El mismo payload ya fue confirmado recientemente.'}, status=409)
    # request.session['last_confirm_hash'] = payload_hash

    columnas = [f.name for f in BaseDeDatosBia._meta.fields if f.name != 'id']

    # 1) Normalizar + detectar faltantes de id_pago_unico
    normalized = []
    missing_indexes = []
    for idx, item in enumerate(records):
        row = dict(item or {})
        raw_idp = (row.get('id_pago_unico') or '').strip()
        if raw_idp == '':
            missing_indexes.append(idx)
        else:
            if not raw_idp.isdigit():
                return Response({'success': False, 'error': f'id_pago_unico inválido en fila {idx+1}: "{raw_idp}" (solo dígitos)'}, status=400)
        normalized.append(row)

    # 2) Asignar bloque para faltantes
    if missing_indexes:
        new_ids = allocate_id_pago_unico_block(len(missing_indexes))
        for i, new_id in zip(missing_indexes, new_ids):
            normalized[i]['id_pago_unico'] = new_id

    # 3) Duplicados dentro del payload
    idps = [str(r.get('id_pago_unico')).strip() for r in normalized]
    dup_in_payload = {x for x in idps if idps.count(x) > 1}
    if dup_in_payload:
        return Response(
            {'success': False, 'error': f'id_pago_unico duplicado en el archivo: {", ".join(sorted(dup_in_payload))}'},
            status=400
        )

    # 4) Duplicados contra la DB
    existing = set(
        BaseDeDatosBia.objects.filter(id_pago_unico__in=idps).values_list('id_pago_unico', flat=True)
    )
    if existing:
        return Response(
            {'success': False, 'error': f'id_pago_unico ya existente en base: {", ".join(sorted(existing))}'},
            status=400
        )

    # 5) Construcción de objetos + resolución de FK
    entidad_cache = _build_entidad_cache()
    to_create = []
    for row in normalized:
        payload = {}
        for col in columnas:
            if col == 'entidad':
                continue
            payload[col] = limpiar_valor(row.get(col)) if 'limpiar_valor' in globals() else row.get(col)

        # Ignorar defensivamente filas que quedaron "vacías" luego de limpiar
        if _row_is_blank_dict(payload):
            continue

        ent = _resolver_entidad(payload.get('propietario'), payload.get('entidadinterna'),
                                entidad_cache, CREATE_MISSING_ENTIDADES)
        obj = BaseDeDatosBia(**payload)
        if ent:
            obj.entidad = ent
        to_create.append(obj)

    if not to_create:
        return Response({'success': False, 'error': 'No hay filas válidas para insertar.'}, status=400)

    # 6) Persistencia en bloque
    BaseDeDatosBia.objects.bulk_create(to_create, batch_size=200)

    # 7) Limpiamos sesión si venían de ahí
    if 'datos_cargados' in request.session:
        request.session.pop('datos_cargados', None)

    return Response({
        'success': True,
        'created_count': len(to_create),
        'updated_count': 0,
        'skipped_count': 0,
        'errors_count': 0,
    })

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
    - 'id' no editable
    - Si vienen 'dni' o 'id_pago_unico' en el cuerpo y difieren del registro, devuelve 400 (conflicto de datos).
    """
    obj = get_object_or_404(BaseDeDatosBia, pk=pk)

    def _norm(s):
        return '' if s is None else str(s).strip()

    body_dni = request.data.get('dni', None)
    body_idp = request.data.get('id_pago_unico', None)

    if body_dni is not None and _norm(body_dni) != _norm(obj.dni):
        return Response({"detail": "El DNI del cuerpo no coincide con el registro."}, status=400)

    if body_idp is not None and _norm(body_idp) != _norm(obj.id_pago_unico):
        return Response({"detail": "El id_pago_unico del cuerpo no coincide con el registro."}, status=400)

    clean = {k: v for k, v in request.data.items() if k not in NO_EDITABLES}

    ser = BaseDeDatosBiaSerializer(obj, data=clean, partial=(request.method == 'PATCH'))
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

    fields = [f.name for f in BaseDeDatosBia._meta.fields]

    qs = BaseDeDatosBia.objects.all().order_by('id')
    if dni:
        qs = qs.filter(dni=dni)
    if idp:
        qs = qs.filter(id_pago_unico=idp)

    class Echo:
        def write(self, value):
            return value

    def row_iter():
        pseudo_buffer = Echo()
        writer = csv.writer(pseudo_buffer)
        yield writer.writerow(fields)
        for row in qs.values_list(*fields).iterator(chunk_size=2000):
            yield writer.writerow(['' if v is None else str (v) for v in row])

    ts = timezone.localtime().strftime('%Y%m%d_%H%M%S')
    response = StreamingHttpResponse(row_iter(), content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="db_bia_{ts}.csv"'
    return response
