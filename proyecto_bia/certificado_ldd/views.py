# certificado_ldd/views.py
import os
import unicodedata
from io import BytesIO

from django.conf import settings
from django.db.models import Q
from django.http import FileResponse, JsonResponse
from django.template.loader import render_to_string
from django.views.decorators.csrf import csrf_exempt
from django.core.files.base import ContentFile

from xhtml2pdf import pisa

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from carga_datos.models import BaseDeDatosBia
from .models import Certificate, Entidad
from .serializers import EntidadSerializer


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
        # 1) STATIC_ROOT (si hay collectstatic)
        if s_root:
            candidate = os.path.join(s_root, relpath)
            if os.path.exists(candidate):
                return candidate
        # 2) STATICFILES_DIRS (modo dev)
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

    # urls absolutas http(s) o rutas ya válidas
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
    3) Si nada, None → el template usará fallback (logo BIA estático).
    """
    propietario = (registro.propietario or "").strip()
    interna = (registro.entidadinterna or "").strip()

    ent = None
    if propietario:
        ent = Entidad.objects.filter(nombre__iexact=propietario).first()
    if not ent and interna:
        ent = Entidad.objects.filter(nombre__iexact=interna).first()
    return ent


# --------- utilidades simples ---------
def _norm(s: str) -> str:
    s = (s or "").strip().lower()
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    s = " ".join(s.split())
    return s


# ---------------- API: Generar certificado ----------------
@csrf_exempt
def api_generar_certificado(request):
    """
    POST form-data: dni

    Lógica:
      - Reúne todos los registros del DNI.
      - 'Certificables' = registros con estado = 'cancelado'.
      - 'Deudas' = registros con estado != 'cancelado' (ej. 'entidad externa').

      Respuestas:
        * Si no hay 'cancelado' y sí hay deudas -> estado='pendiente' (+deudas)
        * Si hay 'cancelado' y también deudas -> estado='parcial' (+certificados emitidos y +deudas)
        * Si sólo hay 1 'cancelado' y no hay deudas -> devuelve el PDF directo (FileResponse)
        * Si hay >1 'cancelado' y no hay deudas -> estado='varios_cancelados' (+links)
    """
    if request.method != "POST":
        return JsonResponse({"error": "Método no permitido"}, status=405)

    dni = (request.POST.get("dni") or "").strip()
    if not dni:
        return JsonResponse({"error": "Debe ingresar un DNI"}, status=400)

    registros = BaseDeDatosBia.objects.filter(dni=dni)
    if not registros.exists():
        return JsonResponse({"error": "No se encontraron registros para el DNI ingresado."}, status=404)

    # Separar por estado (sólo existen 'cancelado' y 'entidad externa')
    cancelados_qs = registros.filter(estado__iexact="cancelado").order_by("id")
    deudas_qs = registros.exclude(estado__iexact="cancelado").order_by("id")

    # Estructura de deudas (campos solicitados)
    deudas = [
        {
            "id_pago_unico": r.id_pago_unico,
            "propietario": r.propietario,
            "entidadinterna": r.entidadinterna,
            "estado": r.estado,
        }
        for r in deudas_qs
    ]

    # Si no hay cancelados
    if not cancelados_qs.exists():
        return JsonResponse(
            {
                "estado": "pendiente",
                "mensaje": "Existen deudas pendientes. No se puede emitir el/los certificado(s).",
                "deudas": deudas,
            },
            status=200,
        )

    # Generar/asegurar un certificado por CADA registro cancelado (id_pago_unico)
    certificados_meta = []
    certificados_objs = []

    for reg in cancelados_qs:
        cert, created = Certificate.objects.get_or_create(client=reg)
        if created or not cert.pdf_file:
            emisora = get_entidad_emisora(reg)

            firma_url = None
            responsable = cargo = razon_social = None
            if emisora:
                if emisora.firma:
                    firma_url = emisora.firma.url
                responsable = emisora.responsable
                cargo = emisora.cargo
                razon_social = emisora.razon_social or emisora.nombre

            entidad_bia = None
            entidad_otras = None
            if emisora and "bia" in (emisora.nombre or "").lower():
                entidad_bia = emisora
            elif emisora:
                entidad_otras = emisora

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
            if pdf_bytes:
                filename = f"certificado_{reg.id_pago_unico}.pdf"
                cert.pdf_file.save(filename, ContentFile(pdf_bytes))
                cert.save()

        certificados_meta.append(
            {
                "id_pago_unico": reg.id_pago_unico,
                "propietario": reg.propietario,
                "entidadinterna": reg.entidadinterna,
                "url_pdf": request.build_absolute_uri(cert.pdf_file.url) if cert.pdf_file else "",
            }
        )
        certificados_objs.append(cert)

    # Si además hay deudas → parcial
    if deudas:
        return JsonResponse(
            {
                "estado": "parcial",
                "mensaje": "Se emitieron certificados para las deudas canceladas. Aún registrás deudas en otras entidades.",
                "certificados": certificados_meta,
                "deudas": deudas,
            },
            status=200,
        )

    # Sin deudas y:
    if len(certificados_objs) == 1:
        # Devolver el único PDF en streaming
        cert = certificados_objs[0]
        try:
            return FileResponse(
                open(cert.pdf_file.path, "rb"),
                as_attachment=True,
                filename=f"certificado_{cert.client.id_pago_unico}.pdf",
                content_type="application/pdf",
            )
        except FileNotFoundError:
            return JsonResponse({"error": "El archivo del certificado no está disponible en el servidor."}, status=500)

    # Múltiples certificados sin deudas pendientes: devolver links
    return JsonResponse(
        {
            "estado": "varios_cancelados",
            "mensaje": "Se emitieron varios certificados. Puede descargar cada uno.",
            "certificados": certificados_meta,
        },
        status=200,
    )


# ---------------- API: Entidades (CRUD) ----------------
class EntidadViewSet(viewsets.ModelViewSet):
    queryset = Entidad.objects.all().order_by("nombre")
    serializer_class = EntidadSerializer
    permission_classes = [IsAuthenticated]
