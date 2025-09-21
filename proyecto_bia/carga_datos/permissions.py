# carga_datos/permissions.py
from django.conf import settings
from rest_framework.permissions import BasePermission
from rest_framework.permissions import SAFE_METHODS


class HasAppPerm(BasePermission):
    """
    Permiso base: requiere usuario autenticado y que tenga el permiso
    'app_label.codename' (o sea superusuario). Usado como base para
    permisos específicos del negocio.
    """
    app_label = "carga_datos"  # Cambiá esto si los permisos están en otra app.
    codename = None

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_superuser:
            return True
        if not self.codename:
            return False
        return user.has_perm(f"{self.app_label}.{self.codename}")

    # Para vistas con object-level perms, reutilizamos la misma lógica
    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)


class CanManageEntities(HasAppPerm):
    """Para CRUD de Entidades (Admin / Supervisor)."""
    codename = "can_manage_entities"


class CanUploadExcel(HasAppPerm):
    """Para cargar/previsualizar/confirmar Excel (Admin / Supervisor / Operador según tu asignación)."""
    codename = "can_upload_excel"


class CanBulkModify(HasAppPerm):
    """Para Modificar Masivo (Admin / Supervisor)."""
    codename = "can_bulk_modify"


class CanViewClients(HasAppPerm):
    """
    Para lectura/consulta/export de clientes (GET/HEAD/OPTIONS).
    Si querés permitir lectura sin permiso en métodos seguros, descomentá el bloque SAFE_METHODS.
    """
    codename = "can_view_clients"

    # Si deseás permitir siempre métodos solo-lectura sin el permiso explícito, podés usar:
    # def has_permission(self, request, view):
    #     if request.method in SAFE_METHODS:
    #         # Permitir lectura a cualquier autenticado o a quien tenga el permiso explícito
    #         if request.user and request.user.is_authenticated:
    #             return True
    #     return super().has_permission(request, view)


def _get_admin_group_names():
    """
    Lista de nombres de grupo considerados 'Admin'.
    Se puede configurar en settings.BIA_ADMIN_GROUP_NAMES.
    El match es case-insensitive.
    """
    default_names = ("Admin", "admin", "Administrador")
    names = getattr(settings, "BIA_ADMIN_GROUP_NAMES", default_names)
    # normalizamos a tupla inmutable
    try:
        return tuple(names)
    except TypeError:
        return default_names


def _is_in_any_group_ci(user, names):
    """
    Verifica si el usuario pertenece a alguno de los grupos 'names'
    en forma case-insensitive (usa iexact).
    """
    if not user or not user.is_authenticated:
        return False
    # Evita diferenciar por mayúsculas/minúsculas
    from django.db.models import Q
    q = Q()
    for n in names:
        q |= Q(name__iexact=str(n))
    return user.groups.filter(q).exists()


class IsAdminOrSuperuser(BasePermission):
    """
    Útil para endpoints de administración de roles/usuarios.
    Autoriza a superuser o a quienes pertenezcan al grupo 'Admin' (configurable).
    """
    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_superuser:
            return True
        admin_groups = _get_admin_group_names()
        return _is_in_any_group_ci(user, admin_groups)

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)


# ======= NUEVO: permisos específicos para manejo de usuarios =======

class CanManageUsers(HasAppPerm):
    """
    Permiso granular para endpoints de alta/edición de usuarios.
    Asigná este permiso (carga_datos.can_manage_users) a tu grupo Admin.
    """
    codename = "can_manage_users"


class IsAdminRole(BasePermission):
    """
    Permiso 'flexible' para admin de usuarios:
    - superuser, o
    - pertenece a un grupo admin (case-insensitive; configurable con BIA_ADMIN_GROUP_NAMES), o
    - tiene el permiso 'carga_datos.can_manage_users'
    """
    app_label = "carga_datos"
    codename = "can_manage_users"

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_superuser:
            return True

        # Grupo admin (case-insensitive, configurable)
        if _is_in_any_group_ci(user, _get_admin_group_names()):
            return True

        # Permiso granular
        return user.has_perm(f"{self.app_label}.{self.codename}")

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)


__all__ = [
    "HasAppPerm",
    "CanManageEntities",
    "CanUploadExcel",
    "CanBulkModify",
    "CanViewClients",
    "IsAdminOrSuperuser",
    # Nuevos
    "CanManageUsers",
    "IsAdminRole",
]
