# carga_datos/urls.py
from django.urls import path
from django.http import JsonResponse

from .views import (
    # Vistas web
    cargar_excel,
    confirmar_carga,
    errores_validacion,
    # API
    api_cargar_excel,
    api_confirmar_carga,
    api_errores_validacion,
    mostrar_datos_bia,
    actualizar_datos_bia,
    exportar_datos_bia_csv,
)

# Endpoints de Modificar Masivo (bulk)
from carga_datos.views_bulk import bulk_validate, bulk_commit, bulk_export_xlsx

# Endpoints de administración (roles/usuarios)
from carga_datos.views_roles import (
    me,
    roles_list,
    users_create_or_search,   # ✅ GET (search) + POST (create)
    user_update,              # ✅ PATCH /users/<id>
    user_deactivate,          # ✅ POST  /users/<id>/deactivate
    user_roles,               # ✅ GET/POST /users/<id>/roles
)

def ping(_request):
    return JsonResponse({"ok": True, "app": "carga_datos"})

urlpatterns = [
    # ---------------------------
    # WEB (navegación)
    # ---------------------------
    path('',                   cargar_excel,       name='cargar_excel'),
    path('confirmar-web/',     confirmar_carga,    name='confirmar_carga_web'),
    path('errores-web/',       errores_validacion, name='errores_validacion_web'),

    # ---------------------------
    # API (consumida por frontend)
    # ---------------------------
    path('api/ping/',                       ping,                   name='api_ping'),
    path('api/cargar/',                     api_cargar_excel,       name='api_cargar'),
    path('api/confirmar/',                  api_confirmar_carga,    name='api_confirmar'),
    path('api/errores/',                    api_errores_validacion, name='api_errores'),
    path('api/mostrar-datos-bia/',          mostrar_datos_bia,      name='api_mostrar_datos_bia'),
    path('api/mostrar-datos-bia/<int:pk>/', actualizar_datos_bia,   name='api_actualizar_datos_bia'),
    path('api/exportar-datos-bia.csv',      exportar_datos_bia_csv, name='api_exportar_datos_bia_csv'),

    # Bulk update (Modificar Masivo)
    path("api/bulk-update/validate",     bulk_validate,     name="bulk_update_validate"),
    path("api/bulk-update/commit",       bulk_commit,       name="bulk_update_commit"),
    path("api/bulk-update/export.xlsx",  bulk_export_xlsx,  name="bulk_export_xlsx"),

    # Admin (me/roles/users)
    path("api/admin/me",                         me,                      name="admin_me"),
    path("api/admin/roles",                      roles_list,              name="admin_roles"),

    # 🔁 GET (buscar) y POST (crear) en la misma ruta
    path("api/admin/users",                      users_create_or_search,  name="admin_users_search"),

    # ✅ Update/Deactivate
    path("api/admin/users/<int:user_id>",               user_update,      name="admin_user_update"),
    path("api/admin/users/<int:user_id>/deactivate",    user_deactivate,  name="admin_user_deactivate"),

    # ✅ Roles por usuario
    path("api/admin/users/<int:user_id>/roles",         user_roles,       name="admin_user_roles"),
]
