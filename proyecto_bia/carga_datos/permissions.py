# carga_datos/permissions.py
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
    """Para cargar/previsualizar/confirmar Excel (Admin / Supervisor / Operador segun tu asignación)."""
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
    #         return super().has_permission(request, view) or (request.user.is_authenticated and request.method in SAFE_METHODS)
    #     return super().has_permission(request, view)


class IsAdminOrSuperuser(BasePermission):
    """
    Útil para endpoints de administración de roles/usuarios.
    Autoriza a superuser o a quienes pertenezcan al grupo 'Admin'.
    """
    admin_group_name = "Admin"

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_superuser:
            return True
        return user.groups.filter(name=self.admin_group_name).exists()

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)


__all__ = [
    "HasAppPerm",
    "CanManageEntities",
    "CanUploadExcel",
    "CanBulkModify",
    "CanViewClients",
    "IsAdminOrSuperuser",
]
