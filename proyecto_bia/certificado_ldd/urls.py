# certificado_ldd/urls.py
from django.urls import path, include
from django.http import JsonResponse
from rest_framework.routers import DefaultRouter

from .views import EntidadViewSet, api_generar_certificado

# DRF router (expone /entidades/ y /entidades/<pk>/ con slash final)
router = DefaultRouter()
router.register(r'entidades', EntidadViewSet, basename='entidad')

def ping(_request):
    return JsonResponse({"ok": True, "app": "certificado_ldd"})

urlpatterns = [
    # Router: /api/certificado/entidades/  y  /api/certificado/entidades/<pk>/
    path('', include(router.urls)),

    # Health-check: /api/certificado/ping/
    path('ping/', ping, name='certificado_ping'),

    # Generación de certificado
    # POST -> /api/certificado/generar/
    # POST -> /api/certificado/generar-certificado/
    path('generar/',             api_generar_certificado, name='api_generar_certificado_legacy'),
    path('generar-certificado/', api_generar_certificado, name='api_generar_certificado'),
]
