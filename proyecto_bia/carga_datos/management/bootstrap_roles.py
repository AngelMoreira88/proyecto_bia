# carga_datos/management/commands/bootstrap_roles.py
from django.core.management.base import BaseCommand
from django.contrib.auth.models import Group, Permission

ROLE_ADMIN, ROLE_SUP, ROLE_OP = "Admin", "Supervisor", "Operador"
PERMS = [
    "can_manage_entities",
    "can_upload_excel",
    "can_bulk_modify",
    "can_view_clients",
]

class Command(BaseCommand):
    help = "Crea/graba roles del PortalBIA y asigna permisos de negocio"

    def handle(self, *args, **opts):
        perms = list(Permission.objects.filter(codename__in=PERMS))
        pmap = {p.codename: p for p in perms}

        g_admin, _ = Group.objects.get_or_create(name=ROLE_ADMIN)
        g_sup, _   = Group.objects.get_or_create(name=ROLE_SUP)
        g_op, _    = Group.objects.get_or_create(name=ROLE_OP)

        # Admin: todos
        g_admin.permissions.set(perms)

        # Supervisor: todos según tu consigna (Entidades / Excel / Masivo / Ver)
        g_sup.permissions.set(perms)

        # Operador: Ver clientes y (si querés) Cargar Excel
        g_op.permissions.set([pmap[c] for c in ["can_view_clients", "can_upload_excel"] if c in pmap])

        self.stdout.write(self.style.SUCCESS("Roles y permisos aplicados."))
