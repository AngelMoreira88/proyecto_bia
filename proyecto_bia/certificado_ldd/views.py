# certificado_ldd/views.py
import os
from io import BytesIO

from django.conf import settings
from django.db.models import Q
from django.http import HttpResponse, JsonResponse
from django.template.loader import render_to_string
from django.views.decorators.csrf import csrf_exempt

from xhtml2pdf import pisa
from django.core.files.base import ContentFile

from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response

from carga_datos.models import BaseDeDatosBia
from carga_datos.serializers import BaseDeDatosBiaSerializer

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


# ---------------- API: Generar certificado ----------------
@csrf_exempt
def api_generar_certificado(request):
    if request.method != "POST":
        return JsonResponse({"error": "Método no permitido"}, status=405)

    dni = request.POST.get("dni")
    if not dni:
        return JsonResponse({"error": "Debe ingresar un DNI"}, status=400)

    registros = BaseDeDatosBia.objects.filter(dni=dni)
    if not registros.exists():
        return JsonResponse({"error": "No se encontraron registros para el DNI ingresado."}, status=404)

    # Si existe al menos una deuda NO cancelada → no emitir
    pendientes = registros.exclude(Q(estado__iexact="cancelado") | Q(sub_estado__iexact="cancelado"))
    if pendientes.exists():
        return JsonResponse({
            "estado": "pendiente",
            "mensaje": "Existen deudas pendientes. No se puede emitir el certificado.",
            "deudas": [
                {
                    "id_pago_unico": p.id_pago_unico,
                    "propietario": p.propietario,
                    "entidadinterna": p.entidadinterna,
                    "estado": p.estado,
                    "sub_estado": p.sub_estado,
                }
                for p in pendientes
            ],
        }, status=200)

    # Solo cancelados
    cancelados = registros.filter(Q(estado__iexact="cancelado") | Q(sub_estado__iexact="cancelado"))

    certificados = []
    for registro in cancelados:
        certificate, created = Certificate.objects.get_or_create(client=registro)

        if created or not certificate.pdf_file:
            emisora = get_entidad_emisora(registro)

            # Datos para firma / encabezado
            firma_url = None
            responsable = cargo = razon_social = None
            if emisora:
                if emisora.firma:
                    firma_url = emisora.firma.url
                responsable = emisora.responsable
                cargo = emisora.cargo
                razon_social = emisora.razon_social or emisora.nombre

            # Para el header de logos
            entidad_bia = None
            entidad_otras = None
            if emisora and "bia" in emisora.nombre.lower():
                entidad_bia = emisora
            elif emisora:
                entidad_otras = emisora

            html = render_to_string(
                "pdf_template.html",
                {
                    "client": registro,  # usa client.propietario / client.entidadinterna en el texto
                    "firma_url": firma_url,
                    "responsable": responsable or "Socio/Gerente",
                    "cargo": cargo or "",
                    "entidad_firma": razon_social or (registro.propietario or registro.entidadinterna or ""),
                    "entidad_bia": entidad_bia,
                    "entidad_otras": entidad_otras,
                },
            )

            pdf_bytes = generate_pdf(html)
            if pdf_bytes:
                filename = f"certificado_{registro.id_pago_unico}.pdf"
                certificate.pdf_file.save(filename, ContentFile(pdf_bytes))
                certificate.save()

        certificados.append(certificate)

    # Descargar único PDF directamente
    if len(certificados) == 1:
        cert = certificados[0]
        with open(cert.pdf_file.path, "rb") as f:
            pdf = f.read()
        resp = HttpResponse(pdf, content_type="application/pdf")
        resp["Content-Disposition"] = f'attachment; filename="certificado_{cert.client.id_pago_unico}.pdf"'
        return resp

    # O listar opciones si hubo varios cancelados
    return JsonResponse({
        "estado": "varios_cancelados",
        "mensaje": "Tiene varias deudas canceladas. Seleccione cuál certificado desea descargar.",
        "certificados": [
            {
                "id_pago_unico": c.client.id_pago_unico,
                "propietario": c.client.propietario,
                "entidadinterna": c.client.entidadinterna,
                "url_pdf": c.pdf_file.url,
            }
            for c in certificados
        ],
    }, status=200)


# ---------------- API: Entidades (CRUD) ----------------
class EntidadViewSet(viewsets.ModelViewSet):
    queryset = Entidad.objects.all().order_by("nombre")
    serializer_class = EntidadSerializer
    # Si querés restringir creación/edición a usuarios logueados:
    permission_classes = [IsAuthenticated]