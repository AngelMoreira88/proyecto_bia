import os
from django.http import HttpResponse, JsonResponse
from django.template.loader import render_to_string
from xhtml2pdf import pisa
from django.core.files.base import ContentFile
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Q
from .models import Certificate, Entidad
from carga_datos.models import BaseDeDatosBia
from rest_framework import viewsets
from .serializers import EntidadSerializer


def link_callback(uri, rel):
    if uri.startswith(settings.STATIC_URL):
        path_relative = uri.replace(settings.STATIC_URL, '', 1)
        for static_dir in settings.STATICFILES_DIRS:
            candidate = os.path.join(static_dir, path_relative)
            if os.path.exists(candidate):
                return candidate
        raise Exception(f"No se encontró el archivo estático: {path_relative}")

    if uri.startswith(settings.MEDIA_URL):
        path_relative = uri.replace(settings.MEDIA_URL, '', 1)
        absolute_path = os.path.join(settings.MEDIA_ROOT, path_relative)
        if os.path.exists(absolute_path):
            return absolute_path
        raise Exception(f"No se encontró el archivo media: {path_relative}")

    return uri


def generate_pdf(html):
    result = ContentFile(b"")
    pisa_status = pisa.CreatePDF(html, dest=result, link_callback=link_callback)
    return result if not pisa_status.err else None


def obtener_entidad_info(nombre_entidad):
    entidad = Entidad.objects.filter(nombre__iexact=nombre_entidad.strip()).first()
    if entidad:
        return {
            "logo_url": entidad.logo.url if entidad.logo else None,
            "firma_url": entidad.firma_path.url if entidad.firma_path else None,
            "responsable": entidad.responsable,
            "cargo": entidad.cargo,
            "entidad_firma": entidad.nombre,
        }
    return {
        "logo_url": None,
        "firma_url": None,
        "responsable": "Socio/Gerente",
        "cargo": "",
        "entidad_firma": nombre_entidad,
    }


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

    pendientes = registros.exclude(
        Q(estado__iexact="cancelado") | Q(sub_estado__iexact="cancelado")
    )
    cancelados = registros.filter(
        Q(estado__iexact="cancelado") | Q(sub_estado__iexact="cancelado")
    )

    if pendientes.exists():
        return JsonResponse({
            "estado": "pendiente",
            "mensaje": "Existen deudas pendientes.",
            "deudas": [
                {
                    "id_pago_unico": p.id_pago_unico,
                    "entidadinterna": p.entidadinterna,
                    "estado": p.estado,
                }
                for p in pendientes
            ]
        })

    certificados = []
    for registro in cancelados:
        certificate, created = Certificate.objects.get_or_create(client=registro)

        if created or not certificate.pdf_file:
            entidad_info = obtener_entidad_info(registro.entidadinterna)

            html = render_to_string(
                'pdf_template.html',
                {
                    'client': registro,
                    'logo_url': entidad_info['logo_url'],
                    'firma_url': entidad_info['firma_url'],
                    'responsable': entidad_info['responsable'],
                    'cargo': entidad_info['cargo'],
                    'entidad_firma': entidad_info['entidad_firma'],
                    'entidad_bia': Entidad.objects.filter(nombre__icontains="bia").first(),
                    'entidad_otras': Entidad.objects.exclude(nombre__icontains="bia").filter(nombre=registro.entidadinterna).first(),
                }
            )

            pdf_file = generate_pdf(html)
            if pdf_file:
                filename = f"certificado_{registro.id_pago_unico}.pdf"
                certificate.pdf_file.save(filename, pdf_file)
                certificate.save()

        certificados.append(certificate)

    if len(certificados) == 1:
        cert = certificados[0]
        with open(cert.pdf_file.path, 'rb') as f:
            pdf = f.read()
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = (
            f'attachment; filename="certificado_{cert.client.id_pago_unico}.pdf"'
        )
        return response

    return JsonResponse({
        "estado": "varios_cancelados",
        "mensaje": "Tiene varias deudas canceladas. Seleccione cuál certificado desea descargar.",
        "certificados": [
            {
                "id_pago_unico": c.client.id_pago_unico,
                "entidadinterna": c.client.entidadinterna,
                "url_pdf": c.pdf_file.url,
            }
            for c in certificados
        ]
    })

class EntidadViewSet(viewsets.ModelViewSet):
    queryset = Entidad.objects.all()
    serializer_class = EntidadSerializer