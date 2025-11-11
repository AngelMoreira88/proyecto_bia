# certificado_ldd/views.py
"""
Vistas para emisión de Certificados de Libre Deuda (ReportLab-Only, Azure-ready).
Prefijo de app en urls.py: /api/certificado/
"""

from __future__ import annotations

import logging
import os
from io import BytesIO
from typing import Optional, Dict, Any, Tuple, List

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import connection
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import render
from django.urls import reverse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied

from rest_framework import viewsets, filters, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response

# ====== MODELOS / PERMISOS PROPIOS ======
from carga_datos.models import BaseDeDatosBia
from carga_datos.permissions import CanManageEntities  # permisos internos
from .models import Certificate, Entidad
from .serializers import EntidadSerializer

# ====== REPORTLAB ======
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Table, TableStyle, Image, Spacer, HRFlowable
)
from reportlab.pdfgen import canvas as canvas_module
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

logger = logging.getLogger(__name__)

# ======================================================================================
# Constantes y helpers básicos
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

# ==== FieldFile helpers (abstractos de storage) ====
def _fieldfile_exists(ff) -> bool:
    if not ff or not getattr(ff, "name", ""):
        return False
    try:
        return ff.storage.exists(ff.name)
    except Exception:
        return False

def _open_fieldfile(ff, mode="rb"):
    return ff.storage.open(ff.name, mode)

# ==== Timestamps y mtimes de storage (para invalidar caché del PDF) ====
def _get_storage_mtime(ff) -> Optional[object]:
    """
    Intenta obtener la fecha de modificación del archivo en el storage.
    Devuelve objeto timezone-aware si el backend lo soporta; si no, None.
    """
    try:
        if not _fieldfile_exists(ff):
            return None
        storage = ff.storage
        if hasattr(storage, "get_modified_time"):
            return storage.get_modified_time(ff.name)
    except Exception as e:
        logger.debug("[_get_storage_mtime] No se pudo leer mtime del storage: %s", e)
    return None

def _get_timestamp_like(obj) -> Optional[object]:
    """
    Devuelve el primer atributo de timestamp disponible, o None.
    Prioridad típica: updated_at, modified, last_modified, created_at, created.
    """
    for attr in ("updated_at", "modified", "last_modified", "created_at", "created"):
        val = getattr(obj, attr, None)
        if val:
            return val
    return None

def _max_ts(*vals) -> Optional[object]:
    """Máximo ignorando None."""
    vals = [v for v in vals if v is not None]
    return max(vals) if vals else None

# ======================================================================================
# ReportLab — Fuentes, imágenes y layout
# ======================================================================================

_FONTS_REGISTERED = False

def _register_fonts_for_azure():
    """
    Registra DejaVuSans / DejaVuSans-Bold si existen; si no, usa Helvetica.
    Colocá los .ttf en <BASE_DIR>/fonts o definí settings.FONT_DIR.
    """
    global _FONTS_REGISTERED
    if _FONTS_REGISTERED:
        return

    font_dir = getattr(settings, "FONT_DIR", os.path.join(getattr(settings, "BASE_DIR", ""), "fonts"))
    regular_ttf = os.path.join(font_dir, "DejaVuSans.ttf")
    bold_ttf = os.path.join(font_dir, "DejaVuSans-Bold.ttf")

    try:
        if os.path.exists(regular_ttf) and os.path.exists(bold_ttf):
            pdfmetrics.registerFont(TTFont("DejaVuSans", regular_ttf))
            pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", bold_ttf))
            logger.info("[PDF] DejaVuSans fonts registered")
        else:
            logger.warning("[PDF] DejaVuSans*.ttf no encontrados; se usará Helvetica por defecto")
        _FONTS_REGISTERED = True
    except Exception as e:
        logger.exception("[PDF] No se pudieron registrar fuentes TTF: %s", e)
        _FONTS_REGISTERED = True  # evitamos retry infinito

def _img_flowable_from_fieldfile(ff, width_cm: float, height_cm: float) -> Optional[Image]:
    """
    Lee bytes de una imagen desde el storage configurado (local, Azure, S3, etc.)
    y devuelve un Flowable Image.
    """
    if not _fieldfile_exists(ff):
        return None
    try:
        with _open_fieldfile(ff, "rb") as fh:
            data = fh.read()
        bio = BytesIO(data)
        img = Image(bio, width=width_cm * cm, height=height_cm * cm)
        img.hAlign = "CENTER"
        return img
    except Exception as e:
        logger.exception("[PDF] No se pudo leer imagen desde storage: %s", e)
        return None

def _safe_text(value, default="-"):
    return str(value) if value not in (None, "") else default

def _draw_header(canvas: canvas_module.Canvas, doc, logo_bia_ff, logo_ent_ff):
    """
    Encabezado del certificado:
      - Si hay entidad externa y BIA: ENTIDAD (izq) + BIA (der)
      - Si solo hay BIA: BIA centrado
      - Si solo hay entidad externa (poco común): centrado
    """
    from reportlab.lib.utils import ImageReader
    canvas.saveState()

    page_w, page_h = A4
    ml = doc.leftMargin
    mr = doc.rightMargin

    # Ajustes de tamaño y posición (fiel al modelo)
    header_box_h = 3.0 * cm
    logo_size   = 2.6 * cm
    gap_below   = 0.35 * cm
    top_y = page_h - doc.topMargin + 8

    def _draw_ff(ff, x, y):
        if not _fieldfile_exists(ff):
            return False
        try:
            with _open_fieldfile(ff, "rb") as fh:
                bio = BytesIO(fh.read())
            img = ImageReader(bio)
            canvas.drawImage(
                img, x, y,
                width=logo_size, height=logo_size,
                preserveAspectRatio=True, mask="auto"
            )
            return True
        except Exception as e:
            logger.warning("[PDF] No se pudo dibujar imagen de header: %s", e)
            return False

    has_bia  = _fieldfile_exists(logo_bia_ff)
    has_ent  = _fieldfile_exists(logo_ent_ff)

    if has_ent and has_bia:
        _draw_ff(logo_ent_ff, ml, top_y - header_box_h)  # ENTIDAD IZQ
        _draw_ff(logo_bia_ff, page_w - mr - logo_size, top_y - header_box_h)  # BIA DER
    elif has_bia and not has_ent:
        x = (page_w - logo_size) / 2.0
        _draw_ff(logo_bia_ff, x, top_y - header_box_h)
    elif has_ent and not has_bia:
        x = (page_w - logo_size) / 2.0
        _draw_ff(logo_ent_ff, x, top_y - header_box_h)

    # Línea fina debajo del header
    canvas.setStrokeColor(colors.HexColor("#DDDDDD"))
    canvas.setLineWidth(0.8)
    y_line = top_y - (header_box_h + gap_below)
    canvas.line(ml, y_line, page_w - mr, y_line)

    canvas.restoreState()

def _draw_footer(canvas: canvas_module.Canvas, doc, footer_text: str = ""):
    canvas.saveState()
    page_width, _ = A4
    margin_h = doc.leftMargin
    y = doc.bottomMargin - 0.8 * cm

    canvas.setStrokeColor(colors.HexColor("#DDDDDD"))
    canvas.setLineWidth(0.6)
    canvas.line(margin_h, y + 0.5 * cm, page_width - margin_h, y + 0.5 * cm)

    canvas.setFont("Helvetica", 8)
    if footer_text:
        canvas.setFillColor(colors.HexColor("#666666"))
        canvas.drawString(margin_h, y, footer_text)

    page_str = f"Página {canvas.getPageNumber()}"
    w = canvas.stringWidth(page_str, "Helvetica", 8)
    canvas.drawString(page_width - margin_h - w, y, page_str)
    canvas.restoreState()

def _page_template(logo_bia_ff, logo_ent_ff, footer_text: str):
    def _page(canvas, doc):
        _draw_header(canvas, doc, logo_bia_ff, logo_ent_ff)
        _draw_footer(canvas, doc, footer_text)
    return _page, _page  # misma para first y later

# ======================================================================================
# Copy por entidad (texto profesional fiel a modelo)
# ======================================================================================

def _select_copy_for_entity(*, entidad_nombre: str | None, has_ent_externa: bool) -> dict:
    """
    Devuelve el copy (texto) y defaults de firma según la entidad emisora.
    - entidad_nombre: nombre normalizado de la entidad emisora (str o None)
    - has_ent_externa: True si hay entidad externa además de BIA (para “administrado por BIA S.R.L.”)
    """
    nombre = (entidad_nombre or "").strip().lower()

    # Base común (con coletilla “administrado por BIA S.R.L.” si aplica)
    base_parrafo1 = (
        "Por medio de la presente se deja constancia que <b>{nombre}</b>, con DNI <b>{dni}</b>, "
        "ha cancelado la deuda que mantenía con <b>{propietario}</b>{admin_bia}, "
        "por el crédito originado en <b>{entidad_original}</b> "
        "(ID de operación <b>{id_operacion}</b>), conforme a los registros internos y comprobantes archivados."
    )
    empresa_parrafo1 = (
        "Por medio de la presente se deja constancia que el Sr/a <b>{nombre}</b>, con DNI <b>{dni}</b>, "
        "ha cancelado la deuda que mantenía con la empresa <b>{propietario}</b>{admin_bia}, "
        "por el crédito originado en <b>{entidad_original}</b>."
    )
    parrafo2 = (
        "Este certificado se expide a solicitud del interesado para los fines que estime convenientes, "
        "sin que implique responsabilidad adicional por parte de la entidad emisora respecto de la veracidad futura de esta información."
    )

    firma_por_entidad = [
        {
            "match": ["azur", "fp azur"],
            "firma": {"nombre": "Administrador / Fiduciario", "cargo": "FP Azur Investment / BIA S.R.L.", "entidad": ""},
            "parrafo1_fmt": empresa_parrafo1,
        },
        {
            "match": ["bia"],
            "firma": {"nombre": "Administrador/Apoderado", "cargo": "", "entidad": "BIA S.R.L."},
            "parrafo1_fmt": base_parrafo1,
        },
        {
            "match": ["cpsa", "carnes pampeanas"],
            "firma": {"nombre": "Federico Lequio", "cargo": "Apoderado", "entidad": "Sociedad Anónima Carnes Pampeanas SA"},
            "parrafo1_fmt": empresa_parrafo1,
        },
        {
            "match": ["egeo"],
            "firma": {"nombre": "Administrador/Apoderado", "cargo": "", "entidad": "EGEO S.A.C.I Y A"},
            "parrafo1_fmt": empresa_parrafo1,
        },
        {
            "match": ["fb líneas aéreas", "fblasa", "fb lineas aereas"],
            "firma": {"nombre": "Hernán Morosuk", "cargo": "Apoderado", "entidad": "FB Líneas Aéreas S.A."},
            "parrafo1_fmt": empresa_parrafo1,
        },
    ]

    selected = None
    for item in firma_por_entidad:
        if any(key in nombre for key in item["match"]):
            selected = item
            break

    if not selected:
        selected = {
            "firma": {"nombre": "Administrador/Apoderado", "cargo": "", "entidad": (entidad_nombre or "BIA")},
            "parrafo1_fmt": base_parrafo1,
        }

    return {
        "ciudad": "Buenos Aires",
        "parrafo1_fmt": selected["parrafo1_fmt"],
        "parrafo2": parrafo2,
        "firma_defaults": selected["firma"],
        "agregar_admin_bia": not has_ent_externa,  # agrega “(administrado por BIA S.R.L.)” si no hay entidad externa
    }

# ======================================================================================
# Builder principal del PDF (homogéneo, formal, profesional)
# ======================================================================================

def _build_pdf_bytes_azure(
    datos: dict,
    *,
    logo_bia_ff,
    logo_ent_ff,
    firma_1: dict | None,
    firma_2: dict | None,
    titulo: str,
    subtitulo: str | None,
    footer_text: str | None
) -> bytes:
    """
    ReportLab (Azure-ready). Reproduce tu HTML/Word:
      - Header: logos (entidad izq. + BIA der; o BIA centrado si único)
      - “Ciudad, Fecha”
      - Cuerpo formal (según entidad; puede incluir “administrado por BIA S.R.L.”)
      - Parrafo de cierre
      - Vigencia (opcional)
      - Firmas (1 o 2) con defaults por entidad si faltan datos en DB
      - Footer con paginación
    """
    _register_fonts_for_azure()

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=2.0 * cm,
        rightMargin=2.0 * cm,
        topMargin=4.0 * cm,      # espacio para encabezado con logos
        bottomMargin=2.2 * cm,
        title=titulo,
        author="BIA",
    )

    # Estilos
    styles = getSampleStyleSheet()
    base_font = "DejaVuSans" if "DejaVuSans" in pdfmetrics.getRegisteredFontNames() else "Helvetica"
    base_bold = "DejaVuSans-Bold" if "DejaVuSans-Bold" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold"

    styles.add(ParagraphStyle(name="Titulo", parent=styles["Heading1"], fontName=base_bold,
                              fontSize=16, alignment=1, spaceAfter=10))
    styles.add(ParagraphStyle(name="Fecha", parent=styles["BodyText"], fontName=base_font,
                              fontSize=10.5, textColor=colors.HexColor("#333333"), alignment=1, spaceAfter=12))
    styles.add(ParagraphStyle(name="Cuerpo", parent=styles["BodyText"], fontName=base_font,
                              fontSize=11, leading=15.5, textColor=colors.HexColor("#111111"), alignment=4, spaceAfter=10))
    styles.add(ParagraphStyle(name="Nota", parent=styles["BodyText"], fontName=base_font,
                              fontSize=10, leading=14, textColor=colors.HexColor("#111111"), alignment=4, spaceBefore=2, spaceAfter=8))
    styles.add(ParagraphStyle(name="FirmaTxt", parent=styles["BodyText"], fontName=base_font,
                              fontSize=9, alignment=1, leading=12))

    elements = []

    # ===== Título =====
    elements.append(Paragraph(_safe_text(titulo), styles["Titulo"]))

    # ===== Ciudad y fecha =====
    from datetime import datetime
    # Preferimos “Fecha de Emisión” (seteada en _render...), fallback a hoy
    fecha_emision = _safe_text(datos.get("Fecha de Emisión")) or datetime.now().strftime("%d/%m/%Y")

    # Nombre de la emisora para ajustar copy/firma y si hay “administrado por BIA”
    ent_nombre = datos.get("Entidad Emisora") or datos.get("Razón Social") or ""
    has_ent_externa = _fieldfile_exists(logo_ent_ff)  # si hay logo externo, no agregamos “administrado por BIA...”
    copy = _select_copy_for_entity(entidad_nombre=ent_nombre, has_ent_externa=has_ent_externa)

    elements.append(Paragraph(f'{copy["ciudad"]}, <b>{fecha_emision}</b>', styles["Fecha"]))

    # ===== Cuerpo (coherente con tu BD) =====
    nombre_apellido = _safe_text(datos.get("Nombre y Apellido"), default="(sin dato)")
    dni_txt = _safe_text(datos.get("DNI"), default="(sin dato)")
    propietario_txt = _safe_text(datos.get("Razón Social"), default="(sin dato)")
    # Prioriza entidadoriginal (fallback entidadinterna ya resuelto en _render_pdf_for_registro)
    entidad_original_txt = _safe_text(datos.get("Entidad Original"), default="(sin dato)")
    id_operacion = _safe_text(datos.get("Número"), default="(sin dato)")

    admin_bia = " (administrado por BIA S.R.L.)" if copy["agregar_admin_bia"] else ""
    parrafo_1 = copy["parrafo1_fmt"].format(
        nombre=nombre_apellido,
        dni=dni_txt,
        propietario=propietario_txt,
        entidad_original=entidad_original_txt,
        id_operacion=id_operacion,
        admin_bia=admin_bia,
    )
    elements.append(Paragraph(parrafo_1, styles["Cuerpo"]))
    elements.append(Paragraph(copy["parrafo2"], styles["Nota"]))

    # ===== Vigencia (opcional) =====
    if datos.get("Vigencia Hasta") or datos.get("vigencia_hasta"):
        vig = datos.get("Vigencia Hasta") or datos.get("vigencia_hasta")
        nota_vig = (
            f"Este certificado es válido hasta <b>{_safe_text(vig)}</b>. "
            "Ante cualquier duda, verificar autenticidad con el área de Administración BIA."
        )
        elements.append(Paragraph(nota_vig, styles["Nota"]))

    # ===== Firmas =====
    def _firma_block(f, defaults):
        if not f:
            f = {}
        blocks = []
        ff = f.get("firma_ff")
        if ff:
            img = _img_flowable_from_fieldfile(ff, 4.8, 2.1)
            if img:
                blocks.append(img)
                blocks.append(Spacer(1, 0.12 * cm))
        # Línea + texto
        blocks.append(HRFlowable(width="75%", color=colors.HexColor("#CCCCCC"), thickness=1))
        blocks.append(Spacer(1, 0.08 * cm))
        texto = "<b>{}</b><br/>{}<br/>{}".format(
            _safe_text(f.get("responsable") or defaults.get("nombre")),
            _safe_text(f.get("cargo") or defaults.get("cargo")),
            _safe_text(f.get("entidad") or defaults.get("entidad")),
        )
        blocks.append(Paragraph(texto, styles["FirmaTxt"]))
        return blocks

    firma_defaults = copy["firma_defaults"]
    f1 = _firma_block(firma_1, firma_defaults)
    f2 = _firma_block(firma_2, {"nombre": "", "cargo": "", "entidad": ""}) if firma_2 else None

    firmas_cells = [cell for cell in (f1, f2) if cell]
    if firmas_cells:
        cols = len(firmas_cells)
        firmas_table = Table(
            [firmas_cells],
            colWidths=[(doc.width / cols) for _ in range(cols)],
            hAlign="CENTER",
            style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]),
        )
        elements.append(Spacer(1, 0.6 * cm))
        elements.append(firmas_table)

    # ===== Build con header/footer =====
    footer_text = footer_text or "BIA • Certificados de Libre Deuda"
    first, later = _page_template(logo_bia_ff, logo_ent_ff, footer_text)
    doc.build(elements, onFirstPage=first, onLaterPages=later)

    return buf.getvalue()

# ======================================================================================
# Negocio y render
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
    """
    Resolución de entidad emisora:
    1) Si hay FK 'entidad' en registro, usarla.
    2) Si no, fallback por nombre (propietario / entidadinterna).
    """
    try:
        if hasattr(registro, "entidad_id") and registro.entidad_id:
            return getattr(registro, "entidad", None) or Entidad.objects.filter(pk=registro.entidad_id).first()
    except Exception:
        pass

    propietario = (registro.propietario or "").strip()
    interna = (registro.entidadinterna or "").strip()
    ent = None
    if propietario:
        ent = Entidad.objects.filter(nombre__iexact=propietario).first()
    if not ent and interna:
        ent = Entidad.objects.filter(nombre__iexact=interna).first()
    return ent

def _render_pdf_for_registro(reg: BaseDeDatosBia) -> Tuple[Optional[Certificate], Optional[bytes], Optional[str]]:
    """
    Genera y cachea PDF para un registro cancelado (ReportLab; Azure-ready).
    Con invalidación de caché basada en timestamps del modelo y mtimes de archivos en storage.
    """
    logger.info("[PDF] Generación para id_pago_unico=%s", reg.id_pago_unico)

    # Reobtención defensiva con select_related si tu modelo tiene FK -> Entidad
    try:
        reg = BaseDeDatosBia.objects.select_related("entidad").get(pk=reg.pk)
    except Exception:
        pass

    cert, _created = Certificate.objects.get_or_create(client=reg)

    # Resolver entidades
    emisora = get_entidad_emisora(reg)
    entidad_bia = Entidad.objects.filter(nombre__iexact="BIA").first()
    entidad_otras = None
    if emisora:
        if "bia" in (emisora.nombre or "").lower():
            entidad_bia = emisora
        else:
            entidad_otras = emisora

    # Firmas extendidas (FieldFile para leer desde storage)
    firma_bia = {
        "firma_ff": getattr(entidad_bia, "firma", None),
        "responsable": getattr(entidad_bia, "responsable", "") or "Responsable",
        "cargo": getattr(entidad_bia, "cargo", "") or "Responsable",
        "entidad": getattr(entidad_bia, "razon_social", "") or "BIA",
    }
    firma_ext = None
    if entidad_otras:
        firma_ext = {
            "firma_ff": getattr(entidad_otras, "firma", None),
            "responsable": getattr(entidad_otras, "responsable", "") or "",
            "cargo": getattr(entidad_otras, "cargo", "") or "",
            "entidad": getattr(entidad_otras, "razon_social", "") or "",
        }

    # Logos para header
    logo_bia_ff = getattr(entidad_bia, "logo", None) if entidad_bia else None
    logo_ent_ff = getattr(entidad_otras, "logo", None) if entidad_otras else None

    # ===== Invalidación de caché por timestamps/mtimes =====
    reuse_cached = False
    if _fieldfile_exists(cert.pdf_file):
        pdf_mtime = _get_storage_mtime(cert.pdf_file)

        ts_reg   = _get_timestamp_like(reg)
        ts_bia   = _get_timestamp_like(entidad_bia) if entidad_bia else None
        ts_otras = _get_timestamp_like(entidad_otras) if entidad_otras else None

        mt_bia_logo   = _get_storage_mtime(logo_bia_ff) if logo_bia_ff else None
        mt_bia_firma  = _get_storage_mtime(getattr(entidad_bia, "firma", None)) if entidad_bia else None
        mt_ent_logo   = _get_storage_mtime(logo_ent_ff) if logo_ent_ff else None
        mt_ent_firma  = _get_storage_mtime(getattr(entidad_otras, "firma", None)) if entidad_otras else None

        newest_data_ts = _max_ts(ts_reg, ts_bia, ts_otras, mt_bia_logo, mt_bia_firma, mt_ent_logo, mt_ent_firma)

        if pdf_mtime and newest_data_ts and newest_data_ts <= pdf_mtime:
            reuse_cached = True

        if reuse_cached:
            try:
                with _open_fieldfile(cert.pdf_file, "rb") as fh:
                    return cert, fh.read(), None
            except Exception as e:
                logger.exception("[PDF] Error leyendo PDF cacheado: %s", e)
                reuse_cached = False
        else:
            try:
                cert.pdf_file.delete(save=False)
            except Exception as e:
                logger.debug("[PDF] No se pudo borrar PDF viejo: %s", e)
    else:
        if getattr(cert.pdf_file, "name", ""):
            logger.warning("[PDF] pdf_file apunta a %s pero no existe; se limpia.", cert.pdf_file.name)
            cert.pdf_file.delete(save=False)

    # ===== Datos del certificado (coherentes con la BD) =====
    from datetime import datetime
    hoy_str = datetime.now().strftime("%d/%m/%Y")

    # “Entidad Original” prioriza entidadoriginal; fallback a entidadinterna
    entidad_original_val = (
        (reg.entidadoriginal or "").strip()
        or (reg.entidadinterna or "").strip()
    )

    # Auditoría (no impresa por defecto)
    emitido = getattr(reg, "ultima_fecha_pago", None) or getattr(reg, "fecha_plan", None) or getattr(reg, "fecha_apertura", None)
    try:
        emitido_str = emitido.strftime("%d/%m/%Y") if hasattr(emitido, "strftime") else _safe_text(emitido)
    except Exception:
        emitido_str = _safe_text(emitido)

    # Nombre/razón de la emisora (para copy/firma)
    ent_emisora_nombre = (entidad_otras or entidad_bia).nombre if (entidad_otras or entidad_bia) else ""

    datos = {
        # Claves consumidas por _build_pdf_bytes_azure
        "Número": reg.id_pago_unico,
        "DNI": reg.dni,
        "Nombre y Apellido": reg.nombre_apellido,
        "Razón Social": reg.propietario or "",
        "Entidad Original": entidad_original_val,
        "Entidad Emisora": ent_emisora_nombre,

        # Metadatos útiles:
        "Emitido": emitido_str,        # última fecha de pago/plan/apertura (opcional)
        "Estado": reg.estado or "",
        "Fecha de Emisión": hoy_str,   # lo que se muestra en “Buenos Aires, …”
    }

    footer_text = getattr(entidad_bia, "pie_pdf", None) or "BIA • Certificados de Libre Deuda"

    try:
        pdf_bytes = _build_pdf_bytes_azure(
            datos,
            logo_bia_ff=logo_bia_ff,
            logo_ent_ff=logo_ent_ff,
            firma_1=firma_bia,
            firma_2=firma_ext,
            titulo="Certificado de Libre Deuda",
            subtitulo=None,
            footer_text=footer_text,
        )
    except Exception as e:
        logger.exception("[PDF] Error generando PDF: %s", e)
        return cert, None, "Falló la generación del PDF para el certificado."

    # Persistir en storage
    try:
        filename = f"certificado_{reg.id_pago_unico}.pdf"
        cert.pdf_file.save(filename, ContentFile(pdf_bytes), save=True)
    except Exception as e:
        logger.exception("[PDF] Error guardando PDF: %s", e)
        return cert, pdf_bytes, "No se pudo persistir el PDF, pero se generó en memoria."

    return cert, pdf_bytes, None

# ======================================================================================
# Consulta unificada por DNI (pública)
# ======================================================================================

def _supports_distinct_on() -> bool:
    return connection.vendor == "postgresql"

def _query_unicas_por_id(dni: str):
    order_fields = ("id_pago_unico", "-ultima_fecha_pago", "-fecha_plan", "-fecha_apertura")
    if _supports_distinct_on():
        return (
            BaseDeDatosBia.objects
            .filter(dni=dni)
            .order_by(*order_fields)
            .distinct("id_pago_unico")
        )
    ids = (
        BaseDeDatosBia.objects
        .filter(dni=dni)
        .values_list("id_pago_unico", flat=True)
        .distinct()
    )
    todas = list(
        BaseDeDatosBia.objects.filter(dni=dni, id_pago_unico__in=list(ids))
        .order_by(*order_fields)
    )
    seen = set()
    out: List[BaseDeDatosBia] = []
    for r in todas:
        if r.id_pago_unico in seen:
            continue
        seen.add(r.id_pago_unico)
        out.append(r)
    return out

@api_view(["GET"])
@permission_classes([AllowAny])
def api_consulta_dni_unificada(request: HttpRequest):
    raw = request.GET.get("dni") or ""
    dni = _norm_dni(raw)
    if not _ok_dni(dni):
        return Response({"error": "dni inválido"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        page = max(1, int(request.GET.get("page", "1")))
    except Exception:
        page = 1
    try:
        page_size_req = int(request.GET.get("page_size", DEFAULT_PAGE_SIZE))
        page_size = min(MAX_PAGE_SIZE, max(1, page_size_req))
    except Exception:
        page_size = DEFAULT_PAGE_SIZE

    base = _query_unicas_por_id(dni)
    total = (base.count() if hasattr(base, "count") else len(base))
    start = (page - 1) * page_size
    end = start + page_size
    subset = (base[start:end] if hasattr(base, "__getitem__") else list(base)[start:end])

    deudas = []
    total_canceladas_unicas = 0
    for r in subset:
        cancelado = _is_cancelado(r)
        if cancelado:
            total_canceladas_unicas += 1
        deudas.append({
            "id": r.id,
            "id_pago_unico": r.id_pago_unico,
            "dni": r.dni,
            "nombre_apellido": r.nombre_apellido,
            "propietario": r.propietario,
            "entidadinterna": r.entidadinterna,
            "entidadoriginal": r.entidadoriginal,
            "estado": r.estado,
            "cancelado": cancelado,
        })

    total_en_bd = BaseDeDatosBia.objects.filter(dni=dni).count()
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
        "paginacion": {"page": page, "page_size": page_size, "total": total},
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
    # Si está autenticado, exigimos permiso interno de lectura (sin romper público anónimo)
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
