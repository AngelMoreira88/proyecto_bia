# certificado_ldd/views.py
"""
Vistas para emisión de Certificados de Libre Deuda.

- selector HTML: GET /api/certificado/seleccionar/?dni=<dni>
- generador PDF:
    * GET  /api/certificado/generar/?id_pago_unico=<id>[&dni=<dni>]   (uso directo por botón/enlace por fila)
    * POST /api/certificado/generar/                                   (form con dni + id_pago_unico o solo dni)

Notas de diseño (nivel alto):
- Mantengo flujos separados para GET y POST, con logs detallados en cada decisión.
- Se valida que el registro esté en estado CANCELADO (case-insensitive).
- El PDF se cachea en Certificate.pdf_file (si existe y el archivo está en disco, se reutiliza).
- xhtml2pdf requiere paths físicos para imágenes; se usa link_callback.
"""

from __future__ import annotations

import logging
import os
from io import BytesIO
from typing import Optional, Dict, Any, Tuple

from django.conf import settings
from django.core.files.base import ContentFile
from django.http import (
    HttpRequest,
    HttpResponse,
    JsonResponse,
)
from django.shortcuts import render
from django.template.loader import render_to_string
from django.urls import reverse
from django.views.decorators.csrf import csrf_exempt

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from xhtml2pdf import pisa

from carga_datos.models import BaseDeDatosBia
from .models import Certificate, Entidad
from .serializers import EntidadSerializer

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def _is_ajax(request: HttpRequest) -> bool:
    """
    Detecta llamadas hechas vía fetch/XMLHttpRequest.
    """
    return (request.headers.get("X-Requested-With") == "XMLHttpRequest") or (
        request.META.get("HTTP_X_REQUESTED_WITH") == "XMLHttpRequest"
    )

# ====== CAMBIO: helpers seguros para FieldFile ======
def _fieldfile_exists(ff) -> bool:
    """
    Devuelve True si el FieldFile tiene nombre y el storage confirma su existencia.
    Evita usar .path (que dispara _require_file cuando no hay archivo).
    """
    if not ff or not getattr(ff, "name", ""):
        return False
    try:
        return ff.storage.exists(ff.name)
    except Exception:
        return False

def _open_fieldfile(ff, mode="rb"):
    """
    Abre un FieldFile a través del storage subyacente (FS, S3, etc.), sin tocar .path.
    """
    return ff.storage.open(ff.name, mode)


# ---------------------------------------------------------------------------
# Utilidades PDF / Rutas de STATIC & MEDIA para xhtml2pdf
# ---------------------------------------------------------------------------

def link_callback(uri: str, rel: str) -> str:
    """
    Traduce URIs que comienzan con STATIC_URL o MEDIA_URL a rutas absolutas en disco.
    xhtml2pdf NO resuelve bien URLs relativas o remotas.

    Levanta Exception con mensaje claro si no encuentra el recurso.
    """
    s_url = settings.STATIC_URL
    s_root = getattr(settings, "STATIC_ROOT", None)
    s_dirs = list(getattr(settings, "STATICFILES_DIRS", []))
    m_url = getattr(settings, "MEDIA_URL", None)
    m_root = getattr(settings, "MEDIA_ROOT", None)

    # STATIC
    if s_url and uri.startswith(s_url):
        relpath = uri.replace(s_url, "", 1)
        # 1) STATIC_ROOT (post-collectstatic)
        if s_root:
            candidate = os.path.join(s_root, relpath)
            if os.path.exists(candidate):
                return candidate
        # 2) STATICFILES_DIRS (desarrollo)
        for d in s_dirs:
            candidate = os.path.join(d, relpath)
            if os.path.exists(candidate):
                return candidate
        raise Exception(f"[link_callback] Archivo estático no encontrado: {relpath}")

    # MEDIA
    if m_url and uri.startswith(m_url):
        relpath = uri.replace(m_url, "", 1)
        if m_root:
            candidate = os.path.join(m_root, relpath)
            if os.path.exists(candidate):
                return candidate
        raise Exception(f"[link_callback] Archivo media no encontrado: {relpath}")

    # Permitir rutas absolutas/URLs si son válidas
    return uri


def generate_pdf(html: str) -> Optional[bytes]:
    """
    Renderiza HTML → PDF (bytes) con xhtml2pdf.
    Devuelve None si hubo error (y loguea).
    """
    logger.debug("[generate_pdf] Iniciando render HTML->PDF (len(html)=%s)", len(html))
    buf = BytesIO()
    result = pisa.CreatePDF(html, dest=buf, link_callback=link_callback, encoding="utf-8")
    if result.err:
        logger.error("[generate_pdf] Error xhtml2pdf (result.err=%s)", result.err)
        return None
    pdf_bytes = buf.getvalue()
    logger.debug("[generate_pdf] PDF generado OK (%d bytes)", len(pdf_bytes))
    return pdf_bytes


# ---------------------------------------------------------------------------
# Helpers de negocio
# ---------------------------------------------------------------------------

def _is_cancelado(reg: BaseDeDatosBia) -> bool:
    """
    Regla: se considera cancelado si estado == 'cancelado' (case-insensitive).
    """
    estado = (reg.estado or "").strip().lower()
    is_ok = estado == "cancelado"
    logger.debug("[_is_cancelado] id=%s estado=%s -> %s", reg.id_pago_unico, estado, is_ok)
    return is_ok


def _row_minimal(reg: BaseDeDatosBia) -> Dict[str, Any]:
    """
    Resumen mínimo de un registro, útil para payloads JSON.
    """
    data = {
        "dni": reg.dni,
        "id_pago_unico": reg.id_pago_unico,
        "propietario": reg.propietario,
        "entidadinterna": reg.entidadinterna,
        "estado": reg.estado,
    }
    logger.debug("[_row_minimal] %s", data)
    return data


def get_entidad_emisora(registro: BaseDeDatosBia) -> Optional[Entidad]:
    """
    Lógica para determinar la entidad emisora:
    1) Intentar por PROPIETARIO
    2) Si no, por ENTIDAD INTERNA
    """
    propietario = (registro.propietario or "").strip()
    interna = (registro.entidadinterna or "").strip()

    ent = None
    if propietario:
        ent = Entidad.objects.filter(nombre__iexact=propietario).first()
    if not ent and interna:
        ent = Entidad.objects.filter(nombre__iexact=interna).first()

    logger.debug(
        "[get_entidad_emisora] id=%s propietario=%r interna=%r -> emisora=%s",
        registro.id_pago_unico,
        propietario,
        interna,
        getattr(ent, "nombre", None),
    )
    return ent


def _render_pdf_for_registro(reg: BaseDeDatosBia) -> Tuple[Optional[Certificate], Optional[bytes], Optional[str]]:
    """
    Genera (o recupera) el PDF para un registro CANCELADO.
    Devuelve (cert_instance, pdf_bytes, error_msg). Si ya existe, se lee desde el storage.
    """
    logger.info("[_render_pdf_for_registro] Preparando PDF para id_pago_unico=%s", reg.id_pago_unico)

    # Obtener o crear certificado
    cert, created = Certificate.objects.get_or_create(client=reg)

    # ====== CAMBIO: reuso seguro del PDF cacheado (sin usar .path) ======
    if _fieldfile_exists(cert.pdf_file):
        try:
            with _open_fieldfile(cert.pdf_file, "rb") as fh:
                cached_bytes = fh.read()
            logger.info("[_render_pdf_for_registro] PDF existente reutilizado (%d bytes)", len(cached_bytes))
            return cert, cached_bytes, None
        except Exception as e:
            logger.exception("[_render_pdf_for_registro] Error leyendo PDF existente desde storage: %s", e)
            # forzaremos regeneración a continuación
    else:
        # Si había nombre pero el archivo no existe realmente, limpiamos la referencia huérfana
        if getattr(cert.pdf_file, "name", ""):
            logger.warning(
                "[_render_pdf_for_registro] pdf_file apunta a '%s' pero no existe en storage; se limpia.",
                cert.pdf_file.name,
            )
            cert.pdf_file.delete(save=False)

    # Preparar contexto para plantilla
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
            entidad_otras = None
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
    logger.debug("[_render_pdf_for_registro] Contexto plantilla: keys=%s", list(context.keys()))

    # Render HTML
    html = render_to_string("pdf_template.html", context)
    logger.debug("[_render_pdf_for_registro] HTML renderizado (len=%s)", len(html))

    # Generar PDF
    pdf_bytes = generate_pdf(html)
    if not pdf_bytes:
        logger.error("[_render_pdf_for_registro] Falló la generación del PDF (xhtml2pdf)")
        return cert, None, "Falló la generación del PDF para el certificado."

    # Guardar en el FileField
    try:
        # Podés moverlo a una carpeta lógica si querés: p.ej. "certificados/..."
        filename = f"certificado_{reg.id_pago_unico}.pdf"
        cert.pdf_file.save(filename, ContentFile(pdf_bytes), save=True)
        logger.info("[_render_pdf_for_registro] PDF guardado como %s", filename)
    except Exception as e:
        logger.exception("[_render_pdf_for_registro] Error guardando PDF: %s", e)
        # Si no se pudo guardar, igualmente devolver los bytes para descargar
        return cert, pdf_bytes, "No se pudo persistir el PDF, pero se generó en memoria."

    return cert, pdf_bytes, None


# ---------------------------------------------------------------------------
# Vistas HTML
# ---------------------------------------------------------------------------

def seleccionar_certificado(request: HttpRequest) -> HttpResponse:
    """
    GET /api/certificado/seleccionar/?dni=<dni>
    Lista las obligaciones del DNI, separando CANCELADO vs otras.
    Ofrece radios y botón por fila (GET) + botón de envío (POST).
    """
    dni = (request.GET.get("dni") or "").strip()
    logger.info("[seleccionar_certificado] GET dni=%r", dni)

    if not dni:
        logger.warning("[seleccionar_certificado] Falta DNI")
        return render(
            request,
            "certificado_seleccionar.html",
            {"dni": "", "cancelados": [], "pendientes": [], "mensaje": "Debe indicar un DNI válido."},
            status=400,
        )

    registros = BaseDeDatosBia.objects.filter(dni=dni)
    if not registros.exists():
        logger.info("[seleccionar_certificado] No hay registros para DNI=%s", dni)
        return render(
            request,
            "certificado_seleccionar.html",
            {
                "dni": dni,
                "cancelados": [],
                "pendientes": [],
                "mensaje": "No se encontraron registros para el DNI ingresado.",
            },
            status=404,
        )

    cancelados = [r for r in registros if _is_cancelado(r)]
    pendientes = [r for r in registros if not _is_cancelado(r)]
    logger.debug(
        "[seleccionar_certificado] DNI=%s -> cancelados=%d pendientes=%d",
        dni, len(cancelados), len(pendientes)
    )

    if not cancelados:
        return render(
            request,
            "certificado_seleccionar.html",
            {
                "dni": dni,
                "cancelados": [],
                "pendientes": pendientes,
                "mensaje": "No hay obligaciones canceladas para imprimir.",
            },
            status=200,
        )

    return render(
        request,
        "certificado_seleccionar.html",
        {"dni": dni, "cancelados": cancelados, "pendientes": pendientes, "mensaje": ""},
        status=200,
    )


# ---------------------------------------------------------------------------
# API de generación (PDF)
# ---------------------------------------------------------------------------

@csrf_exempt
def api_generar_certificado(request: HttpRequest) -> HttpResponse:
    """
    Generador de certificados.

    - GET:
        * Requiere id_pago_unico (opcionalmente dni para mayor restricción).
        * Uso principal: botón/enlace por fila en la página de selección.
    - POST (form-data):
        * Acepta:
            - id_pago_unico (+ opcional dni)  -> genera ese certificado
            - solo dni                        -> si hay 1 cancelado, lo genera; si hay >1, devuelve JSON con URL de selección.
        * Campo opcional prefer_html=1 para preferir URL de selección en caso de múltiples cancelados.
    """
    method = request.method.upper()
    logger.info("[api_generar_certificado] method=%s", method)

    if method == "GET":
        return _handle_get_generar(request)

    if method == "POST":
        return _handle_post_generar(request)

    logger.warning("[api_generar_certificado] Método no permitido: %s", method)
    return JsonResponse({"error": "Método no permitido. Use GET o POST."}, status=405)


def _handle_get_generar(request: HttpRequest) -> HttpResponse:
    """
    GET: requiere id_pago_unico; puede incluir dni.
    Devuelve PDF adjunto o JSON de error/pendiente.
    """
    dni = (request.GET.get("dni") or "").strip()
    idp = (request.GET.get("id_pago_unico") or request.GET.get("idp") or "").strip()
    logger.info("[_handle_get_generar] GET dni=%r id_pago_unico=%r", dni, idp)

    if not idp:
        logger.warning("[_handle_get_generar] Falta id_pago_unico en GET")
        return JsonResponse(
            {"error": "Debe indicar id_pago_unico en la URL (GET).", "dni": dni, "id_pago_unico": idp},
            status=400,
        )

    qs = BaseDeDatosBia.objects.filter(id_pago_unico=idp)
    if dni:
        qs = qs.filter(dni=dni)

    reg = qs.first()
    if not reg:
        logger.warning("[_handle_get_generar] Registro no encontrado (dni=%r, idp=%r)", dni, idp)
        return JsonResponse(
            {"estado": "error", "mensaje": "Registro no encontrado para los parámetros indicados.", "dni": dni, "id_pago_unico": idp},
            status=404,
        )

    if not _is_cancelado(reg):
        logger.info("[_handle_get_generar] Registro no cancelado (estado=%r)", reg.estado)
        return JsonResponse(
            {
                "estado": "pendiente",
                "mensaje": "La obligación seleccionada no está cancelada y no puede emitirse certificado.",
                "dni": dni,
                "id_pago_unico": idp,
                "deuda": _row_minimal(reg),
            },
            status=400,
        )

    cert, pdf_bytes, err = _render_pdf_for_registro(reg)
    if not pdf_bytes:
        logger.error("[_handle_get_generar] Falló generar/obtener PDF (err=%r)", err)
        return JsonResponse({"estado": "error", "mensaje": err or "No se pudo generar el PDF."}, status=500)

    # Entregar descarga
    resp = HttpResponse(pdf_bytes, content_type="application/pdf")
    resp["Content-Disposition"] = f'attachment; filename="certificado_{reg.id_pago_unico}.pdf"'
    logger.info("[_handle_get_generar] PDF entregado id=%s (%d bytes)", reg.id_pago_unico, len(pdf_bytes))
    return resp


def _handle_post_generar(request: HttpRequest) -> HttpResponse:
    """
    POST: acepta:
        - id_pago_unico (+ opcional dni)  -> genera/entrega el PDF de ese registro.
        - solo dni                        -> según cantidad de CANCELADOS:
            * 0 -> JSON informando pendientes
            * 1 -> PDF directo
            * >1 -> (AJAX) JSON 400 con opciones / (no-AJAX) JSON con seleccionar_url
    """
    dni = (request.POST.get("dni") or "").strip()
    idp = (request.POST.get("id_pago_unico") or request.POST.get("idp") or "").strip()
    prefer_html = (request.POST.get("prefer_html") or "").strip() in ("1", "true", "True")
    is_ajax = _is_ajax(request)

    # <<< MINI-LOG AQUÍ >>>
    logger.info(
        "[_handle_post_generar] hdr X-Requested-With=%r Accept=%r Content-Type=%r Referer=%r UA=%r",
        request.headers.get("X-Requested-With"),
        request.headers.get("Accept"),
        request.headers.get("Content-Type"),
        request.headers.get("Referer"),
        request.headers.get("User-Agent"),
    )
    # <<< FIN MINI-LOG >>>

    logger.info("[_handle_post_generar] POST dni=%r id_pago_unico=%r prefer_html=%s is_ajax=%s", dni, idp, prefer_html, is_ajax)

    # Caso 1: id específico
    if idp:
        qs = BaseDeDatosBia.objects.filter(id_pago_unico=idp)
        if dni:
            qs = qs.filter(dni=dni)

        reg = qs.first()
        if not reg:
            logger.warning("[_handle_post_generar] Registro no encontrado para idp=%r (dni=%r)", idp, dni)
            return JsonResponse(
                {"estado": "error", "mensaje": "Registro no encontrado para el id_pago_unico indicado.", "dni": dni, "id_pago_unico": idp},
                status=404,
            )

        if not _is_cancelado(reg):
            logger.info("[_handle_post_generar] Registro no cancelado (estado=%r)", reg.estado)
            return JsonResponse(
                {
                    "estado": "pendiente",
                    "mensaje": "La obligación seleccionada no está cancelada y no puede emitirse certificado.",
                    "dni": dni,
                    "id_pago_unico": idp,
                    "deuda": _row_minimal(reg),
                },
                status=400,
            )

        cert, pdf_bytes, err = _render_pdf_for_registro(reg)
        if not pdf_bytes:
            logger.error("[_handle_post_generar] Falló generar/obtener PDF (err=%r)", err)
            return JsonResponse({"estado": "error", "mensaje": err or "No se pudo generar el PDF."}, status=500)

        resp = HttpResponse(pdf_bytes, content_type="application/pdf")
        resp["Content-Disposition"] = f'attachment; filename="certificado_{reg.id_pago_unico}.pdf"'
        logger.info("[_handle_post_generar] PDF entregado id=%s (%d bytes)", reg.id_pago_unico, len(pdf_bytes))
        return resp

    # Caso 2: solo DNI (sin idp) → determinar por cantidad de cancelados
    if not dni:
        logger.warning("[_handle_post_generar] Falta DNI en POST sin id_pago_unico")
        return JsonResponse({"error": "Debe ingresar un DNI o un id_pago_unico."}, status=400)

    registros = BaseDeDatosBia.objects.filter(dni=dni)
    if not registros.exists():
        logger.info("[_handle_post_generar] No hay registros para DNI=%s", dni)
        return JsonResponse({"error": "No se encontraron registros para el DNI ingresado.", "dni": dni}, status=404)

    cancelados = [r for r in registros if _is_cancelado(r)]
    pendientes = [r for r in registros if not _is_cancelado(r)]
    logger.debug("[_handle_post_generar] DNI=%s -> cancelados=%d pendientes=%d", dni, len(cancelados), len(pendientes))

    if not cancelados:
        logger.info("[_handle_post_generar] Sin cancelados, devolviendo lista de pendientes")
        return JsonResponse(
            {
                "estado": "pendiente",
                "mensaje": "No se registran deudas canceladas para el DNI ingresado.",
                "dni": dni,
                "deudas": [_row_minimal(r) for r in pendientes],
            },
            status=200,
        )

    if len(cancelados) > 1:
        seleccionar_url = request.build_absolute_uri(reverse("certificado_ldd:certificado_seleccionar") + f"?dni={dni}")
        logger.info("[_handle_post_generar] Múltiples cancelados. is_ajax=%s seleccionar_url=%s", is_ajax, seleccionar_url)

        if is_ajax:
            certificados_meta = [
                {"id_pago_unico": r.id_pago_unico, "propietario": r.propietario, "entidadinterna": r.entidadinterna}
                for r in cancelados
            ]
            return JsonResponse(
                {
                    "estado": "varios_cancelados",
                    "mensaje": "Seleccioná un id_pago_unico.",
                    "dni": dni,
                    "opciones": certificados_meta,
                },
                status=400,
            )

        if prefer_html or ("text/html" in (request.headers.get("Accept") or "")):
            return JsonResponse(
                {
                    "estado": "varios_cancelados",
                    "mensaje": "El DNI tiene múltiples obligaciones canceladas. Seleccione una.",
                    "dni": dni,
                    "seleccionar_url": seleccionar_url,
                },
                status=200,
            )

        certificados_meta = [
            {"id_pago_unico": r.id_pago_unico, "propietario": r.propietario, "entidadinterna": r.entidadinterna}
            for r in cancelados
        ]
        return JsonResponse(
            {
                "estado": "varios_cancelados",
                "mensaje": "El DNI tiene múltiples obligaciones canceladas. Seleccione una.",
                "dni": dni,
                "certificados": certificados_meta,
                "seleccionar_url": seleccionar_url,
            },
            status=200,
        )

    # Exactamente 1 cancelado → generar directo
    reg = cancelados[0]
    cert, pdf_bytes, err = _render_pdf_for_registro(reg)
    if not pdf_bytes:
        logger.error("[_handle_post_generar] Falló generar/obtener PDF (err=%r)", err)
        return JsonResponse({"estado": "error", "mensaje": err or "No se pudo generar el PDF."}, status=500)

    resp = HttpResponse(pdf_bytes, content_type="application/pdf")
    resp["Content-Disposition"] = f'attachment; filename="certificado_{reg.id_pago_unico}.pdf"'
    logger.info("[_handle_post_generar] PDF entregado id=%s (%d bytes)", reg.id_pago_unico, len(pdf_bytes))
    return resp


# ---------------------------------------------------------------------------
# API Entidades (CRUD)
# ---------------------------------------------------------------------------

class EntidadViewSet(viewsets.ModelViewSet):
    queryset = Entidad.objects.all().order_by("nombre")
    serializer_class = EntidadSerializer
    permission_classes = [IsAuthenticated]
