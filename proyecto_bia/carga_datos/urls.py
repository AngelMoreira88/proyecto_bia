from django.urls import path
from .views import (
    cargar_excel,
    confirmar_carga,
    errores_validacion,
    api_cargar_excel,
    api_confirmar_carga,
    api_errores_validacion,
    mostrar_datos_bia,
    actualizar_datos_bia,
    exportar_datos_bia_csv
    )


urlpatterns = [
    # vistas web “clásicas”
    path('',           cargar_excel,       name='cargar_excel'),
    path('confirmar/', confirmar_carga,    name='confirmar_carga'),
    path('errores/',   errores_validacion, name='errores_validacion'),

    # endpoints REST (JWT)
    path('cargar/',       api_cargar_excel,      name='api_cargar'),
    path('confirmar/',    api_confirmar_carga,   name='api_confirmar'),
    path('errores/',      api_errores_validacion,name='api_errores'),
    path('mostrar-datos-bia/', mostrar_datos_bia, name='mostrar_datos_bia'),
    path('mostrar-datos-bia/<int:pk>/', actualizar_datos_bia, name='actualizar_datos_bia'),
    path('exportar-datos-bia.csv', exportar_datos_bia_csv, name='exportar_datos_bia_csv'),
]
