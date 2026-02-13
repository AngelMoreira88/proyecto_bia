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
from functools import lru_cache

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

# Campos mínimos para lista/preview (evitar traer columnas innecesarias)
_BDB_MIN_FIELDS = (
    "id", "pk", "dni", "id_pago_unico", "nombre_apellido", "propietario",
    "entidadinterna", "entidadoriginal", "estado",
    "saldo_actualizado", "cancel_min",
    "ultima_fecha_pago", "fecha_plan", "fecha_apertura", "entidad_id",
)
_ENTIDAD_MIN_FIELDS = ("id", "nombre", "razon_social", "responsable", "cargo")
_ENTIDAD_MEDIA_FIELDS = _ENTIDAD_MIN_FIELDS + ("logo", "firma")  # solo cuando haga falta (PDF)


def _is_ajax(request: HttpRequest) -> bool:
    return (request.headers.get("X-Requested-With") == "XMLHttpRequest") or (
        request.META.get("HTTP_X_REQUESTED_WITH") == "XMLHttp_REQUESTED_WITH"
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
    for attr in ("updated_at", "modified", "last_modified", "created_at", "created"):
        val = getattr(obj, attr, None)
        if val:
            return val
    return None


def _max_ts(*vals) -> Optional[object]:
    vals = [v for v in vals if v is not None]
    return max(vals) if vals else None


# ======================================================================================
# Caches ligeras de entidades
# ======================================================================================

@lru_cache(maxsize=64)
def _cached_entidad_bia_name() -> str:
    return "BIA"


@lru_cache(maxsize=64)
def _cached_entidad_by_name(nombre: str) -> Optional[Entidad]:
    # Solo los campos de texto necesarios para copy/firma; logo/firma se piden aparte si hace falta
    return Entidad.objects.only(*_ENTIDAD_MIN_FIELDS).filter(nombre__iexact=nombre).first()


@lru_cache(maxsize=1)
def _cached_entidad_bia() -> Optional[Entidad]:
    return _cached_entidad_by_name(_cached_entidad_bia_name())


# ======================================================================================
# ReportLab — Fuentes, imágenes y layout
# ======================================================================================

_FONTS_REGISTERED = False


def _register_fonts_for_azure():
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
    Devuelve un Image de ReportLab manteniendo la relación de aspecto.
    - width_cm: ancho deseado en cm
    - height_cm: se deja para compatibilidad pero no se usa para el cálculo.
    """
    if not _fieldfile_exists(ff):
        return None
    try:
        with _open_fieldfile(ff, "rb") as fh:
            data = fh.read()
        bio = BytesIO(data)

        # Creamos la imagen sin fijar aún tamaño
        img = Image(bio)

        # Escalamos por ancho manteniendo proporción
        target_width = width_cm * cm
        scale = target_width / float(img.imageWidth)
        target_height = img.imageHeight * scale

        img.drawWidth = target_width
        img.drawHeight = target_height
        img.hAlign = "CENTER"

        return img
    except Exception as e:
        logger.exception("[PDF] No se pudo leer imagen desde storage: %s", e)
        return None


def _safe_text(value, default="-"):
    return str(value) if value not in (None, "") else default


def _draw_header(canvas: canvas_module.Canvas, doc, logo_bia_ff, logo_ent_ff):
    """
    Header:
      - Si hay 2 entidades: BIA a la IZQUIERDA, entidad externa a la DERECHA.
      - Si hay 1 sola: centrada.
      - Línea gris a mitad de camino entre los logos y el inicio del contenido.
    """
    from reportlab.lib.utils import ImageReader
    canvas.saveState()

    page_w, page_h = A4
    ml = doc.leftMargin
    mr = doc.rightMargin

    # Y del inicio del frame de contenido (donde arranca el título)
    top_frame_y = page_h - doc.topMargin

    # Parámetros de header
    logo_size = 2.0 * cm
    # un poco más grande para bajar el contenido
    #gap_logo_contenido = 1.4 * cm
    gap_logo_contenido = 2.0 * cm
    #HEADER_TOP_MARGIN = 1.2 * cm

    # Dibujamos los logos de forma que su base quede gap_logo_contenido por encima del contenido
    #logo_bottom_y = top_frame_y + gap_logo_contenido
    logo_y = top_frame_y + gap_logo_contenido
    #logo_y = logo_bottom_y  # drawImage usa y como esquina inferior
    #logo_y = logo_bottom_y + HEADER_TOP_MARGIN


    def _draw_ff(ff, x, y):
        if not _fieldfile_exists(ff):
            return False
        try:
            with _open_fieldfile(ff, "rb") as fh:
                bio = BytesIO(fh.read())
            img = ImageReader(bio)
            canvas.drawImage(
                img,
                x,
                y,
                width=logo_size,
                height=logo_size,
                preserveAspectRatio=True,
                mask="auto",
            )
            return True
        except Exception as e:
            logger.warning("[PDF] No se pudo dibujar imagen de header: %s", e)
            return False

    has_bia = _fieldfile_exists(logo_bia_ff)
    has_ent = _fieldfile_exists(logo_ent_ff)

    # BIA siempre a la izquierda cuando haya 2 logos
    if has_ent and has_bia:
        # BIA IZQUIERDA
        _draw_ff(logo_bia_ff, ml, logo_y)
        # ENTIDAD EXTERNA DERECHA
        _draw_ff(logo_ent_ff, page_w - mr - logo_size, logo_y)
    elif has_bia and not has_ent:
        x = (page_w - logo_size) / 2.0
        _draw_ff(logo_bia_ff, x, logo_y)
    elif has_ent and not has_bia:
        x = (page_w - logo_size) / 2.0
        _draw_ff(logo_ent_ff, x, logo_y)

    # Línea a mitad de camino entre la base del logo y el inicio del contenido
    y_line = top_frame_y + (gap_logo_contenido / 2.0)
    #y_line = top_frame_y + (gap_logo_contenido / 2.0) + HEADER_TOP_MARGIN


    canvas.setStrokeColor(colors.HexColor("#DDDDDD"))
    canvas.setLineWidth(0.8)
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

    return _page, _page


# ======================================================================================
# Copy por entidad (texto profesional fiel a modelo)
# ======================================================================================

def _select_copy_for_entity(*, entidad_nombre: str | None, has_ent_externa: bool) -> dict:
    """
    Devuelve:
      - ciudad fija ("Buenos Aires")
      - parrafo1_fmt: plantilla principal según entidad (AZUR / BIA / CPSA / EGEO / FBLASA / genérico)
      - parrafo2: texto fijo "A pedido del interesado..."
      - asterisco_fmt: bloque con asterisco EXACTO a DOCX, con placeholder de FECHA DE CARGA
      - firma_defaults: texto por defecto de firma (fallback)
      - agregar_admin_bia: sólo se usa en el caso genérico BIA
    """
    nombre = (entidad_nombre or "").strip().lower()

    # === Plantillas de texto (con ID) ===

    # AZUR
    azur_parrafo1 = (
        "Se deja constancia de que el/la Sr./a <b>{nombre}</b>, con DNI <b>{dni}</b>, "
        "ha cancelado la deuda correspondiente a <b>{razon_social}</b>, administrado por BIA S.R.L "
        "respecto al/los crédito/s comprendidos bajo el N° de ID <b>{id}</b>, originado/s en <b>{entidad_original}</b>."
    )

    # BIA (persona física / genérico)
    base_parrafo1 = (
        "Por medio de la presente se deja constancia que el Sr/a <b>{nombre}</b>, con DNI: <b>{dni}</b> "
        "ha cancelado la deuda que mantenía con <b>{razon_social}</b>, "
        "respecto al/los crédito/s comprendidos bajo el N° de ID <b>{id}</b>, originado en <b>{entidad_original}</b>."
    )

    # Empresas (CPSA, EGEO, FBLASA)
    empresa_parrafo1 = (
        "Por medio de la presente se deja constancia que el Sr/a <b>{nombre}</b>, con DNI: <b>{dni}</b>, "
        "ha cancelado la deuda que mantenía con la empresa <b>{razon_social}</b>, "
        "respecto al/los crédito/s comprendidos bajo el N° de ID <b>{id}</b>, originado en <b>{entidad_original}</b>."
    )
   

    # Segundo párrafo: común a todos los modelos
    parrafo2 = (
        "A pedido del interesado, se extiende la presente para ser presentado a quien corresponda."
    )

    # ===== BLOQUE CON ASTERISCO: EXACTO A DOCX =====
    # Nota: en los DOCX aparece con "..." literal. Se mantiene exactamente igual.
    # El placeholder de FECHA DE CARGA en DOCX está entre paréntesis.
    asterisco_docx = (
        "*Este documento se refiere única y exclusivamente sobre los créditos que fueron originados y cedidos a {razon_social}, "
        "por la entidad expresamente mencionada, de fecha anterior al {fecha_carga}."
    )

    # Defaults de firma por entidad (fallback)
    firma_por_entidad = [
        {
            "match": ["azur", "fp azur"],
            "firma": {
                "nombre": "Administrador / Fiduciario",
                "cargo": "FP Azur Investment / BIA S.R.L.",
                "entidad": "",
            },
            "parrafo1_fmt": azur_parrafo1,
            "asterisco_fmt": asterisco_docx,
        },
        {
            "match": ["bia"],
            "firma": {
                "nombre": "Administrador/Apoderado",
                "cargo": "",
                "entidad": "BIA S.R.L.",
            },
            "parrafo1_fmt": base_parrafo1,
            "asterisco_fmt": asterisco_docx,
        },
        {
            "match": ["cpsa", "carnes pampeanas"],
            "firma": {
                "nombre": "Federico Lequio",
                "cargo": "Apoderado",
                "entidad": "Sociedad Anónima Carnes Pampeanas SA",
            },
            "parrafo1_fmt": empresa_parrafo1,
            "asterisco_fmt": asterisco_docx,
        },
        {
            "match": ["egeo"],
            "firma": {
                "nombre": "Administrador/Apoderado",
                "cargo": "",
                "entidad": "EGEO S.A.C.I Y A",
            },
            "parrafo1_fmt": empresa_parrafo1,
            "asterisco_fmt": asterisco_docx,
        },
        {
            "match": ["fb líneas aéreas", "fblasa", "fb lineas aereas"],
            "firma": {
                "nombre": "Hernán Morosuk",
                "cargo": "Apoderado",
                "entidad": "FB Líneas Aéreas S.A.",
            },
            "parrafo1_fmt": empresa_parrafo1,
            "asterisco_fmt": asterisco_docx,
        },
    ]

    selected = None
    for item in firma_por_entidad:
        if any(key in nombre for key in item["match"]):
            selected = item
            break

    if not selected:
        # Caso genérico (BIA-like)
        selected = {
            "firma": {
                "nombre": "Administrador/Apoderado",
                "cargo": "",
                "entidad": (entidad_nombre or "BIA S.R.L."),
            },
            "parrafo1_fmt": base_parrafo1,
            "asterisco_fmt": asterisco_docx,
        }

    return {
        "ciudad": "Buenos Aires",
        "parrafo1_fmt": selected["parrafo1_fmt"],
        "parrafo2": parrafo2,
        "asterisco_fmt": selected["asterisco_fmt"],
        "firma_defaults": selected["firma"],
        # En el modelo BIA se puede indicar "administrado por BIA S.R.L."
        # sólo cuando NO hay otra entidad externa.
        #"agregar_admin_bia": not has_ent_externa,
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
    footer_text: str | None,
) -> bytes:
    _register_fonts_for_azure()

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=2.0 * cm,
        rightMargin=2.0 * cm,
        #topMargin=4.5 * cm,   # → baja todo el contenido
        topMargin=5.0 * cm,   # → baja todo el contenido
        bottomMargin=2.5 * cm,
        title=titulo,
        author="BIA",
    )

    styles = getSampleStyleSheet()
    base_font = "DejaVuSans" if "DejaVuSans" in pdfmetrics.getRegisteredFontNames() else "Helvetica"
    base_bold = "DejaVuSans-Bold" if "DejaVuSans-Bold" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold"

    styles.add(
        ParagraphStyle(
            name="Titulo",
            parent=styles["Heading1"],
            fontName=base_bold,
            fontSize=14,
            leading=18,
            alignment=1,
            spaceAfter=8,
            spaceBefore=4,
        )
    )

    styles.add(
        ParagraphStyle(
            name="Fecha",
            parent=styles["BodyText"],
            fontName=base_font,
            fontSize=10.5,
            leading=13,
            textColor=colors.HexColor("#333333"),
            alignment=2,  # derecha
            spaceAfter=10,
        )
    )

    styles.add(
        ParagraphStyle(
            name="Cuerpo",
            parent=styles["BodyText"],
            fontName=base_font,
            fontSize=11,
            leading=15,
            textColor=colors.HexColor("#111111"),
            alignment=4,  # justificado
            spaceAfter=8,
        )
    )

    styles.add(
        ParagraphStyle(
            name="Nota",
            parent=styles["BodyText"],
            fontName=base_font,
            fontSize=9,
            leading=13,
            textColor=colors.HexColor("#111111"),
            alignment=4,
            spaceBefore=4,
            spaceAfter=8,
        )
    )

    styles.add(
        ParagraphStyle(
            name="FirmaTxt",
            parent=styles["BodyText"],
            fontName=base_font,
            fontSize=9,
            leading=11,
            alignment=1,  # centrado
        )
    )

    elements = []

    # =========================
    # TÍTULO (Eliminado por pedido)
    # =========================
    #elements.append(Paragraph(_safe_text(titulo), styles["Titulo"]))
    # Más espacio entre título y ciudad/fecha
    #elements.append(Spacer(1, 0.7 * cm))

    # =========================
    # FECHA (ciudad + fecha)
    # =========================
    from datetime import datetime

    fecha_emision = _safe_text(datos.get("Fecha de Emisión")) or datetime.now().strftime("%d/%m/%Y")

    ent_nombre = datos.get("Entidad Emisora") or datos.get("Razón Social") or ""
    has_ent_externa = _fieldfile_exists(logo_ent_ff)
    copy = _select_copy_for_entity(entidad_nombre=ent_nombre, has_ent_externa=has_ent_externa)

    # Línea de fecha, derecha, con ciudad (fecha en negrita)
    elements.append(Paragraph(f'{copy["ciudad"]}, <b>{fecha_emision}</b>', styles["Fecha"]))
    # Más espacio entre fecha y el primer párrafo del cuerpo
    elements.append(Spacer(1, 0.5 * cm))

    # =========================
    # CUERPO DEL TEXTO
    # =========================
    nombre_apellido = _safe_text(datos.get("Nombre y Apellido"), default="(sin dato)")
    dni_txt = _safe_text(datos.get("DNI"), default="(sin dato)")
    propietario_txt = _safe_text(datos.get("Razón Social"), default="(sin dato)")
    entidad_original_txt = _safe_text(datos.get("Entidad Original"), default="(sin dato)")

    # ID central del modelo: id_pago_unico
    id_txt = _safe_text(
        datos.get("ID") or datos.get("Número") or datos.get("id_pago_unico"),
        default="(sin dato)",
    )

    # Forzar negrita en los datos que vienen de la BD
    nombre_apellido_b = f"<b>{nombre_apellido}</b>"
    dni_txt_b = f"<b>{dni_txt}</b>"
    propietario_txt_b = f"<b>{propietario_txt}</b>"
    entidad_original_txt_b = f"<b>{entidad_original_txt}</b>"
    id_txt_b = f"<b>{id_txt}</b>"

    # En el modelo BIA se agrega "administrado por BIA S.R.L." sólo en algunos casos
    #admin_bia = " (administrado por BIA S.R.L.)" if copy.get("agregar_admin_bia") else ""
    
    firma_defaults = copy["firma_defaults"]

    razon_social_emisora = _safe_text(
        (firma_1 or {}).get("entidad")              # viene de Entidad.razon_social
        or datos.get("Entidad Emisora Razon Social")
        or firma_defaults.get("entidad")
        or datos.get("Entidad Emisora"),
        default="(sin dato)",
    )
    # Párrafo principal según plantilla por entidad (inyectando siempre valores en negrita)
    parrafo_1 = copy["parrafo1_fmt"].format(
        nombre=nombre_apellido_b,
        dni=dni_txt_b,
        #razon_social=_safe_text(firma_defaults.get("entidad")),
        razon_social=razon_social_emisora,
        entidad_original=entidad_original_txt_b,
        id=id_txt_b,
    )
    elements.append(Paragraph(parrafo_1, styles["Cuerpo"]))

    # Segundo párrafo (idéntico en todos los modelos)
    elements.append(Paragraph(copy["parrafo2"], styles["Cuerpo"]))

    # ===== BLOQUE CON ASTERISCO (EXACTO A DOCX) =====
    # En DOCX, el placeholder aparece como (FECHA DE CARGA), es decir, entre paréntesis.
    # Para replicar el formato, imprimimos la fecha también entre paréntesis.
    fecha_carga_txt = _safe_text(datos.get("Fecha de Carga"), default="(sin dato)")
    fecha_carga_parentesis = f"({fecha_carga_txt})"

    #firma_defaults = copy["firma_defaults"]

    asterisco_texto = copy.get("asterisco_fmt", "").format(
        fecha_carga=fecha_carga_parentesis,
        #razon_social=_safe_text(firma_defaults.get("entidad"))
        razon_social=razon_social_emisora,
    )

    elements.append(Spacer(1, 0.8 * cm))

    if asterisco_texto:
        elements.append(Paragraph(asterisco_texto, styles["Nota"]))

    # Vigencia (si existe)
    if datos.get("Vigencia Hasta") or datos.get("vigencia_hasta"):
        vig = datos.get("Vigencia Hasta") or datos.get("vigencia_hasta")
        nota_vig = (
            f"Este certificado es válido hasta <b>{_safe_text(vig)}</b>. "
            "<b>Ante cualquier duda</b>, verificar autenticidad con el área de Administración BIA."
        )
        elements.append(Paragraph(nota_vig, styles["Nota"]))

    # =========================
    # ESPACIO ANTES DE LA FIRMA
    # =========================
    elements.append(Spacer(1, 6.0 * cm))

    # ==== BLOQUE DE FIRMAS – SOLO 1 FIRMA ====

    def _firma_block(f, defaults):
        if not f:
            f = {}

        blocks = []
        ff = f.get("firma_ff")

        # Ancho fijo que se aplica a imagen + línea + contenido / se agranda la imagen con relación de aspecto
        IMG_WIDTH_CM = 6.0

        # Imagen de la firma
        if ff:
            img = _img_flowable_from_fieldfile(ff, IMG_WIDTH_CM, 3.0)
            if img:
                img.hAlign = "CENTER"
                blocks.append(img)
                blocks.append(Spacer(1, 0.5 * cm))

        # Línea exactamente del mismo ancho que la imagen y centrada
        blocks.append(
            HRFlowable(
                width=IMG_WIDTH_CM * cm,
                color=colors.HexColor("#FFFFFF"),
                thickness=1,
                hAlign="CENTER",
            )
        )
        blocks.append(Spacer(1, 0.05 * cm))

        # Texto del firmante
        texto = "<b>{}</b><br/>{}<br/>{}".format(
            _safe_text(f.get("responsable") or defaults.get("nombre")),
            _safe_text(f.get("cargo") or defaults.get("cargo")),
            _safe_text(f.get("entidad") or defaults.get("entidad")),
        )
        blocks.append(Paragraph(texto, styles["FirmaTxt"]))

        return blocks

    # Defaults basados en la entidad
    firma_defaults = copy["firma_defaults"]
    # Sólo usamos firma_1; firma_2 se ignora para cumplir el requerimiento de 1 sola firma.
    f1 = _firma_block(firma_1, firma_defaults) if firma_1 else None

    firmas_cells = [cell for cell in (f1,) if cell]
    if firmas_cells:
        # Una sola columna, ocupa todo el ancho del frame
        col_widths = [doc.width]

        firmas_table = Table(
            [firmas_cells],
            colWidths=col_widths,
            hAlign="CENTER",
            style=TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),  # centra el bloque en la celda
                ]
            ),
        )

        elements.append(firmas_table)

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
    Resolución de entidad emisora optimizada:
    1) Si hay FK 'entidad' y ya está select_related, úsala (sin query extra).
    2) Si no, búsqueda por nombre con cache LRU.
    """
    try:
        if getattr(registro, "entidad_id", None):
            ent = getattr(registro, "entidad", None)
            if ent:
                return ent  # ya viene de select_related
            # fallback por pk (solo campos mínimos)
            return Entidad.objects.only(*_ENTIDAD_MIN_FIELDS).filter(pk=registro.entidad_id).first()
    except Exception:
        pass

    propietario = (registro.propietario or "").strip()
    interna = (registro.entidadinterna or "").strip()

    if propietario:
        ent = _cached_entidad_by_name(propietario)
        if ent:
            return ent
    if interna and interna.lower() != (propietario or "").lower():
        ent = _cached_entidad_by_name(interna)
        if ent:
            return ent
    return None


def _render_pdf_for_registro(reg: BaseDeDatosBia) -> Tuple[Optional[Certificate], Optional[bytes], Optional[str]]:
    """
    Genera y cachea PDF para un registro cancelado (ReportLab; Azure-ready).
    Optimizaciones: select_related + only() para evitar overfetch y recargas.

    🔁 AJUSTE: se fuerza la regeneración del PDF en cada llamada
    (si existe uno previo, se borra y se genera uno nuevo).
    """
    logger.info("[PDF] Generación para id_pago_unico=%s", reg.id_pago_unico)

    # Reobtención defensiva, pero solo campos necesarios + entidad
    try:
        reg = (
            BaseDeDatosBia.objects.select_related("entidad")
            .only(*_BDB_MIN_FIELDS)
            .get(pk=reg.pk)
        )
    except Exception:
        # En caso de error, continuar con reg tal cual (ya cargado)
        pass

    cert, _created = Certificate.objects.get_or_create(client=reg)

    # Resolver entidades (sin blobs primero)
    emisora = get_entidad_emisora(reg)  # only() aplicado
    entidad_bia = _cached_entidad_bia()

    entidad_otras = None
    if emisora:
        if "bia" in (emisora.nombre or "").lower():
            entidad_bia = emisora
        else:
            entidad_otras = emisora

    # Para PDF sí necesitamos blobs (logo/firma). Releer SOLO esas entidad(es) con logo/firma.
    def _load_media(ent: Optional[Entidad]) -> Optional[Entidad]:
        if not ent:
            return None
        if hasattr(ent, "logo") and hasattr(ent, "firma"):
            # ya podría estar, pero aseguramos carga
            return Entidad.objects.only(*_ENTIDAD_MEDIA_FIELDS).filter(pk=ent.pk).first()
        return Entidad.objects.only(*_ENTIDAD_MEDIA_FIELDS).filter(pk=ent.pk).first()

    entidad_bia_m = _load_media(entidad_bia)
    entidad_otras_m = _load_media(entidad_otras)

    # ===== Firmas extendidas – una sola firma, de la entidad emisora =====
    entidad_firma = entidad_otras_m or entidad_bia_m
    firma_principal = None
    if entidad_firma:
        firma_principal = {
            "firma_ff": getattr(entidad_firma, "firma", None),
            "responsable": getattr(entidad_firma, "responsable", "") or "",
            "cargo": getattr(entidad_firma, "cargo", "") or "",
            "entidad": getattr(entidad_firma, "razon_social", "") or "",
        }

    # Logos para header
    logo_bia_ff = getattr(entidad_bia_m, "logo", None) if entidad_bia_m else None
    logo_ent_ff = getattr(entidad_otras_m, "logo", None) if entidad_otras_m else None

    # ===== Invalidación de caché: SIEMPRE REGENERAR =====
    # Si existe un PDF previo, lo eliminamos para forzar regeneración.
    if _fieldfile_exists(cert.pdf_file):
        try:
            cert.pdf_file.delete(save=False)
            logger.debug("[PDF] PDF previo eliminado para id_pago_unico=%s (se regenerará).", reg.id_pago_unico)
        except Exception as e:
            logger.debug("[PDF] No se pudo borrar PDF viejo (se regenerará igual): %s", e)
    else:
        # Si apunta a un nombre inexistente en storage, limpiamos el campo
        if getattr(cert.pdf_file, "name", ""):
            logger.warning(
                "[PDF] pdf_file apunta a %s pero no existe; se limpia.",
                cert.pdf_file.name,
            )
            try:
                cert.pdf_file.delete(save=False)
            except Exception as e:
                logger.debug("[PDF] No se pudo limpiar pdf_file inválido: %s", e)

    # ===== Datos del certificado =====
    from datetime import datetime

    hoy_str = datetime.now().strftime("%d/%m/%Y")

    entidad_original_val = (reg.entidadoriginal or "").strip() or (reg.entidadinterna or "").strip()

    emitido = getattr(reg, "ultima_fecha_pago", None) or getattr(reg, "fecha_plan", None) or getattr(
        reg, "fecha_apertura", None
    )
    try:
        emitido_str = emitido.strftime("%d/%m/%Y") if hasattr(emitido, "strftime") else _safe_text(emitido)
    except Exception:
        emitido_str = _safe_text(emitido)

    # NUEVO: FECHA DE CARGA = fecha_apertura
    fecha_carga = getattr(reg, "fecha_apertura", None)
    try:
        fecha_carga_str = fecha_carga.strftime("%d/%m/%Y") if hasattr(fecha_carga, "strftime") else _safe_text(fecha_carga)
    except Exception:
        fecha_carga_str = _safe_text(fecha_carga)

    ent_emisora_nombre = (entidad_otras_m or entidad_bia_m).nombre if (entidad_otras_m or entidad_bia_m) else ""

    datos = {
        "Número": reg.id_pago_unico,
        "ID": reg.id_pago_unico,  # NUEVO: variable central para el texto
        "DNI": reg.dni,
        "Nombre y Apellido": reg.nombre_apellido,
        "Razón Social": reg.propietario or "",
        "Entidad Original": entidad_original_val,
        "Entidad Emisora": ent_emisora_nombre,
        "Emitido": emitido_str,
        "Estado": reg.estado or "",
        "Fecha de Emisión": hoy_str,
        "Fecha de Carga": fecha_carga_str,  # NUEVO: bloque de fecha de carga
        # Se mantiene (no se elimina nada extra), aunque ya no se use en el texto central:
        "Creditos": getattr(reg, "creditos", "") or "",
    }

    footer_text = getattr(entidad_bia_m, "pie_pdf", None) or "BIA • Certificados de Libre Deuda"

    try:
        pdf_bytes = _build_pdf_bytes_azure(
            datos,
            logo_bia_ff=logo_bia_ff,
            logo_ent_ff=logo_ent_ff,
            firma_1=firma_principal,
            firma_2=None,  # siempre una sola firma
            titulo="Certificado de Libre Deuda",
            subtitulo=None,
            footer_text=footer_text,
        )
    except Exception as e:
        logger.exception("[PDF] Error generando PDF: %s", e)
        return cert, None, "Falló la generación del PDF para el certificado."

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


def _order_fields_distinct():
    # Mantener consistencia de ordering con DISTINCT ON (Postgres)
    return ("id_pago_unico", "-ultima_fecha_pago", "-fecha_plan", "-fecha_apertura")


def _base_bdb_qs():
    # QS base con solo campos necesarios
    return BaseDeDatosBia.objects.only(*_BDB_MIN_FIELDS)


def _query_unicas_por_id(dni: str):
    order_fields = _order_fields_distinct()
    qs = _base_bdb_qs().filter(dni=dni)
    if _supports_distinct_on():
        return qs.order_by(*order_fields).distinct("id_pago_unico")

    # Fallback no-Postgres: dos queries eficientes y dedupe en Python sin cargar demás columnas
    ids = qs.values_list("id_pago_unico", flat=True).distinct()
    todas = list(
        _base_bdb_qs()
        .filter(dni=dni, id_pago_unico__in=list(ids))
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
    total = base.count() if hasattr(base, "count") else len(base)
    start = (page - 1) * page_size
    end = start + page_size
    subset = base[start:end] if hasattr(base, "__getitem__") else list(base)[start:end]

    # Construimos payload con campos ya cargados; evitamos acceder a relaciones
    deudas = []
    total_canceladas_unicas = 0
    for r in subset:
        cancelado = _is_cancelado(r)
        if cancelado:
            total_canceladas_unicas += 1

        deudas.append(
            {
                "id": r.id,
                "id_pago_unico": r.id_pago_unico,
                "dni": r.dni,
                "nombre_apellido": r.nombre_apellido,
                "propietario": r.propietario,
                "entidadinterna": r.entidadinterna,
                "entidadoriginal": r.entidadoriginal,
                "estado": r.estado,
                "cancelado": cancelado,
                # 👉 campos económicos que usa el frontend
                "saldo_actualizado": (
                    str(r.saldo_actualizado)
                    if r.saldo_actualizado is not None
                    else None
                ),
                "cancel_min": r.cancel_min,
            }
        )

    total_en_bd = _base_bdb_qs().filter(dni=dni).count()
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

    # Un solo query con only() (lista completa para la página de selección)
    registros_qs = _base_bdb_qs().filter(dni=dni)
    registros = list(registros_qs)  # fuerza evaluación una vez
    if not registros:
        return render(
            request,
            "certificado_seleccionar.html",
            {
                "dni": dni,
                "cancelados": [], "pendientes": [], "mensaje": "No se encontraron registros para el DNI ingresado.",
            },
            status=200,
        )

    cancelados = [r for r in registros if _is_cancelado(r)]
    pendientes = [r for r in registros if not _is_cancelado(r)]

    if not cancelados:
        return render(
            request,
            "certificado_seleccionar.html",
            {
                "dni": dni,
                "cancelados": [], "pendientes": pendientes, "mensaje": "No hay obligaciones canceladas para imprimir.",
            },
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
        return JsonResponse(
            {"error": "Debe indicar id_pago_unico en la URL (GET).", "dni": dni, "id_pago_unico": idp},
            status=400,
        )

    qs = _base_bdb_qs().filter(id_pago_unico=idp)
    if dni:
        qs = qs.filter(dni=dni)

    reg = qs.first()
    if not reg:
        return JsonResponse(
            {
                "estado": BUSINESS["SIN_RESULTADOS"],
                "mensaje": "Registro no encontrado para los parámetros indicados.",
                "dni": dni,
                "id_pago_unico": idp,
            },
            status=200,
        )

    if not _is_cancelado(reg):
        return JsonResponse(
            {
                "estado": BUSINESS["PENDIENTE"],
                "mensaje": "La obligación seleccionada no está cancelada y no puede emitirse certificado.",
                "dni": dni,
                "id_pago_unico": idp,
                "deuda": _row_minimal(reg),
            },
            status=200,
        )

    cert, pdf_bytes, err = _render_pdf_for_registro(reg)
    if not pdf_bytes:
        return JsonResponse(
            {"estado": "error", "mensaje": err or "No se pudo generar el PDF."},
            status=500,
        )

    resp = HttpResponse(pdf_bytes, content_type="application/pdf")
    resp["Content-Disposition"] = f'attachment; filename="certificado_{reg.id_pago_unico}.pdf"'
    return resp


def _handle_post_generar(request: HttpRequest) -> HttpResponse:
    dni = _norm_dni(request.POST.get("dni") or "")
    idp = (request.POST.get("id_pago_unico") or request.POST.get("idp") or "").strip()

    # Caso 1: id específico
    if idp:
        qs = _base_bdb_qs().filter(id_pago_unico=idp)
        if dni:
            qs = qs.filter(dni=dni)

        reg = qs.first()
        if not reg:
            return JsonResponse(
                {
                    "estado": BUSINESS["SIN_RESULTADOS"],
                    "mensaje": "Registro no encontrado para el id_pago_unico indicado.",
                    "dni": dni,
                    "id_pago_unico": idp,
                },
                status=200,
            )

        if not _is_cancelado(reg):
            return JsonResponse(
                {
                    "estado": BUSINESS["PENDIENTE"],
                    "mensaje": "La obligación seleccionada no está cancelada y no puede emitirse certificado.",
                    "dni": dni,
                    "id_pago_unico": idp,
                    "deuda": _row_minimal(reg),
                },
                status=200,
            )

        cert, pdf_bytes, err = _render_pdf_for_registro(reg)
        if not pdf_bytes:
            return JsonResponse(
                {"estado": "error", "mensaje": err or "No se pudo generar el PDF."},
                status=500,
            )

        resp = HttpResponse(pdf_bytes, content_type="application/pdf")
        resp["Content-Disposition"] = f'attachment; filename="certificado_{reg.id_pago_unico}.pdf"'
        return resp

    # Caso 2: solo DNI
    if not _ok_dni(dni):
        return JsonResponse({"error": "Ingresá un DNI válido (solo números)."}, status=400)

    registros = list(_base_bdb_qs().filter(dni=dni))
    if not registros:
        return JsonResponse(
            {
                "estado": BUSINESS["SIN_RESULTADOS"],
                "mensaje": f"No hay registros para DNI {dni}.",
                "dni": dni,
            },
            status=200,
        )

    cancelados = [r for r in registros if _is_cancelado(r)]
    pendientes = [r for r in registros if not _is_cancelado(r)]

    if not cancelados:
        return JsonResponse(
            {
                "estado": BUSINESS["PENDIENTE"],
                "mensaje": "No se registran deudas canceladas para el DNI ingresado.",
                "dni": dni,
                "deudas": [_row_minimal(r) for r in pendientes],
            },
            status=200,
        )

    if len(cancelados) > 1:
        seleccionar_url = request.build_absolute_uri(
            reverse("certificado_ldd:certificado_seleccionar") + f"?dni={dni}"
        )
        certificados_meta = [
            {
                "id_pago_unico": r.id_pago_unico,
                "propietario": r.propietario,
                "entidadinterna": r.entidadinterna,
            }
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
        return JsonResponse(
            {"estado": "error", "mensaje": err or "No se pudo generar el PDF."},
            status=500,
        )

    resp = HttpResponse(pdf_bytes, content_type="application/pdf")
    resp["Content-Disposition"] = f'attachment; filename="certificado_{reg.id_pago_unico}.pdf"'
    return resp


# ======================================================================================
# Entidades (CRUD) – interno
# ======================================================================================

class EntidadViewSet(viewsets.ModelViewSet):
    # Evitar traer blobs en listados (logo/firma). Se cargan solo cuando se pidan explícitamente.
    queryset = Entidad.objects.defer("logo", "firma").only(*_ENTIDAD_MIN_FIELDS).order_by("id")
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
