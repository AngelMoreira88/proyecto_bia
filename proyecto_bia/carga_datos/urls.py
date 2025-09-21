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

# ⚠️ Importás los endpoints de Modificar Masivo (bulk) desde este módulo:
# Asegurate que en views_bulk.py estén decorados con CanBulkModify/CanUploadExcel como te propuse.
from carga_datos.views_bulk import bulk_validate, bulk_commit, bulk_export_xlsx

# Endpoints de administración de roles (solo Admin/superuser)
from carga_datos.views_roles import (
    me,
    roles_list,
    users_search,              # (se mantiene importado)
    user_roles,
    # NUEVO: vistas de usuario real (GET/POST / PATCH / POST deactivate)
    users_create_or_search,    # GET (search) + POST (create) en /api/admin/users
    user_update,               # PATCH en /api/admin/users/<id>
    user_deactivate,           # POST en /api/admin/users/<id>/deactivate
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

    # Admin roles (solo Admin/superuser desde views_roles)
    path("api/admin/me",                         me,                      name="admin_me"),
    path("api/admin/roles",                      roles_list,              name="admin_roles"),

    # 🔁 ACTUALIZADO: ahora /api/admin/users acepta GET (buscar) y POST (crear)
    #   - GET  -> users_create_or_search (mismo comportamiento que users_search)
    #   - POST -> crea usuario real (lo que necesita Perfil.jsx)
    path("api/admin/users",                      users_create_or_search,  name="admin_users_search"),

    # ✅ NUEVOS endpoints para update y desactivar
    path("api/admin/users/<int:user_id>",               user_update,      name="admin_user_update"),
    path("api/admin/users/<int:user_id>/deactivate",    user_deactivate,  name="admin_user_deactivate"),

    # (Se mantiene igual)
    path("api/admin/users/<int:user_id>/roles",  user_roles,              name="admin_user_roles"),
]
