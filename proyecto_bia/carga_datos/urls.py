from django.urls import path
from .views import (
    cargar_excel,
    confirmar_carga,
    errores_validacion,
    api_cargar_excel,
    api_confirmar_carga,
   api_errores_validacion,
)

urlpatterns = [
    # vistas web “clásicas”
    path('', cargar_excel,       name='cargar_excel'),
    path('confirmar/', confirmar_carga,   name='confirmar_carga'),
    path('errores/',  errores_validacion, name='errores_validacion'),

    # endpoints REST para React / JWT
    path('api/',            api_cargar_excel,      name='api_cargar'),
    path('api/confirmar/',  api_confirmar_carga,   name='api_confirmar'),
    path('api/errores/',    api_errores_validacion,name='api_errores'),
]
