# certificado_ldd/urls.py
from django.urls import path, include
from django.http import JsonResponse
from rest_framework.routers import DefaultRouter

from .views import (
    EntidadViewSet,
    api_generar_certificado,
    seleccionar_certificado,  # vista HTML para elegir cuando hay múltiples CANCELADOS
)

# Importante: namespace para poder hacer reverse('certificado_ldd:certificado_seleccionar')
app_name = "certificado_ldd"

# DRF router -> /api/certificado/entidades/  y  /api/certificado/entidades/<pk>/
router = DefaultRouter()
router.register(r'entidades', EntidadViewSet, basename='entidades')

def ping(_request):
    return JsonResponse({"ok": True, "app": "certificado_ldd"})

urlpatterns = [
    # Health-check
    path('ping/', ping, name='certificado_ping'),

    # Página HTML para seleccionar qué certificado generar cuando hay múltiples CANCELADOS
    # GET /api/certificado/seleccionar/?dni=<dni>
    path('seleccionar/', seleccionar_certificado, name='certificado_seleccionar'),

    # Generación de certificado (ambos aliases válidos)
    # POST form-data: dni=...  (opcional: id_pago_unico=..., prefer_html=1)
    path('generar/',             api_generar_certificado, name='api_generar_certificado'),
    path('generar-certificado/', api_generar_certificado, name='api_generar_certificado_legacy'),

    # Endpoints de entidades del router DRF
    path('', include(router.urls)),
]
