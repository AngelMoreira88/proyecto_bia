import os
from django.shortcuts import render
from django.http import HttpResponse
from django.template.loader import render_to_string
from xhtml2pdf import pisa
from django.core.files.base import ContentFile
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt

from .models import BaseDeDatosBia, Certificate


def link_callback(uri, rel):
    """
    Convierte una URI (/static/... o /media/...) en la ruta absoluta del archivo.
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
    """Genera un PDF a partir de un string HTML y devuelve un ContentFile o None en error."""
    result = ContentFile(b"")
    pisa_status = pisa.CreatePDF(html, dest=result, link_callback=link_callback)
    return result if not pisa_status.err else None


@csrf_exempt
def certificate_view(request):
    """Vista para generar y descargar el certificado PDF según DNI."""
    context = {}

    if request.method == 'POST':
        dni = request.POST.get('dni')
        if not dni:
            context['error'] = "Por favor, ingrese un DNI válido."
            return render(request, 'form.html', context)

        try:
            cliente = BaseDeDatosBia.objects.get(dni=dni)
        except BaseDeDatosBia.DoesNotExist:
            context['error'] = "Cliente no encontrado."
            return render(request, 'form.html', context)

        # Verificar estado de deuda
        if not cliente.estado_leg or cliente.estado_leg.lower() != 'cancelado':
            context['error'] = "El cliente tiene deuda pendiente."
            return render(request, 'form.html', context)

        certificate, created = Certificate.objects.get_or_create(client=cliente)

        # Generar PDF solo si no existe
        if created or not certificate.pdf_file:
            html = render_to_string('pdf_template.html', {'client': cliente})
            pdf_file = generate_pdf(html)
            if not pdf_file:
                context['error'] = "Error al generar el PDF."
                return render(request, 'form.html', context)

            filename = f"certificado_{cliente.dni}.pdf"
            certificate.pdf_file.save(filename, pdf_file)
            certificate.save()

            with open(certificate.pdf_file.path, 'rb') as f:
                response = HttpResponse(f.read(), content_type='application/pdf')
                response['Content-Disposition'] = f'attachment; filename="{filename}"'
                return response
        else:
            # PDF ya existe: indicar contactar operador
            context['error'] = "El certificado ya fue generado. Por favor, comuníquese con un operador."
            return render(request, 'form.html', context)

    # GET o cualquier otro método muestra el formulario
    return render(request, 'form.html', context)