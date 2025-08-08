from django.urls import path, include
from . import views
from rest_framework.routers import DefaultRouter
from .views import EntidadViewSet

router = DefaultRouter()
router.register(r'entidades', EntidadViewSet)


urlpatterns = [
    path('', include(router.urls)),
    path('api/certificado/generar/', views.api_generar_certificado),
    path('api/', include(router.urls)),
]

