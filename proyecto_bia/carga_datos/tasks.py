# carga_datos/tasks.py
import csv
import logging
from pathlib import Path

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from .models import BaseDeDatosBia, ExportJobBia

logger = logging.getLogger("django.request")


def _get_export_dir() -> Path:
    """
    Directorio donde se guardan los CSV de exportación.

    Por defecto: MEDIA_ROOT / "exports_bia"
    Podés cambiarlo con BIA_EXPORT_DIR en settings si querés.
    """
    base_dir = getattr(settings, "BIA_EXPORT_DIR", None)
    if base_dir:
        export_dir = Path(base_dir)
    else:
        media_root = Path(getattr(settings, "MEDIA_ROOT", Path(".")))
        export_dir = media_root / "exports_bia"

    export_dir.mkdir(parents=True, exist_ok=True)
    return export_dir


@shared_task
def exportar_db_bia_job(job_id: int):
    """
    Tarea Celery que genera un CSV con la tabla BaseDeDatosBia (opcionalmente filtrada).
    Actualiza el ExportJobBia con progreso y URL del archivo.
    """
    try:
        job = ExportJobBia.objects.get(pk=job_id)
    except ExportJobBia.DoesNotExist:
        logger.error(f"[ExportJobBia] job_id={job_id} no existe.")
        return

    # Evitamos re-ejecutar jobs ya completados
    if job.status not in (ExportJobBia.Status.PENDING, ExportJobBia.Status.FAILED):
        logger.info(f"[ExportJobBia] job_id={job_id} en estado {job.status}, se omite.")
        return

    job.status = ExportJobBia.Status.RUNNING
    job.error_message = ""
    job.save(update_fields=["status", "error_message", "updated_at"])

    try:
        # Construimos queryset con filtros
        qs = BaseDeDatosBia.objects.all().order_by("id")
        filters = job.filters or {}

        dni = filters.get("dni")
        idp = filters.get("id_pago_unico")

        if dni:
            qs = qs.filter(dni=str(dni).strip())
        if idp:
            qs = qs.filter(id_pago_unico=str(idp).strip())

        total_rows = qs.count()
        job.total_rows = total_rows
        job.processed_rows = 0
        job.save(update_fields=["total_rows", "processed_rows", "updated_at"])

        # Directorio y nombre de archivo
        export_dir = _get_export_dir()
        ts = timezone.localtime().strftime("%Y%m%d_%H%M%S")
        file_name = f"db_bia_export_{job.id}_{ts}.csv"
        file_path = export_dir / file_name

        fields = [f.name for f in BaseDeDatosBia._meta.fields]

        # Escritura incremental en CSV
        with file_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(fields)  # encabezados

            processed = 0
            for row in qs.values_list(*fields).iterator(chunk_size=5000):
                writer.writerow(["" if v is None else str(v) for v in row])
                processed += 1

                # Cada 10k filas actualizamos progreso
                if processed % 10000 == 0:
                    job.processed_rows = processed
                    job.save(update_fields=["processed_rows", "updated_at"])

        job.processed_rows = total_rows

        # Construimos URL pública (asumiendo MEDIA_URL sirve MEDIA_ROOT)
        media_url = getattr(settings, "MEDIA_URL", "/media/")
        media_url = media_url if media_url.endswith("/") else media_url + "/"

        # Por defecto usamos subcarpeta "exports_bia" dentro de MEDIA_ROOT
        job.file_name = file_name
        job.file_url = f"{media_url}exports_bia/{file_name}"

        job.status = ExportJobBia.Status.COMPLETED
        job.save(
            update_fields=[
                "status",
                "file_name",
                "file_url",
                "processed_rows",
                "updated_at",
            ]
        )

        logger.info(
            f"[ExportJobBia] job_id={job.id} completado. filas={total_rows} archivo={file_path}"
        )

    except Exception as e:
        logger.exception(f"[ExportJobBia] Error en exportar_db_bia_job job_id={job_id}: {e}")
        job.status = ExportJobBia.Status.FAILED
        job.error_message = str(e)
        job.save(update_fields=["status", "error_message", "updated_at"])
