# carga_datos/management/commands/migrate_legacy_roles.py
from django.core.management.base import BaseCommand
from django.contrib.auth.models import Group

MAPPING = {
    "admin": "Admin",
    "editor": "Supervisor",
    "approver": "Operador",
}

class Command(BaseCommand):
    help = "Mapea grupos legacy (admin/editor/approver) a (Admin/Supervisor/Operador)"

    def handle(self, *args, **opts):
        total = 0
        for old, new in MAPPING.items():
            old_g = Group.objects.filter(name=old).first()
            if not old_g:
                self.stdout.write(f"Grupo legacy '{old}' no existe (ok).")
                continue
            new_g, _ = Group.objects.get_or_create(name=new)
            users = list(old_g.user_set.all())
            for u in users:
                u.groups.add(new_g)
                u.groups.remove(old_g)
            total += len(users)
            # opcional: borrar el grupo viejo
            old_g.delete()
            self.stdout.write(self.style.SUCCESS(
                f"Migrados {len(users)} usuarios: '{old}' → '{new}'"
            ))
        self.stdout.write(self.style.SUCCESS(f"Listo. Usuarios migrados: {total}"))
