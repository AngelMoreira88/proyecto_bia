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

app_name = "carga_datos"

def ping(_request):
    return JsonResponse({"ok": True, "app": "carga_datos"})

urlpatterns = [
    # ---------------------------
    # WEB (navegación)
    # ⚠️ Ojo: si este módulo se incluye en /api/carga-datos/,
    # estas vistas HTML quedarán bajo /api/carga-datos/...
    # Si no querés eso, conviene moverlas a otro urls.py e incluirlas sin /api/.
    # ---------------------------
    path("",                   cargar_excel,       name="cargar_excel"),
    path("confirmar-web/",     confirmar_carga,    name="confirmar_carga_web"),
    path("errores-web/",       errores_validacion, name="errores_validacion_web"),

    # ---------------------------
    # API (sin prefijo 'api/' aquí)
    # Resultado final (vía include del proyecto):
    #   /api/carga-datos/ping/
    #   /api/carga-datos/cargar/
    #   /api/carga-datos/confirmar/
    #   ...
    # ---------------------------
    path("ping/",                       ping,                   name="api_ping"),
    path("cargar/",                     api_cargar_excel,       name="api_cargar"),
    path("confirmar/",                  api_confirmar_carga,    name="api_confirmar"),
    path("errores/",                    api_errores_validacion, name="api_errores"),
    path("mostrar-datos-bia/",          mostrar_datos_bia,      name="api_mostrar_datos_bia"),
    path("mostrar-datos-bia/<int:pk>/", actualizar_datos_bia,   name="api_actualizar_datos_bia"),
    path("exportar-datos-bia.csv",      exportar_datos_bia_csv, name="api_exportar_datos_bia_csv"),

    # Bulk update (Modificar Masivo)
    path("bulk-update/validate",     bulk_validate,     name="bulk_update_validate"),
    path("bulk-update/commit",       bulk_commit,       name="bulk_update_commit"),
    path("bulk-update/export.xlsx",  bulk_export_xlsx,  name="bulk_export_xlsx"),

    # Admin (me/roles/users)
    path("admin/me",                         me,                      name="admin_me"),
    path("admin/roles",                      roles_list,              name="admin_roles"),
    path("admin/users",                      users_create_or_search,  name="admin_users_search"),
    path("admin/users/<int:user_id>",        user_update,             name="admin_user_update"),
    path("admin/users/<int:user_id>/deactivate",    user_deactivate,  name="admin_user_deactivate"),
    path("admin/users/<int:user_id>/roles",         user_roles,       name="admin_user_roles"),
]
