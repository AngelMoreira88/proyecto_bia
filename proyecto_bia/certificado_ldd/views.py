# certificado_ldd/views.py
"""
Vistas para emisión de Certificados de Libre Deuda.

Prefijo de app en urls.py: /api/certificado/

Endpoints:
- GET  /ping/
- GET  /consulta/dni/?dni=<dni>[&page=1&page_size=50]    ← pública: lista por DNI (canceladas y no), un item por id_pago_unico
- GET  /seleccionar/?dni=<dni>                            ← HTML interno (login + permiso)
- GET  /generar/?id_pago_unico=<id>[&dni=<dni>]          ← público: PDF directo o JSON de negocio (200)
- POST /generar/ (form-data: dni=... [id_pago_unico=...]) ← público: PDF directo o JSON de negocio (200)
- /entidades/ (DRF, solo internos)

Convenciones de negocio (nunca 404 por “no hay”):
- {"estado":"sin_resultados"} → 200
- {"estado":"pendiente"}      → 200 (hay deudas no canceladas)
- {"estado":"varios_cancelados"} → 200 (hay >=1 cancelado y >1 alternativa)
- {"estado":"solo_cancelados"} → 200 (todas canceladas)
Errores de validación: 400; errores de servidor: 500.
"""

from __future__ import annotations

import logging
import os
from io import BytesIO
from typing import Optional, Dict, Any, Tuple, List

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import connection, transaction
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import render
from django.template.loader import render_to_string
from django.urls import reverse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied

from rest_framework import viewsets, filters, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response

from xhtml2pdf import pisa

from carga_datos.models import BaseDeDatosBia
from carga_datos.permissions import CanManageEntities  # permisos internos
from .models import Certificate, Entidad
from .serializers import EntidadSerializer

logger = logging.getLogger(__name__)

# ======================================================================================
# Constantes y helpers
# ======================================================================================

BUSINESS = {
    "SIN_RESULTADOS": "sin_resultados",
    "PENDIENTE": "pendiente",
    "VARIOS_CANCELADOS": "varios_cancelados",
    "SOLO_CANCELADOS": "solo_cancelados",
}

MAX_PAGE_SIZE = 200
DEFAULT_PAGE_SIZE = 50

def _is_ajax(request: HttpRequest) -> bool:
    return (request.headers.get("X-Requested-With") == "XMLHttpRequest") or (
        request.META.get("HTTP_X_REQUESTED_WITH") == "XMLHttpRequest"
    )

def allow_public(view_func):
    """Marcador no-op: vista pública (no exige login)."""
    return view_func

def _norm_dni(s: str) -> str:
    return "".join(ch for ch in (s or "") if ch.isdigit())

def _ok_dni(s: str) -> bool:
    return s.isdigit() and 6 <= len(s) <= 12  # rango defensivo

# ==== FieldFile helpers (sin tocar .path) ====
def _fieldfile_exists(ff) -> bool:
    if not ff or not getattr(ff, "name", ""):
        return False
    try:
        return ff.storage.exists(ff.name)
    except Exception:
        return False

def _open_fieldfile(ff, mode="rb"):
    return ff.storage.open(ff.name, mode)

# ======================================================================================
# PDF helpers
# ======================================================================================

def link_callback(uri: str, rel: str) -> str:
    s_url = settings.STATIC_URL
    s_root = getattr(settings, "STATIC_ROOT", None)
    s_dirs = list(getattr(settings, "STATICFILES_DIRS", []))
    m_url = getattr(settings, "MEDIA_URL", None)
    m_root = getattr(settings, "MEDIA_ROOT", None)

    if s_url and uri.startswith(s_url):
        relpath = uri.replace(s_url, "", 1)
        if s_root:
            candidate = os.path.join(s_root, relpath)
            if os.path.exists(candidate):
                return candidate
        for d in s_dirs:
            candidate = os.path.join(d, relpath)
            if os.path.exists(candidate):
                return candidate
        raise Exception(f"[link_callback] Archivo estático no encontrado: {relpath}")

    if m_url and uri.startswith(m_url):
        relpath = uri.replace(m_url, "", 1)
        if m_root:
            candidate = os.path.join(m_root, relpath)
            if os.path.exists(candidate):
                return candidate
        raise Exception(f"[link_callback] Archivo media no encontrado: {relpath}")

    return uri

def generate_pdf(html: str) -> Optional[bytes]:
    logger.debug("[generate_pdf] Render HTML->PDF (len=%s)", len(html))
    buf = BytesIO()
    result = pisa.CreatePDF(html, dest=buf, link_callback=link_callback, encoding="utf-8")
    if result.err:
        logger.error("[generate_pdf] xhtml2pdf err=%s", result.err)
        return None
    return buf.getvalue()

# ======================================================================================
# Negocio
# ======================================================================================

def _is_cancelado(reg: BaseDeDatosBia) -> bool:
    return (reg.estado or "").strip().lower() == "cancelado"

def _row_minimal(reg: BaseDeDatosBia) -> Dict[str, Any]:
    return {
        "dni": reg.dni,
        "id_pago_unico": reg.id_pago_unico,
        "propietario": reg.propietario,
        "entidadinterna": reg.entidadinterna,
        "estado": reg.estado,
    }

def get_entidad_emisora(registro: BaseDeDatosBia) -> Optional[Entidad]:
    propietario = (registro.propietario or "").strip()
    interna = (registro.entidadinterna or "").strip()
    ent = None
    if propietario:
        ent = Entidad.objects.filter(nombre__iexact=propietario).first()
    if not ent and interna:
        ent = Entidad.objects.filter(nombre__iexact=interna).first()
    return ent

def _render_pdf_for_registro(reg: BaseDeDatosBia) -> Tuple[Optional[Certificate], Optional[bytes], Optional[str]]:
    logger.info("[_render_pdf_for_registro] id_pago_unico=%s", reg.id_pago_unico)
    cert, _created = Certificate.objects.get_or_create(client=reg)

    # Reuso PDF si existe en storage
    if _fieldfile_exists(cert.pdf_file):
        try:
            with _open_fieldfile(cert.pdf_file, "rb") as fh:
                return cert, fh.read(), None
        except Exception as e:
            logger.exception("[_render_pdf_for_registro] Error leyendo PDF cacheado: %s", e)
    else:
        if getattr(cert.pdf_file, "name", ""):
            logger.warning("[_render_pdf_for_registro] pdf_file apunta a %s pero no existe; se limpia.", cert.pdf_file.name)
            cert.pdf_file.delete(save=False)

    emisora = get_entidad_emisora(reg)
    firma_url = emisora.firma.url if (emisora and emisora.firma) else None
    responsable = emisora.responsable if (emisora and emisora.responsable) else "Socio/Gerente"
    cargo = emisora.cargo if (emisora and emisora.cargo) else ""
    razon_social = (emisora.razon_social or emisora.nombre) if emisora else (reg.propietario or reg.entidadinterna or "")

    entidad_bia = Entidad.objects.filter(nombre__iexact="BIA").first()
    entidad_otras = None
    if emisora:
        if "bia" in emisora.nombre.lower():
            entidad_bia = emisora
        else:
            entidad_otras = emisora

    context = {
        "client": reg,
        "firma_url": firma_url,
        "responsable": responsable,
        "cargo": cargo,
        "entidad_firma": razon_social,
        "entidad_bia": entidad_bia,
        "entidad_otras": entidad_otras,
    }

    html = render_to_string("pdf_template.html", context)
    pdf_bytes = generate_pdf(html)
    if not pdf_bytes:
        return cert, None, "Falló la generación del PDF para el certificado."

    try:
        filename = f"certificado_{reg.id_pago_unico}.pdf"
        cert.pdf_file.save(filename, ContentFile(pdf_bytes), save=True)
    except Exception as e:
        logger.exception("[_render_pdf_for_registro] Error guardando PDF: %s", e)
        # devolvemos igual los bytes
        return cert, pdf_bytes, "No se pudo persistir el PDF, pero se generó en memoria."

    return cert, pdf_bytes, None

# ======================================================================================
# Consulta unificada por DNI (pública)
# ======================================================================================

def _supports_distinct_on() -> bool:
    # Si NO es PostgreSQL, evitamos .distinct("campo")
    return connection.vendor == "postgresql"

def _query_unicas_por_id(dni: str):
    """
    Devuelve queryset de filas representativas únicas por id_pago_unico.
    En PostgreSQL usa DISTINCT ON; si no, hace fallback a una subquery.
    """
    order_fields = ("id_pago_unico", "-ultima_fecha_pago", "-fecha_plan", "-fecha_apertura")

    if _supports_distinct_on():
        return (
            BaseDeDatosBia.objects
            .filter(dni=dni)
            .order_by(*order_fields)
            .distinct("id_pago_unico")
        )

    # Fallback genérico (no-Postgres): elegir la última por fechas. Puede ser más costoso.
    # Nota: si usás SIEMPRE Postgres, esto no se ejecuta.
    ids = (
        BaseDeDatosBia.objects
        .filter(dni=dni)
        .values_list("id_pago_unico", flat=True)
        .distinct()
    )
    # Traemos todas esas deudas y ordenamos en memoria (controlado por page_size después)
    # Para evitar memoria, podrías hacer un join/subquery más complejo; aquí priorizamos robustez.
    todas = list(
        BaseDeDatosBia.objects.filter(dni=dni, id_pago_unico__in=list(ids))
        .order_by(*order_fields)
    )
    # Elegimos la primera ocurrencia por id_pago_unico en ese orden
    seen = set()
    out: List[BaseDeDatosBia] = []
    for r in todas:
        if r.id_pago_unico in seen:
            continue
        seen.add(r.id_pago_unico)
        out.append(r)
    # Devolvemos una lista “queryset-like” (iterable)
    return out

@api_view(["GET"])
@permission_classes([AllowAny])
def api_consulta_dni_unificada(request: HttpRequest):
    """
    GET /api/certificado/consulta/dni/?dni=<DNI>[&page=1&page_size=50]

    Devuelve TODAS las obligaciones únicas por id_pago_unico (canceladas y no) para el DNI.
    Cada ítem incluye 'cancelado' para que el front decida si mostrar botón de PDF.

    Respuesta:
    {
      "dni": "12345678",
      "estado_global": "pendiente|varios_cancelados|solo_cancelados|sin_resultados",
      "resumen": {...},
      "paginacion": {"page":1,"page_size":50,"total":123},
      "deudas": [ {...}, ... ]
    }
    """
    raw = request.GET.get("dni") or ""
    dni = _norm_dni(raw)
    if not _ok_dni(dni):
        return Response({"error": "dni inválido"}, status=status.HTTP_400_BAD_REQUEST)

    # Paginación defensiva
    try:
        page = max(1, int(request.GET.get("page", "1")))
    except Exception:
        page = 1
    try:
        page_size_req = int(request.GET.get("page_size", DEFAULT_PAGE_SIZE))
        page_size = min(MAX_PAGE_SIZE, max(1, page_size_req))
    except Exception:
        page_size = DEFAULT_PAGE_SIZE

    # Query “única por id_pago_unico”
    base = _query_unicas_por_id(dni)
    # Para contar total:
    total = (base.count() if hasattr(base, "count") else len(base))

    # Slice de paginado
    start = (page - 1) * page_size
    end = start + page_size
    subset = (base[start:end] if hasattr(base, "__getitem__") else list(base)[start:end])

    deudas = []
    canceladas = 0
    for r in subset:
        item = {
            "id": r.id,
            "id_pago_unico": r.id_pago_unico,
            "dni": r.dni,
            "nombre_apellido": r.nombre_apellido,
            "propietario": r.propietario,
            "entidadinterna": r.entidadinterna,
            "entidadoriginal": r.entidadoriginal,
            "estado": r.estado,
            "saldo_actualizado": getattr(r, "saldo_actualizado", None),
            "saldo_exigible": getattr(r, "saldo_exigible", None),
            "cancel_min": getattr(r, "cancel_min", None),
            "ultima_fecha_pago": getattr(r, "ultima_fecha_pago", None),
            "fecha_plan": getattr(r, "fecha_plan", None),
            "fecha_apertura": getattr(r, "fecha_apertura", None),
            "cancelado": _is_cancelado(r),
        }
        if item["cancelado"]:
            canceladas += 1
        deudas.append(item)

    # Resumen global (sobre todas las únicas, no solo la página)
    # Para no cargar toda la tabla, si estamos en Postgres se puede computar eficiente;
    # aquí, por simplicidad y robustez, consultamos contando por estado a nivel BD.
    total_en_bd = BaseDeDatosBia.objects.filter(dni=dni).count()
    # Estimaciones: si total==0, es sin_resultados. Si hay al menos 1 cancelado en total, "varios_cancelados" o "solo_cancelados"
    # Para precisión, recalculamos canceladas reales en todas las únicas (con pequeña sobrecarga aceptable).
    if total > 0:
        # Conteo canceladas únicas (sin paginar)
        if _supports_distinct_on():
            total_canceladas_unicas = (
                BaseDeDatosBia.objects.filter(dni=dni, estado__iexact="cancelado")
                .order_by("id_pago_unico", "-ultima_fecha_pago", "-fecha_plan", "-fecha_apertura")
                .distinct("id_pago_unico")
                .count()
            )
        else:
            # Fallback: contamos en memoria
            base_all = _query_unicas_por_id(dni)
            total_canceladas_unicas = sum(1 for r in (base_all if isinstance(base_all, list) else list(base_all)) if _is_cancelado(r))
    else:
        total_canceladas_unicas = 0

    total_no_canceladas_unicas = total - total_canceladas_unicas

    if total == 0:
        estado_global = BUSINESS["SIN_RESULTADOS"]
    elif total_canceladas_unicas == 0:
        estado_global = BUSINESS["PENDIENTE"]
    elif total_no_canceladas_unicas == 0:
        estado_global = BUSINESS["SOLO_CANCELADOS"]
    else:
        estado_global = BUSINESS["VARIOS_CANCELADOS"]

    payload = {
        "dni": dni,
        "estado_global": estado_global,
        "resumen": {
            "total_deudas_en_bd": total_en_bd,
            "deudas_unicas_por_id": total,
            "canceladas": total_canceladas_unicas,
            "no_canceladas": total_no_canceladas_unicas,
        },
        "paginacion": {
            "page": page,
            "page_size": page_size,
            "total": total,
        },
        "deudas": deudas,
    }
    return Response(payload, status=200)

# ======================================================================================
# Selección HTML (interna)
# ======================================================================================

@login_required
def seleccionar_certificado(request: HttpRequest) -> HttpResponse:
    if not (request.user.is_superuser or request.user.has_perm("carga_datos.can_view_clients")):
        raise PermissionDenied("No autorizado")

    dni = _norm_dni(request.GET.get("dni") or "")
    if not _ok_dni(dni):
        return render(
            request,
            "certificado_seleccionar.html",
            {"dni": "", "cancelados": [], "pendientes": [], "mensaje": "Debe indicar un DNI válido."},
            status=400,
        )

    registros = BaseDeDatosBia.objects.filter(dni=dni)
    if not registros.exists():
        return render(
            request,
            "certificado_seleccionar.html",
            {"dni": dni, "cancelados": [], "pendientes": [], "mensaje": "No se encontraron registros para el DNI ingresado."},
            status=200,
        )

    cancelados = [r for r in registros if _is_cancelado(r)]
    pendientes = [r for r in registros if not _is_cancelado(r)]

    if not cancelados:
        return render(
            request,
            "certificado_seleccionar.html",
            {"dni": dni, "cancelados": [], "pendientes": pendientes, "mensaje": "No hay obligaciones canceladas para imprimir."},
            status=200,
        )

    return render(
        request,
        "certificado_seleccionar.html",
        {"dni": dni, "cancelados": cancelados, "pendientes": pendientes, "mensaje": ""},
        status=200,
    )

# ======================================================================================
# Generar certificado (PDF/JSON) – público
# ======================================================================================

@csrf_exempt
@allow_public
def api_generar_certificado(request: HttpRequest) -> HttpResponse:
    # Si está autenticado, exigimos permiso interno de lectura (no rompe público anónimo)
    if request.user.is_authenticated:
        if not (request.user.is_superuser or request.user.has_perm("carga_datos.can_view_clients")):
            raise PermissionDenied("No autorizado")

    method = request.method.upper()
    if method == "GET":
        return _handle_get_generar(request)
    if method == "POST":
        return _handle_post_generar(request)
    return JsonResponse({"error": "Método no permitido. Use GET o POST."}, status=405)

def _handle_get_generar(request: HttpRequest) -> HttpResponse:
    dni = _norm_dni(request.GET.get("dni") or "")
    idp = (request.GET.get("id_pago_unico") or request.GET.get("idp") or "").strip()

    if not idp:
        return JsonResponse({"error": "Debe indicar id_pago_unico en la URL (GET).", "dni": dni, "id_pago_unico": idp}, status=400)

    qs = BaseDeDatosBia.objects.filter(id_pago_unico=idp)
    if dni:
        qs = qs.filter(dni=dni)

    reg = qs.first()
    if not reg:
        return JsonResponse(
            {"estado": BUSINESS["SIN_RESULTADOS"], "mensaje": "Registro no encontrado para los parámetros indicados.", "dni": dni, "id_pago_unico": idp},
            status=200,
        )

    if not _is_cancelado(reg):
        return JsonResponse(
            {"estado": BUSINESS["PENDIENTE"], "mensaje": "La obligación seleccionada no está cancelada y no puede emitirse certificado.",
             "dni": dni, "id_pago_unico": idp, "deuda": _row_minimal(reg)},
            status=200,
        )

    cert, pdf_bytes, err = _render_pdf_for_registro(reg)
    if not pdf_bytes:
        return JsonResponse({"estado": "error", "mensaje": err or "No se pudo generar el PDF."}, status=500)

    resp = HttpResponse(pdf_bytes, content_type="application/pdf")
    resp["Content-Disposition"] = f'attachment; filename="certificado_{reg.id_pago_unico}.pdf"'
    return resp

def _handle_post_generar(request: HttpRequest) -> HttpResponse:
    dni = _norm_dni(request.POST.get("dni") or "")
    idp = (request.POST.get("id_pago_unico") or request.POST.get("idp") or "").strip()
    prefer_html = (request.POST.get("prefer_html") or "").strip().lower() in ("1", "true")
    is_ajax = _is_ajax(request)

    # Caso 1: id específico
    if idp:
        qs = BaseDeDatosBia.objects.filter(id_pago_unico=idp)
        if dni:
            qs = qs.filter(dni=dni)

        reg = qs.first()
        if not reg:
            return JsonResponse(
                {"estado": BUSINESS["SIN_RESULTADOS"], "mensaje": "Registro no encontrado para el id_pago_unico indicado.", "dni": dni, "id_pago_unico": idp},
                status=200,
            )

        if not _is_cancelado(reg):
            return JsonResponse(
                {"estado": BUSINESS["PENDIENTE"], "mensaje": "La obligación seleccionada no está cancelada y no puede emitirse certificado.",
                 "dni": dni, "id_pago_unico": idp, "deuda": _row_minimal(reg)},
                status=200,
            )

        cert, pdf_bytes, err = _render_pdf_for_registro(reg)
        if not pdf_bytes:
            return JsonResponse({"estado": "error", "mensaje": err or "No se pudo generar el PDF."}, status=500)

        resp = HttpResponse(pdf_bytes, content_type="application/pdf")
        resp["Content-Disposition"] = f'attachment; filename="certificado_{reg.id_pago_unico}.pdf"'
        return resp

    # Caso 2: solo DNI
    if not _ok_dni(dni):
        return JsonResponse({"error": "Ingresá un DNI válido (solo números)."}, status=400)

    registros = BaseDeDatosBia.objects.filter(dni=dni)
    if not registros.exists():
        return JsonResponse(
            {"estado": BUSINESS["SIN_RESULTADOS"], "mensaje": f"No hay registros para DNI {dni}.", "dni": dni},
            status=200,
        )

    cancelados = [r for r in registros if _is_cancelado(r)]
    pendientes = [r for r in registros if not _is_cancelado(r)]

    if not cancelados:
        return JsonResponse(
            {"estado": BUSINESS["PENDIENTE"], "mensaje": "No se registran deudas canceladas para el DNI ingresado.",
             "dni": dni, "deudas": [_row_minimal(r) for r in pendientes]},
            status=200,
        )

    if len(cancelados) > 1:
        seleccionar_url = request.build_absolute_uri(reverse("certificado_ldd:certificado_seleccionar") + f"?dni={dni}")
        certificados_meta = [
            {"id_pago_unico": r.id_pago_unico, "propietario": r.propietario, "entidadinterna": r.entidadinterna}
            for r in cancelados
        ]
        payload = {
            "estado": BUSINESS["VARIOS_CANCELADOS"],
            "mensaje": "Seleccioná un id_pago_unico.",
            "dni": dni,
            "opciones": certificados_meta,
            "certificados": certificados_meta,
            "seleccionar_url": seleccionar_url,
        }
        # seguimos devolviendo JSON (el front lo espera), ignoramos prefer_html para simplificar
        return JsonResponse(payload, status=200)

    # Exactamente 1 cancelado → PDF directo
    reg = cancelados[0]
    cert, pdf_bytes, err = _render_pdf_for_registro(reg)
    if not pdf_bytes:
        return JsonResponse({"estado": "error", "mensaje": err or "No se pudo generar el PDF."}, status=500)

    resp = HttpResponse(pdf_bytes, content_type="application/pdf")
    resp["Content-Disposition"] = f'attachment; filename="certificado_{reg.id_pago_unico}.pdf"'
    return resp

# ======================================================================================
# Entidades (CRUD) – interno
# ======================================================================================

class EntidadViewSet(viewsets.ModelViewSet):
    queryset = Entidad.objects.all().order_by("id")
    serializer_class = EntidadSerializer
    permission_classes = [IsAuthenticated, CanManageEntities]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["id", "nombre", "responsable"]
    ordering = ["id"]

# ======================================================================================
# Health check
# ======================================================================================

@api_view(["GET"])
@permission_classes([AllowAny])
def ping(_request: HttpRequest):
    return Response({"ok": True, "app": "certificado_ldd"}, status=200)
