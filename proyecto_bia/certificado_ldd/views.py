import os
from django.http import HttpResponse, JsonResponse
from django.template.loader import render_to_string
from xhtml2pdf import pisa
from django.core.files.base import ContentFile
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Q
from carga_datos.models import BaseDeDatosBia
from .models import Certificate, Entidad
from rest_framework import viewsets
from .serializers import EntidadSerializer
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import BaseDeDatosBia
from django.db.models import Q
from rest_framework.permissions import AllowAny
from .serializers import BaseDeDatosBiaSerializer  # ajusta al nombre real
from io import BytesIO

# Función para manejar los enlaces de los archivos estáticos y medios
def link_callback(uri, rel):
    s_url = settings.STATIC_URL
    s_root = getattr(settings, 'STATIC_ROOT', None)
    if not s_root:
        s_root = settings.STATICFILES_DIRS[0]

    m_url  = getattr(settings, 'MEDIA_URL', None)
    m_root = getattr(settings, 'MEDIA_ROOT', None)

    if uri.startswith(s_url):
        path = os.path.join(s_root, uri.replace(s_url, ''))
    elif m_url and uri.startswith(m_url):
        path = os.path.join(m_root, uri.replace(m_url, ''))
    else:
        return uri  # permitir http/https absolutas

    if not os.path.isfile(path):
        raise Exception(f"No se encontró el archivo estático: {path}")
    return path

def generate_pdf(html):
    result = BytesIO()
    pisa_status = pisa.CreatePDF(html, dest=result, link_callback=link_callback)
    if pisa_status.err:
        return None
    return result.getvalue()

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
            entidad = registro.entidad_obj

            firma_url = responsable = cargo = None
            if entidad:
                if entidad.firma:
                    firma_url = entidad.firma.url
                responsable = entidad.responsable
                cargo = entidad.cargo

            html = render_to_string(
                'pdf_template.html',
                {
                    'client': registro,
                    'firma_url': firma_url,
                    'responsable': responsable or "Socio/Gerente",
                    'cargo': cargo or "",
                    'entidad_firma': entidad,  # ← objeto completo con firma y más
                    'entidad_bia': entidad if entidad and "bia" in entidad.nombre.lower() else None,
                    'entidad_otras': entidad if entidad and "bia" not in entidad.nombre.lower() else None,
                }
            )

            pdf_file = generate_pdf(html)
            if pdf_file:
                filename = f"certificado_{registro.id_pago_unico}.pdf"
                certificate.pdf_file.save(filename, ContentFile(pdf_file))
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
    queryset = Entidad.objects.all().order_by('nombre')
    serializer_class = EntidadSerializer


@api_view(['GET'])
@permission_classes([AllowAny])
def mostrar_datos_bia(request):
    dni = request.GET.get('dni')
    id_pago = request.GET.get('id_pago_unico')

    if not (dni or id_pago):
        return Response(
            {'detail': 'Debes proporcionar al menos dni o id_pago_unico'},
            status=400
        )

    # Construimos un filtro OR: dni=dni OR id_pago_unico=id_pago
    q = Q()
    if dni:
        q |= Q(dni=dni)
    if id_pago:
        q |= Q(id_pago_unico=id_pago)

    registro = BaseDeDatosBia.objects.filter(q).first()
    if not registro:
        return Response({'detail': 'No encontrado'}, status=404)

    data = BaseDeDatosBiaSerializer(registro).data
    return Response(data)