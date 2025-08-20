# carga_datos/management/commands/fill_entidad_fk_by_propietario.py
import unicodedata
from collections import Counter, defaultdict
from django.core.management.base import BaseCommand
from django.db import transaction

from carga_datos.models import BaseDeDatosBia
from certificado_ldd.models import Entidad

def norm(s: str) -> str:
    s = (s or "").strip()
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')  # sin tildes
    for ch in ('.', '-', '_', ' ', ',', ';', ':', '/', '\\'):
        s = s.replace(ch, '')
    return s.lower()

class Command(BaseCommand):
    help = (
        "Crea y vincula Entidades a partir de PROPIETARIO (preferente) y ENTIDAD INTERNA (fallback). "
        "Luego setea BaseDeDatosBia.entidad con la Entidad correspondiente."
    )

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="No guarda cambios; solo muestra qué haría.")
        parser.add_argument("--create-missing", action="store_true", help="Crea Entidades faltantes automáticamente.")
        parser.add_argument("--batch-size", type=int, default=500, help="Tamaño de lote para bulk_update (default 500).")

    def handle(self, *args, **opts):
        dry = opts["dry_run"]
        create_missing = opts["create_missin g"] if "create_missin g" in opts else opts["create_missing"]  # robustez por typo
        batch_size = opts["batch_size"]

        # Mapa de Entidades existentes por clave normalizada
        ents = {norm(e.nombre): e for e in Entidad.objects.all()}
        self.stdout.write(self.style.NOTICE(f"Entidades existentes: {len(ents)}"))

        # Relevar claves a crear: preferimos PROPIETARIO; si no hay, ENTIDAD INTERNA
        counts = Counter()
        originals = defaultdict(Counter)  # key_norm -> Counter({ 'Nombre Original': veces })
        prefer_prop = defaultdict(int)    # cuántas veces vino desde propietario

        qs = BaseDeDatosBia.objects.filter(entidad__isnull=True)
        total_rows = qs.count()
        self.stdout.write(self.style.NOTICE(f"Registros a evaluar (entidad_id IS NULL): {total_rows}"))

        for row in qs.only('propietario', 'entidadinterna').iterator(chunk_size=2000):
            src = (row.propietario or "").strip()
            used_prop = True
            if not src:
                src = (row.entidadinterna or "").strip()
                used_prop = False
            if not src:
                continue
            key = norm(src)
            counts[key] += 1
            originals[key][src] += 1
            if used_prop:
                prefer_prop[key] += 1

        missing_keys = [k for k in counts if k not in ents]
        self.stdout.write(self.style.NOTICE(f"Claves candidatas sin Entidad: {len(missing_keys)}"))

        # Preview de faltantes
        if missing_keys:
            self.stdout.write(self.style.WARNING("Top faltantes (muestra):"))
            for k in sorted(missing_keys, key=lambda kk: counts[kk], reverse=True)[:10]:
                top, n = originals[k].most_common(1)[0]
                self.stdout.write(f"  - '{top}' (norm='{k}', usos={counts[k]}, prefer_prop={prefer_prop[k]})")

        # Crear Entidades faltantes si se pidió
        created = 0
        if missing_keys and create_missing:
            with transaction.atomic():
                for k in missing_keys:
                    # Elegimos como nombre la forma original más frecuente
                    orig = originals[k].most_common(1)[0][0]
                    if not dry:
                        ent = Entidad.objects.create(
                            nombre=orig,
                            responsable="",
                            cargo="",
                        )
                        ents[k] = ent
                        created += 1
            self.stdout.write(self.style.SUCCESS(f"Entidades creadas: {created}"))
        elif missing_keys:
            self.stdout.write(self.style.WARNING(
                "Hay claves sin Entidad. Corré con --create-missing para crearlas automáticamente o crealas manualmente."
            ))

        # Vincular FK
        to_update, updated = [], 0
        qs2 = BaseDeDatosBia.objects.filter(entidad__isnull=True).only('id_pago_unico', 'propietario', 'entidadinterna', 'entidad_id')
        for row in qs2.iterator(chunk_size=2000):
            # Preferimos propietario; si no, entidadinterna
            src = (row.propietario or "").strip()
            if not src:
                src = (row.entidadinterna or "").strip()
            if not src:
                continue
            ent = ents.get(norm(src))
            if ent:
                row.entidad_id = ent.id
                to_update.append(row)
                if len(to_update) >= batch_size:
                    if not dry:
                        BaseDeDatosBia.objects.bulk_update(to_update, ['entidad_id'])
                    updated += len(to_update)
                    to_update.clear()

        if to_update:
            if not dry:
                BaseDeDatosBia.objects.bulk_update(to_update, ['entidad_id'])
            updated += len(to_update)

        remaining = BaseDeDatosBia.objects.filter(entidad__isnull=True).count()

        self.stdout.write(self.style.SUCCESS(f"Filas vinculadas: {updated}"))
        self.stdout.write(self.style.NOTICE(f"Pendientes sin FK: {remaining}"))
