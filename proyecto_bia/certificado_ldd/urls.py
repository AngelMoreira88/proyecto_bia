# certificado_ldd/urls.py
from django.urls import path, include
from django.http import JsonResponse
from rest_framework.routers import DefaultRouter

from .views import (
    EntidadViewSet,
    api_consulta_dni_unificada,
    api_generar_certificado,
    seleccionar_certificado,
)

app_name = "certificado_ldd"

router = DefaultRouter()
router.register(r"entidades", EntidadViewSet, basename="entidades")

def ping(_request):
    return JsonResponse({"ok": True, "app": "certificado_ldd"})

urlpatterns = [
    # Health
    path("ping/", ping, name="certificado_ping"),

    # 🔎 NUEVO endpoint de consulta unificada por DNI
    # GET /api/certificado/consulta/dni/?dni=XXXXXXXX
    path("consulta/dni/", api_consulta_dni_unificada, name="consulta_dni"),

    # Selector HTML (interno)
    path("seleccionar/", seleccionar_certificado, name="certificado_seleccionar"),

    # Generación de certificado (PDF/JSON)
    path("generar/",             api_generar_certificado, name="api_generar_certificado"),
    path("generar-certificado/", api_generar_certificado, name="api_generar_certificado_legacy"),

    # DRF Router (/api/certificado/entidades/…)
    path("", include(router.urls)),
]
