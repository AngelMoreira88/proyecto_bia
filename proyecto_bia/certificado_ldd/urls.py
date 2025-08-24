# certificado_ldd/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import EntidadViewSet, api_generar_certificado 

router = DefaultRouter()
router.register(r'entidades', EntidadViewSet, basename='entidad')

urlpatterns = [
    # Rutas de ViewSet
    path('', include(router.urls)),

    # Rutas para generar certificado (dos aliases)
    path('generar/', api_generar_certificado, name='api_generar_certificado_legacy'),   
    path('generar-certificado/', api_generar_certificado, name='api_generar_certificado'),
]
