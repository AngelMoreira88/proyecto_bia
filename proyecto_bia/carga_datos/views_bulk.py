# carga_datos/views_bulk.py
import io
import uuid
import math
import hashlib
from typing import Dict, Any, List, Tuple

import pandas as pd
from django.db import transaction, models
from django.utils import timezone
from django.apps import apps
from django.http import HttpResponse

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from openpyxl import Workbook
from openpyxl.styles import PatternFill, Font, Alignment
from openpyxl.utils import get_column_letter


from carga_datos.models import (
    BulkJob,
    StagingBulkChange,
    AuditLog,
    BaseDeDatosBia,
)
from carga_datos.utils_preview import render_preview_table

# =========================
# Configuración del módulo
# =========================
BUSINESS_KEY_FIELD = "id_pago_unico"     # Clave de negocio
ALLOW_INSERTS = True                     # Habilitar INSERT masivo
ALLOW_DELETES = False                    # Habilitar DELETE masivo
ACCEPTED_OPS = {"UPDATE", "INSERT", "DELETE", "NOCHANGE"}

# Roles / Grupos (si usás Groups)
VALIDATE_ROLES = {"admin", "editor", "approver"}
COMMIT_ROLES   = {"admin", "approver"}

# Campo FK a resolver por nombre o id
ENTIDAD_FIELD = "entidad"
ENTIDAD_APP_LABEL = "certificado_ldd"
ENTIDAD_MODEL_NAME = "Entidad"


# ==============
# Helper permisos
# ==============
def user_in_roles(user, roles: set) -> bool:
    if not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return bool(set(user.groups.values_list("name", flat=True)) & roles)


# ============
# Helper tipos
# ============
def _sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _is_nan(x: Any) -> bool:
    try:
        return isinstance(x, float) and math.isnan(x)
    except Exception:
        return False


def _normalize_val(v: Any) -> Any:
    """
    Normaliza valores que vienen de pandas:
    - NaN -> None
    - str -> trimmed
    - otros se devuelven tal cual
    """
    if _is_nan(v):
        return None
    if isinstance(v, str):
        s = v.strip()
        return s if s != "" else None
    return v


def _normalize_business_key(v: Any) -> str | None:
    """
    Normaliza la clave de negocio:
    - NaN/blank -> None
    - 12345.0 -> '12345'
    - 12345   -> '12345'
    - ' 001 ' -> '001'
    """
    v = _normalize_val(v)
    if v is None:
        return None
    # si es float con .0, casteamos a int
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v)


def _model_concrete_fields(model_cls) -> Dict[str, models.Field]:
    """
    {nombre_campo: Field} solo para campos concretos (sin M2M ni reverse).
    """
    res = {}
    for f in model_cls._meta.get_fields():
        if isinstance(f, models.Field) and not (f.many_to_many or f.one_to_many):
            res[f.name] = f
    return res


def _get_entidad_model():
    return apps.get_model(ENTIDAD_APP_LABEL, ENTIDAD_MODEL_NAME)


def _coerce_entidad_value(raw: Any) -> Tuple[Any, str]:
    """
    Acepta:
      - None / '' -> None (borra FK)
      - ID numérico -> valida existencia
      - Nombre (str) -> resuelve por nombre case-insensitive
    Devuelve (pk_o_none, error_str)
    """
    v = _normalize_val(raw)
    if v is None:
        return None, ""
    Entidad = _get_entidad_model()

    # si es numérico (o string numérico), tratamos como id
    s = str(v)
    if s.isdigit():
        pk = int(s)
        exists = Entidad.objects.filter(pk=pk).only("id").exists()
        return (pk if exists else None), ("" if exists else "entidad: id inexistente")

    # si es nombre
    obj = Entidad.objects.filter(nombre__iexact=s).only("id").first()
    if obj:
        return obj.pk, ""
    return None, "entidad: no encontrada por nombre"


def _coerce_to_field(field: models.Field, value: Any) -> Tuple[Any, str]:
    """
    Convierte al tipo del field. Para FK 'entidad' delega en _coerce_entidad_value.
    """
    if field.name == ENTIDAD_FIELD and isinstance(field, models.ForeignKey):
        return _coerce_entidad_value(value)
    try:
        return field.to_python(value), ""
    except Exception as e:
        return None, f"{field.name}: {e}"


# ===========
# VALIDATE
# ===========
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bulk_validate(request):
    """
    Recibe un archivo (CSV/XLS/XLSX) con columnas:
      - id_pago_unico (o business_key)
      - __op (opcional): UPDATE/INSERT/DELETE/NOCHANGE
      - y **todas** las columnas editables del modelo (todas excepto 'id' e 'id_pago_unico')

    Hace:
      - lectura/normalización
      - validación y cálculo de diffs contra DB
      - guarda staging (StagingBulkChange)
      - devuelve job_id + preview HTML + summary
    """
    if not user_in_roles(request.user, VALIDATE_ROLES):
        return Response({"errors": ["No tenés permisos para validar cambios."]}, status=403)

    f = request.FILES.get("archivo")
    if not f:
        return Response({"errors": ["Archivo requerido."]}, status=400)

    file_bytes = f.read()
    file_hash = _sha256_bytes(file_bytes)
    name = f.name.lower()

    # Leer en pandas
    if name.endswith((".xlsx", ".xls")):
        df = pd.read_excel(io.BytesIO(file_bytes))
    else:
        # si usás ; como separador, podés pasar sep=";"
        df = pd.read_csv(io.BytesIO(file_bytes))

    if df.empty:
        return Response({"errors": ["El archivo está vacío."]}, status=400)

    # Normalizamos headers (strip)
    df.rename(columns={c: str(c).strip() for c in df.columns}, inplace=True)
    cols = [str(c).strip() for c in df.columns]

    # Clave obligatoria
    if BUSINESS_KEY_FIELD not in cols and "business_key" not in cols:
        return Response({"errors": [f"Falta la columna clave '{BUSINESS_KEY_FIELD}'"]}, status=400)

    # Campos editables = TODOS los campos concretos menos la PK 'id' y la clave de negocio
    fields_map = _model_concrete_fields(BaseDeDatosBia)
    editable_cols = set(fields_map.keys()) - {"id", BUSINESS_KEY_FIELD}

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
        for _, s in df.iterrows():
            raw_row = {k: _normalize_val(v) for k, v in s.to_dict().items()}
            bkey = _normalize_business_key(raw_row.get(BUSINESS_KEY_FIELD) or raw_row.get("business_key"))
            if not bkey:
                errs = [f"Falta '{BUSINESS_KEY_FIELD}' en la fila."]
                StagingBulkChange.objects.create(
                    job=job,
                    business_key="(sin_clave)",
                    op=StagingBulkChange.Operation.NOCHANGE,
                    payload=raw_row,
                    validation_errors=errs,
                    can_apply=False,
                )
                summary["con_errores"] += 1
                preview_rows.append({
                    BUSINESS_KEY_FIELD: "(sin_clave)",
                    "op": "NOCHANGE",
                    "errors": errs,
                    "changes": {},
                })
                continue

            # __op (opcional)
            op_in = str(raw_row.get("__op") or "").upper().strip()
            if op_in and op_in not in ACCEPTED_OPS:
                op_in = ""  # ignoramos invalida -> se infiere

            # Filtramos payload solo por columnas editables
            payload_clean = {}
            errors: List[str] = []
            for k, v in raw_row.items():
                if k in {BUSINESS_KEY_FIELD, "business_key", "__op"}:
                    continue
                if k not in fields_map:
                    # columna inexistente en el modelo
                    errors.append(f"Columna desconocida: {k}")
                    continue
                if k not in editable_cols:
                    # id / id_pago_unico no son editables
                    errors.append(f"Columna no editable: {k}")
                    continue

                coerced, err = _coerce_to_field(fields_map[k], v)
                if err:
                    errors.append(err)
                else:
                    payload_clean[k] = coerced

            # Registro actual en DB (por clave)
            current = BaseDeDatosBia.objects.filter(**{BUSINESS_KEY_FIELD: bkey}).first()

            # Determinar operación e identificar cambios
            changes = {}
            if current:
                if op_in == "DELETE":
                    op = "DELETE"
                else:
                    for k, newv in payload_clean.items():
                        # comparar por valor "real" (para FK comparamos id)
                        oldv = getattr(current, f"{k}_id") if isinstance(fields_map[k], models.ForeignKey) else getattr(current, k, None)
                        cmp_old = None if oldv is None else str(oldv)
                        cmp_new = None if newv is None else (str(newv.pk) if hasattr(newv, "pk") else str(newv))
                        if cmp_old != cmp_new:
                            # valores display amigables en preview
                            if k == ENTIDAD_FIELD:
                                old_display = None
                                if getattr(current, f"{k}_id") is not None:
                                    old_ent = getattr(current, k)
                                    old_display = f"{old_ent.id} · {getattr(old_ent, 'nombre', '')}"
                                new_display = None
                                if newv is not None:
                                    # newv es pk (int) o None
                                    Entidad = _get_entidad_model()
                                    ent = Entidad.objects.filter(pk=newv).only("id", "nombre").first()
                                    new_display = f"{ent.id} · {ent.nombre}" if ent else str(newv)
                                changes[k] = {"old": old_display, "new": new_display}
                            else:
                                changes[k] = {"old": getattr(current, k, None), "new": newv}
                    if op_in in {"UPDATE", "NOCHANGE"}:
                        op = op_in
                    else:
                        op = "UPDATE" if changes else "NOCHANGE"
            else:
                # No existe en DB
                if op_in == "DELETE":
                    op = "NOCHANGE"
                    errors.append("DELETE ignorado: la clave no existe en DB.")
                elif ALLOW_INSERTS or op_in == "INSERT":
                    op = "INSERT"
                    for k, v in payload_clean.items():
                        if k == ENTIDAD_FIELD and v is not None:
                            Entidad = _get_entidad_model()
                            ent = Entidad.objects.filter(pk=v).only("id", "nombre").first()
                            disp = f"{ent.id} · {ent.nombre}" if ent else str(v)
                            changes[k] = {"old": None, "new": disp}
                        else:
                            changes[k] = {"old": None, "new": v}
                else:
                    op = "NOCHANGE"
                    errors.append("Registro no existe y los INSERTs no están habilitados.")

            # permisos para delete
            can_apply = (op in {"UPDATE", "INSERT", "DELETE"}) and len(errors) == 0
            if op == "DELETE" and not ALLOW_DELETES:
                errors.append("Borrado masivo deshabilitado por configuración.")
                can_apply = False

            # Staging (guardamos la fila cruda para traza)
            StagingBulkChange.objects.update_or_create(
                job=job,
                business_key=str(bkey),
                defaults=dict(
                    op=op,
                    payload=raw_row,
                    validation_errors=errors,
                    can_apply=can_apply,
                ),
            )

            # Summary
            summary["total"] += 0  # ya seteado arriba
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
                BUSINESS_KEY_FIELD: str(bkey),
                "op": op,
                "errors": errors,
                "changes": changes,
            })

    job.summary = summary
    job.save(update_fields=["summary"])

    preview_html = render_preview_table(preview_rows, title="Vista previa — Modificación masiva")

    return Response({
        "success": True,
        "job_id": str(job.id),
        "preview": preview_html,
        "summary": summary,
    })


# ===========
# COMMIT
# ===========
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bulk_commit(request):
    """
    Recibe { job_id } y aplica en transacción:
      - UPDATE/INSERT/DELETE
      - AuditLog por campo
      - Marca BulkJob como committed
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

    fields_map = _model_concrete_fields(BaseDeDatosBia)
    editable_cols = set(fields_map.keys()) - {"id", BUSINESS_KEY_FIELD}

    rows = list(staging_qs.values("business_key", "op", "payload"))
    keys = [r["business_key"] for r in rows]

    existentes = {
        getattr(o, BUSINESS_KEY_FIELD): o
        for o in BaseDeDatosBia.objects.filter(**{f"{BUSINESS_KEY_FIELD}__in": keys})
    }

    updates_instances = []
    inserts_instances = []
    deletes_keys = []
    changed_fields_union = set()

    with transaction.atomic():
        for r in rows:
            bkey = r["business_key"]
            op = (r["op"] or "").upper()
            raw = r["payload"] or {}

            # Construimos payload limpio y tipado
            payload_clean = {}
            for k, v in raw.items():
                if k in {BUSINESS_KEY_FIELD, "business_key", "__op"}:
                    continue
                if k not in editable_cols:
                    continue
                coerced, err = _coerce_to_field(fields_map[k], _normalize_val(v))
                if err:
                    continue
                payload_clean[k] = coerced

            if op == "UPDATE":
                obj = existentes.get(bkey)
                if not obj:
                    continue
                local_changed = []
                for k, newv in payload_clean.items():
                    oldv = getattr(obj, f"{k}_id") if isinstance(fields_map[k], models.ForeignKey) else getattr(obj, k, None)
                    cmp_old = None if oldv is None else str(oldv)
                    cmp_new = None if newv is None else (str(newv.pk) if hasattr(newv, "pk") else str(newv))
                    if cmp_old != cmp_new:
                        # setear valor
                        if isinstance(fields_map[k], models.ForeignKey):
                            setattr(obj, f"{k}_id", newv)
                        else:
                            setattr(obj, k, newv)
                        local_changed.append(k)

                        # auditoría
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
                if local_changed:
                    updates_instances.append(obj)
                    changed_fields_union.update(local_changed)

            elif op == "INSERT" and ALLOW_INSERTS:
                if bkey in existentes:
                    continue
                obj = BaseDeDatosBia(**{BUSINESS_KEY_FIELD: bkey})
                for k, v in payload_clean.items():
                    if isinstance(fields_map[k], models.ForeignKey):
                        setattr(obj, f"{k}_id", v)
                    else:
                        setattr(obj, k, v)
                inserts_instances.append(obj)
                # auditoría de insert (por campo con valor)
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

        # Aplicar cambios
        if inserts_instances:
            BaseDeDatosBia.objects.bulk_create(inserts_instances, ignore_conflicts=True)
        if updates_instances and changed_fields_union:
            BaseDeDatosBia.objects.bulk_update(updates_instances, fields=list(changed_fields_union))
        if ALLOW_DELETES and deletes_keys:
            BaseDeDatosBia.objects.filter(**{f"{BUSINESS_KEY_FIELD}__in": deletes_keys}).delete()

        job.status = BulkJob.Status.COMMITTED
        job.committed_at = timezone.now()
        job.save(update_fields=["status", "committed_at"])

    return Response({
        "success": True,
        "inserted_count": len(inserts_instances),
        "updated_count": len(updates_instances),
        "deleted_count": len(deletes_keys) if ALLOW_DELETES else 0,
        "status": job.status,
    })


# ===========================
# Plantilla .xlsx (dinámica)
# ===========================
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def bulk_template_xlsx(request):
    """
    Descarga una plantilla .xlsx con TODAS las columnas del modelo BaseDeDatosBia
    (en el mismo orden de definición), más:
      - id_pago_unico (primera columna)
      - __op (segunda columna), para UPDATE / INSERT / DELETE / NOCHANGE

    Nota:
      - 'id' NO se incluye porque no es editable y podría confundir (la operación usa id_pago_unico).
      - Para 'entidad' (FK) podés cargar ID numérico o nombre (case-insensitive).
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Datos"

    # 1) Campos del modelo en su orden real
    model_fields_in_order = [f.name for f in BaseDeDatosBia._meta.fields]
    # 2) Excluir 'id' y evitar duplicar la clave de negocio (la ponemos arriba)
    rest_fields = [n for n in model_fields_in_order if n not in {"id", BUSINESS_KEY_FIELD}]

    # 3) Headers finales: clave + __op + TODOS los campos restantes
    headers = [BUSINESS_KEY_FIELD, "__op"] + rest_fields

    # Estilos de header (Bootstrap primary #0D6EFD)
    from openpyxl.styles import PatternFill, Font, Alignment
    fill_header = PatternFill("solid", fgColor="0D6EFD")
    font_header = Font(color="FFFFFF", bold=True)
    align_center = Alignment(horizontal="center", vertical="center")

    # Escribir encabezados
    ws.append(headers)
    for c in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=c)
        cell.fill = fill_header
        cell.font = font_header
        cell.alignment = align_center

    # Filas de ejemplo (vacías salvo clave y op)
    samples = [
        # UPDATE de un registro existente
        ["10001", "UPDATE"] + [None] * len(rest_fields),
        # INSERT de un registro nuevo (si ALLOW_INSERTS=True)
        ["20001", "INSERT"] + [None] * len(rest_fields),
        # DELETE de un registro existente (si ALLOW_DELETES=True)
        ["30001", "DELETE"] + [None] * len(rest_fields),
    ]
    for row in samples:
        ws.append(row)

    # Ancho de columnas acorde al header (funciona > 26 columnas)
    for idx, h in enumerate(headers, start=1):
        col_letter = get_column_letter(idx)
        ws.column_dimensions[col_letter].width = max(12, min(32, len(h) + 2))

    # Hoja Guía
    ws2 = wb.create_sheet(title="Guía")
    guide_lines = [
        ["Cómo usar la planilla"],
        [f"• Debe incluir la columna '{BUSINESS_KEY_FIELD}' (o 'business_key') para identificar cada registro."],
        ["• La columna '__op' es opcional. Si la dejás vacía, se infiere UPDATE/NOCHANGE según los cambios."],
        ["• Operaciones válidas: UPDATE / INSERT / DELETE / NOCHANGE."],
        [f"• Se incluyen TODAS las columnas del modelo (salvo 'id'). Si dejás celdas vacías se interpretan como null."],
        ["• Para 'entidad': podés cargar el ID numérico o el nombre de la entidad (case-insensitive)."],
        ["• INSERT requiere que la clave no exista en DB; DELETE requiere que exista (si está habilitado)."],
        ["• No modifiques el nombre de las columnas; coinciden con el modelo y el backend las usa tal cual."],
        [""],
        ["Columnas incluidas en 'Datos':"],
        [", ".join(headers)],
    ]
    for line in guide_lines:
        ws2.append(line)
    ws2.column_dimensions["A"].width = 120
    ws2["A1"].font = Font(bold=True)
    ws2["A1"].fill = PatternFill("solid", fgColor="E9F2FF")

    # Responder archivo
    resp = HttpResponse(
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    resp["Content-Disposition"] = 'attachment; filename="plantilla_modificacion_masiva.xlsx"'
    wb.save(resp)
    return resp
