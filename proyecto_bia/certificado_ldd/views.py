# certificado_ldd/views.py
import logging
import os
from io import BytesIO

from django.conf import settings
from django.http import JsonResponse, HttpResponse
from django.template.loader import render_to_string
from django.views.decorators.csrf import csrf_exempt

from django.core.files.base import ContentFile
from xhtml2pdf import pisa

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from carga_datos.models import BaseDeDatosBia
from .models import Certificate, Entidad
from .serializers import EntidadSerializer

logger = logging.getLogger(__name__)


# ---------------- PDF helpers ----------------
def link_callback(uri, rel):
    """
    Resuelve rutas de STATIC y MEDIA para xhtml2pdf.
    """
    # STATIC
    s_url = settings.STATIC_URL
    s_root = getattr(settings, "STATIC_ROOT", None)
    s_dirs = list(getattr(settings, "STATICFILES_DIRS", []))

    # MEDIA
    m_url = getattr(settings, "MEDIA_URL", None)
    m_root = getattr(settings, "MEDIA_ROOT", None)

    if uri.startswith(s_url):
        relpath = uri.replace(s_url, "", 1)
        if s_root:
            candidate = os.path.join(s_root, relpath)
            if os.path.exists(candidate):
                return candidate
        for d in s_dirs:
            candidate = os.path.join(d, relpath)
            if os.path.exists(candidate):
                return candidate
        raise Exception(f"Archivo estático no encontrado: {relpath}")

    if m_url and uri.startswith(m_url):
        relpath = uri.replace(m_url, "", 1)
        if m_root:
            candidate = os.path.join(m_root, relpath)
            if os.path.exists(candidate):
                return candidate
        raise Exception(f"Archivo media no encontrado: {relpath}")

    # urls absolutas http(s) o rutas válidas
    return uri


def generate_pdf(html: str) -> bytes | None:
    """
    Renderiza HTML -> PDF (bytes) con xhtml2pdf.
    """
    buf = BytesIO()
    result = pisa.CreatePDF(html, dest=buf, link_callback=link_callback)
    if result.err:
        return None
    return buf.getvalue()


# --------------- Lógica de entidad emisora ---------------
def get_entidad_emisora(registro: BaseDeDatosBia) -> Entidad | None:
    """
    1) Buscar Entidad por PROPIETARIO (emisora).
    2) Si no, buscar por ENTIDAD INTERNA.
    """
    propietario = (registro.propietario or "").strip()
    interna = (registro.entidadinterna or "").strip()

    ent = None
    if propietario:
        ent = Entidad.objects.filter(nombre__iexact=propietario).first()
    if not ent and interna:
        ent = Entidad.objects.filter(nombre__iexact=interna).first()
    return ent


def _is_cancelado(reg: BaseDeDatosBia) -> bool:
    """
    Negocio: solo dos estados posibles en 'estado': 'cancelado' o 'entidad externa'.
    """
    return (reg.estado or "").strip().lower() == "cancelado"


def _row_minimal(reg: BaseDeDatosBia) -> dict:
    """Campos mínimos para listar al cliente."""
    return {
        "id_pago_unico": reg.id_pago_unico,
        "propietario": reg.propietario,
        "entidadinterna": reg.entidadinterna,
        "estado": reg.estado,
    }


# ---------------- API: Generar certificado ----------------
@csrf_exempt
def api_generar_certificado(request):
    """
    POST form-data: dni
    Reglas:
      - Certifica por cada registro (id_pago_unico) que tenga estado == "cancelado".
      - Si además existen registros NO cancelados, responde estado="parcial" con:
          * certificados: [{id_pago_unico, propietario, entidadinterna, url_pdf}]
          * deudas:       [{id_pago_unico, propietario, entidadinterna, estado}]
      - Si todos están cancelados:
          * 1 registro => devuelve el PDF directo (attachment)
          * >1        => JSON con la lista de certificados
      - Si ninguno está cancelado:
          * estado="pendiente" con la lista de deudas (campos mínimos)
    """
    if request.method != "POST":
        return JsonResponse({"error": "Método no permitido"}, status=405)

    dni = (request.POST.get("dni") or "").strip()
    if not dni:
        return JsonResponse({"error": "Debe ingresar un DNI"}, status=400)

    try:
        registros = BaseDeDatosBia.objects.filter(dni=dni)
        if not registros.exists():
            return JsonResponse(
                {"error": "No se encontraron registros para el DNI ingresado."},
                status=404,
            )

        # Separar por estado
        cancelados = [r for r in registros if _is_cancelado(r)]
        pendientes = [r for r in registros if not _is_cancelado(r)]

        # Si NO hay cancelados => informar formalmente
        if not cancelados:
            return JsonResponse(
                {
                    "estado": "pendiente",
                    "mensaje": (
                        "No se registran deudas canceladas para el DNI ingresado. "
                        "Aún existen obligaciones pendientes con las entidades listadas."
                    ),
                    "deudas": [_row_minimal(r) for r in pendientes],
                },
                status=200,
            )

        # Asegurar/generar certificado para cada registro cancelado (por id_pago_unico)
        certificados_meta = []
        certificados_objs = []

        for reg in cancelados:
            cert, created = Certificate.objects.get_or_create(client=reg)

            # Generar o regenerar si no hay archivo asociado físicamente
            need_generate = (
                created
                or not cert.pdf_file
                or not getattr(cert.pdf_file, "path", None)
                or not os.path.exists(cert.pdf_file.path)
            )

            if need_generate:
                emisora = get_entidad_emisora(reg)

                # Datos de firma y entidad emisora
                firma_url = None
                responsable = cargo = razon_social = None
                if emisora:
                    if emisora.firma:
                        firma_url = emisora.firma.url
                    responsable = emisora.responsable
                    cargo = emisora.cargo
                    razon_social = emisora.razon_social or emisora.nombre

                # BIA a la izquierda siempre; si el propietario no es BIA, la otra entidad a la derecha.
                # Si el propietario ES BIA, el logo de BIA centrado (el template maneja ambos casos).
                entidad_bia = Entidad.objects.filter(nombre__iexact="BIA").first()
                entidad_otras = None
                if emisora:
                    if "bia" in emisora.nombre.lower():
                        entidad_bia = emisora  # usa la BIA encontrada en BD del propio registro
                        entidad_otras = None
                    else:
                        entidad_otras = emisora  # propietaria distinta a BIA

                html = render_to_string(
                    "pdf_template.html",
                    {
                        "client": reg,
                        "firma_url": firma_url,
                        "responsable": responsable or "Socio/Gerente",
                        "cargo": cargo or "",
                        "entidad_firma": razon_social or (reg.propietario or reg.entidadinterna or ""),
                        "entidad_bia": entidad_bia,
                        "entidad_otras": entidad_otras,
                    },
                )
                pdf_bytes = generate_pdf(html)
                if not pdf_bytes:
                    logger.warning("No se pudo generar PDF para id_pago_unico=%s", reg.id_pago_unico)
                else:
                    filename = f"certificado_{reg.id_pago_unico}.pdf"
                    cert.pdf_file.save(filename, ContentFile(pdf_bytes))
                    cert.save()

            # URL absoluta (evita que el front abra el SPA del puerto 3000)
            url = ""
            try:
                if cert.pdf_file:
                    url = request.build_absolute_uri(cert.pdf_file.url)
            except Exception:
                logger.exception("Error construyendo URL de certificado (id_pago_unico=%s)", reg.id_pago_unico)

            certificados_meta.append(
                {
                    "id_pago_unico": reg.id_pago_unico,
                    "propietario": reg.propietario,
                    "entidadinterna": reg.entidadinterna,
                    "url_pdf": url,
                }
            )
            certificados_objs.append(cert)

        # Hay pendientes además de cancelados => PARCIAL
        if pendientes:
            return JsonResponse(
                {
                    "estado": "parcial",
                    "mensaje": (
                        "Se emitieron certificados para las obligaciones canceladas. "
                        "Aún registra deudas con otras entidades."
                    ),
                    "certificados": certificados_meta,
                    "deudas": [_row_minimal(r) for r in pendientes],
                },
                status=200,
            )

        # Todos cancelados
        if len(certificados_objs) == 1:
            cert = certificados_objs[0]
            # Seguridad: si por algún motivo no hay archivo, devolvemos JSON en vez de 500
            if not cert.pdf_file or not getattr(cert.pdf_file, "path", None) or not os.path.exists(cert.pdf_file.path):
                logger.error("Certificado sin archivo físico (id_pago_unico=%s)", cert.client.id_pago_unico)
                return JsonResponse(
                    {
                        "estado": "error",
                        "error": "No fue posible adjuntar el PDF del certificado. Intente nuevamente.",
                    },
                    status=500,
                )
            with open(cert.pdf_file.path, "rb") as f:
                pdf = f.read()
            resp = HttpResponse(pdf, content_type="application/pdf")
            resp["Content-Disposition"] = f'attachment; filename="certificado_{cert.client.id_pago_unico}.pdf"'
            return resp

        # Varios cancelados => lista para descargar/ver
        return JsonResponse(
            {
                "estado": "varios_cancelados",
                "mensaje": "Se encuentran disponibles varios certificados para descargar.",
                "certificados": certificados_meta,
            },
            status=200,
        )

    except Exception as e:
        logger.exception("Fallo inesperado en api_generar_certificado (dni=%s)", dni)
        return JsonResponse(
            {"error": "Ocurrió un error inesperado generando el/los certificado(s).", "detail": str(e)},
            status=500,
        )


# ---------------- API: Entidades (CRUD) ----------------
class EntidadViewSet(viewsets.ModelViewSet):
    queryset = Entidad.objects.all().order_by("nombre")
    serializer_class = EntidadSerializer
    permission_classes = [IsAuthenticated]
