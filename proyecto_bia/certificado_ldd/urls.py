# certificado_ldd/urls.py

from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import EntidadViewSet, api_generar_certificado

router = DefaultRouter()
router.register(r'entidades', EntidadViewSet, basename='entidad')

urlpatterns = (
    router.urls  # rutas /entidades/ y /entidades/{pk}/
    + [
        path('generar/', api_generar_certificado, name='api_generar_certificado'),
    ]
)
