from django.urls import path
from . import views

urlpatterns = [
    path('api/certificado/generar/', views.api_generar_certificado),
]

