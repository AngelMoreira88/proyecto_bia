import os
from django.http import HttpResponse, JsonResponse
from django.template.loader import render_to_string
from xhtml2pdf import pisa
from django.core.files.base import ContentFile
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Q

from .models import BaseDeDatosBia, Certificate

# Diccionario de logos según entidadinterna
LOGOS_ENTIDADES = {
    "FP Azur Investment": "static/logos/azur.png",
    "LD BIA": "static/logos/bia.png",
    "LD CPSA": "static/logos/cpsa.png",
    "LD EGEO": "static/logos/egeo.png",
    "LF FBLASA": "static/logos/fblasa.png",

    # Agregá más entidades según necesites
}

# Diccionario de firmas autenticadas y responsables según entidadinterna
FIRMAS_ENTIDADES = {
    "FP Azur Investment": {
        "firma_path": "static/firmas/azur.png",
        "responsable": "Administrador/Fiduciario",
        "entidad": "FP Azur Investment S.A./BIA S.R.L.",
    },
    
    "LD BIA": {
        "firma_path": "static/firmas/bia.png",
        "cargo": "Administrador/Apoderado",
        "entidad": "BIA S.R.L.",
    },
    
    "LD CPSA": {
        "firma_path": "static/firmas/cpsa.png",
        "responsable": "Federico Lequio",
        "cargo": "Apoderado",
        "entidad": "Sociedad Anónima Carnes Pampeanas SA",
    },
    
    "LD EGEO": {
        "firma_path": "static/firmas/egeo.png",
        "responsable": "Administrador/Apoderado",
        "entidad": "EGEO S.A.C.I Y A",

    },
        "LF FBLASA": {
        "firma_path": "static/firmas/egeo.png",
        "responsable": "Hernán Morosuk",
        "cargo": "Apoderado",
        "entidad": "FB Líneas Aéreas S.A.",
    },
    # Agregá más entidades según necesites
}


def link_callback(uri, rel):
    """
    Convierte una URI en una ruta absoluta para xhtml2pdf.
    """
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
    """
    Genera un archivo PDF a partir de HTML.
    """
    result = ContentFile(b"")
    pisa_status = pisa.CreatePDF(html, dest=result, link_callback=link_callback)
    return result if not pisa_status.err else None


@csrf_exempt
def api_generar_certificado(request):
    """
    API: Generar certificado PDF si el DNI tiene al menos una deuda cancelada.
    - Si tiene deudas pendientes: devuelve JSON con lista.
    - Si tiene varias canceladas: devuelve JSON con opciones.
    - Si tiene una sola cancelada: devuelve PDF.
    """
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
            # Obtener logo
            logo_path = LOGOS_ENTIDADES.get(registro.entidadinterna)
            logo_url = settings.STATIC_URL + logo_path.split("static/")[-1] if logo_path else None

            # Obtener firma y responsable
            firma_info = FIRMAS_ENTIDADES.get(registro.entidadinterna, {})
            firma_url = settings.STATIC_URL + firma_info["firma_path"].split("static/")[-1] if firma_info.get("firma_path") else None

            html = render_to_string(
                'pdf_template.html',
                {
                    'client': registro,
                    'logo_url': logo_url,
                    'firma_url': firma_url,
                    'responsable': firma_info.get("responsable", "Socio/Gerente"),
                    'cargo': firma_info.get("cargo", ""),
                    'entidad_firma': firma_info.get("entidad", "")
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
