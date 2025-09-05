# carga_datos/views_bulk.py
import io
import uuid
import math
import hashlib
from typing import Dict, Any, List, Tuple

import pandas as pd
from django.db import transaction, models
from django.utils import timezone
from django.contrib.auth.models import Group
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from carga_datos.models import (
    BulkJob,
    StagingBulkChange,
    AuditLog,
    # Ajustá el import de tu tabla productiva si está en otra app:
    BaseDeDatosBia,
)
from carga_datos.utils_preview import render_preview_table


# ====== Config básica del módulo ======
BUSINESS_KEY_FIELD = "id_pago_unico"  # Clave de negocio en tu DB
ALLOW_INSERTS = True                  # Permitir INSERTs opcionales
ALLOW_DELETES = False                 # Borrado masivo deshabilitado por defecto
ACCEPTED_OPS = {"UPDATE", "INSERT", "DELETE", "NOCHANGE"}

# Roles de ejemplo (si usás Groups de Django)
VALIDATE_ROLES = {"admin", "editor", "approver"}
COMMIT_ROLES   = {"admin", "approver"}


# ====== Helpers ======
def user_in_roles(user, roles: set) -> bool:
    """
    Verifica si el usuario pertenece a alguno de los grupos/roles indicados.
    Si no usás Groups, adaptá esta función a tu mecanismo de permisos.
    """
    if not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    user_groups = set(user.groups.values_list("name", flat=True))
    return bool(user_groups & roles)


def _sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _is_nan(x: Any) -> bool:
    try:
        return isinstance(x, float) and math.isnan(x)
    except Exception:
        return False


def _normalize_val(v: Any) -> Any:
    """
    Normaliza valores provenientes de pandas para comparaciones/setattr.
    Convierte NaN → None; strings recortadas; mantiene tipos básicos.
    """
    if _is_nan(v):
        return None
    if isinstance(v, str):
        return v.strip()
    return v


def _model_concrete_fields(model_cls) -> Dict[str, models.Field]:
    """
    Devuelve {nombre_campo: Field} para campos concretos (evita relaciones inversas).
    """
    res = {}
    for f in model_cls._meta.get_fields():
        if isinstance(f, models.Field) and not (f.many_to_many or f.one_to_many):
            res[f.name] = f
    return res


def _coerce_to_field(field: models.Field, value: Any) -> Tuple[Any, str]:
    """
    Intenta convertir 'value' al tipo del campo. Devuelve (valor_convertido, error_str).
    error_str = '' si no hubo error.
    """
    try:
        return field.to_python(value), ""
    except Exception as e:
        return None, f"{field.name}: {e}"


# ====== ENDPOINT: VALIDATE (dry-run + staging + preview) ======
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bulk_validate(request):
    """
    Recibe 'archivo' (CSV/XLS/XLSX).
    - Lee y valida filas.
    - Calcula diffs contra BaseDeDatosBia.
    - Guarda en staging (StagingBulkChange).
    - Devuelve job_id + preview HTML + summary.
    """
    if not user_in_roles(request.user, VALIDATE_ROLES):
        return Response({"errors": ["No tenés permisos para validar cambios."]}, status=403)

    f = request.FILES.get("archivo")
    if not f:
        return Response({"errors": ["Archivo requerido."]}, status=400)

    file_bytes = f.read()
    file_hash = _sha256_bytes(file_bytes)

    # Carga del archivo
    name = f.name.lower()
    if name.endswith((".xlsx", ".xls")):
        df = pd.read_excel(io.BytesIO(file_bytes))
    else:
        # read_csv intenta detectar separador; si usás ; podés pasar sep=';'
        df = pd.read_csv(io.BytesIO(file_bytes))

    if df.empty:
        return Response({"errors": ["El archivo está vacío."]}, status=400)

    # Validar columna clave de negocio
    cols = [str(c).strip() for c in df.columns]
    if BUSINESS_KEY_FIELD not in cols and "business_key" not in cols:
        return Response({"errors": [f"Falta la columna clave '{BUSINESS_KEY_FIELD}'"]}, status=400)

    # Mapear nombres originales → normalizados
    col_map = {c: c.strip() for c in df.columns}
    df.rename(columns=col_map, inplace=True)

    # Campos del modelo para validar columnas editables
    fields_map = _model_concrete_fields(BaseDeDatosBia)
    allowed_cols = set(fields_map.keys())

    # Crear Job
    job = BulkJob.objects.create(
        id=uuid.uuid4(),
        filename=f.name,
        file_hash=file_hash,
        created_by=request.user,
        status=BulkJob.Status.READY,
        summary={},
    )

    summary = {
        "total": int(len(df)),
        "ok": 0,
        "con_errores": 0,
        "updates": 0,
        "inserts": 0,
        "deletes": 0,
        "nochange": 0,
    }

    preview_rows: List[Dict[str, Any]] = []

    with transaction.atomic():
        for _, row in df.iterrows():
            payload_raw = {k: _normalize_val(v) for k, v in row.to_dict().items()}
            bkey = payload_raw.get(BUSINESS_KEY_FIELD) or payload_raw.get("business_key")
            if not bkey:
                # Fila sin clave → error
                errs = [f"Falta '{BUSINESS_KEY_FIELD}' en la fila."]
                StagingBulkChange.objects.create(
                    job=job,
                    business_key="(sin_clave)",
                    op=StagingBulkChange.Operation.NOCHANGE,
                    payload=payload_raw,
                    validation_errors=errs,
                    can_apply=False,
                )
                summary["con_errores"] += 1
                preview_rows.append({
                    "id_pago_unico": "(sin_clave)",
                    "op": "NOCHANGE",
                    "errors": errs,
                    "changes": {},
                })
                continue

            # Determinar operación solicitada (__op) si existe
            op_in = str(payload_raw.get("__op") or "").upper().strip()
            if op_in and op_in not in ACCEPTED_OPS:
                op_in = ""  # ignorar valor inválido → será inferido

            # Buscar registro actual por clave
            current = BaseDeDatosBia.objects.filter(**{BUSINESS_KEY_FIELD: bkey}).first()

            # Armar payload filtrando solo columnas válidas (evita setear campos inexistentes)
            payload = {}
            errors: List[str] = []
            for k, v in payload_raw.items():
                if k in {BUSINESS_KEY_FIELD, "business_key", "__op"}:
                    continue
                if k not in allowed_cols:
                    # columna desconocida → advertencia (puede ser nombre mal escrito)
                    errors.append(f"Columna desconocida: {k}")
                    continue
                # Convertir al tipo del campo (según modelo)
                coerced, err = _coerce_to_field(fields_map[k], v)
                if err:
                    errors.append(err)
                else:
                    payload[k] = coerced

            # Calcular op (INSERT/UPDATE/NOCHANGE/DELETE)
            if current:
                # Determinar cambios de valor
                changes = {}
                for k, newv in payload.items():
                    oldv = getattr(current, k, None)
                    if (newv is not None or oldv is not None) and str(oldv) != str(newv):
                        changes[k] = {"old": oldv, "new": newv}

                if op_in == "DELETE":
                    op = "DELETE"
                elif changes:
                    op = "UPDATE"
                else:
                    op = "NOCHANGE"
            else:
                # No existe en DB
                if op_in == "DELETE":
                    op = "NOCHANGE"  # no hay nada que borrar
                    errors.append("DELETE ignorado: clave no existe en DB.")
                elif ALLOW_INSERTS or op_in == "INSERT":
                    op = "INSERT"
                else:
                    op = "NOCHANGE"
                    errors.append("Registro no existe y los INSERTs no están habilitados.")

                changes = {k: {"old": None, "new": v} for k, v in payload.items()} if op == "INSERT" else {}

            # Verificar permisos para DELETE/INSERT si están deshabilitados
            if op == "DELETE" and not ALLOW_DELETES:
                errors.append("Borrado masivo deshabilitado por configuración.")
                can_apply = False
            else:
                can_apply = (op in {"UPDATE", "INSERT", "DELETE"}) and (len(errors) == 0)

            # Guardar staging
            StagingBulkChange.objects.update_or_create(
                job=job,
                business_key=str(bkey),
                defaults={
                    "op": op,
                    "payload": payload_raw,     # guardamos la fila completa recibida (traza)
                    "validation_errors": errors,
                    "can_apply": can_apply,
                },
            )

            # Summary/preview
            if op == "UPDATE":
                summary["updates"] += 1
            elif op == "INSERT":
                summary["inserts"] += 1
            elif op == "DELETE":
                summary["deletes"] += 1
            elif op == "NOCHANGE":
                summary["nochange"] += 1

            if can_apply:
                summary["ok"] += 1
            else:
                summary["con_errores"] += 1

            preview_rows.append({
                "id_pago_unico": str(bkey),
                "op": op,
                "errors": errors,
                "changes": changes,
            })

    # Persistir summary y render de preview
    job.summary = summary
    job.save(update_fields=["summary"])

    preview_html = render_preview_table(preview_rows, title="Vista previa — Ajuste masivo")

    return Response({
        "success": True,
        "job_id": str(job.id),
        "preview": preview_html,
        "summary": summary,
    })
    

# ====== ENDPOINT: COMMIT (aplicar cambios atómicamente + auditoría) ======
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bulk_commit(request):
    """
    Recibe { job_id }. Aplica cambios en transacción:
    - UPDATE/INSERT/DELETE según staging y configuración.
    - Escribe AuditLog por campo modificado.
    - Marca el Job como committed.
    """
    if not user_in_roles(request.user, COMMIT_ROLES):
        return Response({"errors": ["No tenés permisos para confirmar cambios."]}, status=403)

    job_id = request.data.get("job_id")
    if not job_id:
        return Response({"errors": ["'job_id' requerido."]}, status=400)

    job = BulkJob.objects.filter(id=job_id, status=BulkJob.Status.READY).first()
    if not job:
        return Response({"errors": ["Job inválido o ya procesado."]}, status=400)

    staging_qs = StagingBulkChange.objects.filter(job=job, can_apply=True)
    if not staging_qs.exists():
        return Response({"errors": ["No hay cambios aplicables para este job."]}, status=400)

    # Cache de campos del modelo
    fields_map = _model_concrete_fields(BaseDeDatosBia)
    field_names = set(fields_map.keys())

    # Agrupar por operación
    rows = list(staging_qs.values("business_key", "op", "payload"))
    keys = [r["business_key"] for r in rows]

    # Cargar existentes de una sola vez
    existentes = {getattr(o, BUSINESS_KEY_FIELD): o
                  for o in BaseDeDatosBia.objects.filter(**{f"{BUSINESS_KEY_FIELD}__in": keys})}

    updates_instances = []
    inserts_instances = []
    deletes_keys = []

    # Para bulk_update, necesitamos el conjunto de campos que realmente se cambian
    changed_fields_union = set()

    with transaction.atomic():
        for r in rows:
            bkey = r["business_key"]
            op = (r["op"] or "").upper()
            payload_raw = r["payload"] or {}

            # Construir payload limpio solo con campos del modelo (coerción de tipos)
            payload_clean = {}
            for k, v in payload_raw.items():
                if k in {BUSINESS_KEY_FIELD, "business_key", "__op"}:
                    continue
                if k not in field_names:
                    continue
                coerced, err = _coerce_to_field(fields_map[k], _normalize_val(v))
                if err:
                    # No debería ocurrir si pasó validación, pero evitamos romper el commit
                    continue
                payload_clean[k] = coerced

            if op == "UPDATE":
                if bkey not in existentes:
                    # No existe ahora (fue borrado o cambió la clave) → ignorar este update
                    continue
                obj = existentes[bkey]
                # Detectar cambios reales y auditarlos
                local_changed_fields = []
                for k, newv in payload_clean.items():
                    oldv = getattr(obj, k, None)
                    if (newv is not None or oldv is not None) and str(oldv) != str(newv):
                        # Auditoría por campo
                        AuditLog.objects.create(
                            table_name=BaseDeDatosBia._meta.db_table,
                            business_key=str(bkey),
                            field=k,
                            old_value=str(oldv) if oldv is not None else None,
                            new_value=str(newv) if newv is not None else None,
                            job=job,
                            action=AuditLog.Action.UPDATE,
                            actor=request.user,
                        )
                        setattr(obj, k, newv)
                        local_changed_fields.append(k)

                if local_changed_fields:
                    updates_instances.append(obj)
                    changed_fields_union.update(local_changed_fields)

            elif op == "INSERT" and ALLOW_INSERTS:
                if bkey in existentes:
                    # Ya existe → ignoramos insert (o podrías convertirlo en update)
                    continue
                obj = BaseDeDatosBia(**{BUSINESS_KEY_FIELD: bkey})
                # Setear campos del payload
                for k, v in payload_clean.items():
                    setattr(obj, k, v)
                inserts_instances.append(obj)
                # Auditoría de INSERT (por campos con valor)
                for k, newv in payload_clean.items():
                    AuditLog.objects.create(
                        table_name=BaseDeDatosBia._meta.db_table,
                        business_key=str(bkey),
                        field=k,
                        old_value=None,
                        new_value=str(newv) if newv is not None else None,
                        job=job,
                        action=AuditLog.Action.INSERT,
                        actor=request.user,
                    )

            elif op == "DELETE" and ALLOW_DELETES:
                if bkey in existentes:
                    deletes_keys.append(bkey)
                    # Auditoría de DELETE (por registro completo)
                    AuditLog.objects.create(
                        table_name=BaseDeDatosBia._meta.db_table,
                        business_key=str(bkey),
                        field="*",
                        old_value="(row)",
                        new_value=None,
                        job=job,
                        action=AuditLog.Action.DELETE,
                        actor=request.user,
                    )

        # Aplicar INSERTs y UPDATEs
        if inserts_instances:
            # ignore_conflicts=True evita error si aparece duplicado en concurrente
            BaseDeDatosBia.objects.bulk_create(inserts_instances, ignore_conflicts=True)

        if updates_instances and changed_fields_union:
            BaseDeDatosBia.objects.bulk_update(updates_instances, fields=list(changed_fields_union))

        # Borrados (si estuvieran habilitados)
        if ALLOW_DELETES and deletes_keys:
            BaseDeDatosBia.objects.filter(**{f"{BUSINESS_KEY_FIELD}__in": deletes_keys}).delete()

        # Marcar job como committed
        job.status = BulkJob.Status.COMMITTED
        job.committed_at = timezone.now()
        job.save(update_fields=["status", "committed_at"])

    result = {
        "inserted": len(inserts_instances),
        "updated_rows": len(updates_instances),
        "deleted": len(deletes_keys) if ALLOW_DELETES else 0,
        "status": job.status,
    }
    return Response({"success": True, **result})
