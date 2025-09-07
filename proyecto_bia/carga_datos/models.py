from django.db import models, transaction
from django.db.models.functions import Lower
from django.db.models import Q
import uuid
from django.conf import settings
from django.utils import timezone


# ============================
# Contador transaccional simple
# ============================
class BusinessKeyCounter(models.Model):
    """
    Contador para claves de negocio. Usamos una sola fila con name='id_pago_unico'
    y last_value incrementándose bajo select_for_update (a prueba de carreras).
    """
    name = models.CharField(max_length=50, primary_key=True)
    last_value = models.BigIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'business_key_counter'


@transaction.atomic
def allocate_id_pago_unico_block(n: int) -> list[str]:
    """
    Reserva un bloque de 'n' IDs consecutivos de forma atómica.
    Devuelve una lista de strings (para compatibilidad con CharField).
    """
    if n <= 0:
        return []
    counter, _ = BusinessKeyCounter.objects.select_for_update().get_or_create(
        name='id_pago_unico', defaults={'last_value': 0}
    )
    start = counter.last_value + 1
    counter.last_value = counter.last_value + n
    counter.save(update_fields=['last_value', 'updated_at'])
    return [str(i) for i in range(start, start + n)]


@transaction.atomic
def allocate_id_pago_unico() -> str:
    """
    Reserva un único ID nuevo.
    """
    return allocate_id_pago_unico_block(1)[0]


class BaseDeDatosBia(models.Model):
    id = models.BigAutoField(primary_key=True)

    # ⚠️ Si ya tenés registros con id_pago_unico = NULL/vacío, primero corrélos con
    # un backfill y recién después cambiá null=False/blank=False en una migración.
    # Aun así, con la lógica de asignación ya nunca se crearán nulos.
    id_pago_unico   = models.CharField(
        max_length=50,
        db_index=True,
        unique=True,
        null=False,
        blank=False   
    )

    creditos        = models.CharField(max_length=255, blank=True, null=True)
    propietario     = models.CharField(max_length=255, blank=True, null=True, db_index=True)
    entidadoriginal = models.CharField(max_length=255, blank=True, null=True)
    entidadinterna  = models.CharField(max_length=255, db_index=True)

    entidad         = models.ForeignKey(
        'certificado_ldd.Entidad',
        on_delete=models.PROTECT,
        related_name='registros',
        null=True,
        blank=True,
    )

    grupo                = models.CharField(max_length=50, blank=True, null=True)
    tramo                = models.CharField(max_length=50, blank=True, null=True)
    comision             = models.DecimalField(max_digits=15, decimal_places=2, blank=True, null=True)
    dni                  = models.CharField(max_length=20, db_index=True, null=True, blank=True)
    cuit                 = models.CharField(max_length=20, blank=True, null=True)
    nombre_apellido      = models.CharField(max_length=255, blank=True, null=True)
    fecha_apertura       = models.DateField(blank=True, null=True)
    fecha_deuda          = models.DateField(blank=True, null=True)
    saldo_capital        = models.DecimalField(max_digits=15, decimal_places=2, blank=True, null=True)
    saldo_exigible       = models.DecimalField(max_digits=15, decimal_places=2, blank=True, null=True)
    interes_diario       = models.DecimalField(max_digits=7, decimal_places=4, blank=True, null=True)
    interes_total        = models.DecimalField(max_digits=15, decimal_places=2, blank=True, null=True)
    saldo_actualizado    = models.DecimalField(max_digits=15, decimal_places=2, blank=True, null=True)
    cancel_min           = models.CharField(max_length=50, blank=True, null=True)
    cod_rp               = models.CharField(max_length=50, blank=True, null=True)
    agencia              = models.CharField(max_length=100, blank=True, null=True)
    estado               = models.CharField(max_length=50, blank=True, null=True)
    sub_estado           = models.CharField(max_length=50, blank=True, null=True)
    tel1                 = models.CharField(max_length=50, blank=True, null=True)
    tel2                 = models.CharField(max_length=50, blank=True, null=True)
    tel3                 = models.CharField(max_length=50, blank=True, null=True)
    tel4                 = models.CharField(max_length=50, blank=True, null=True)
    tel5                 = models.CharField(max_length=50, blank=True, null=True)
    mail1                = models.EmailField(blank=True, null=True)
    mail2                = models.EmailField(blank=True, null=True)
    mail3                = models.EmailField(blank=True, null=True)
    provincia            = models.CharField(max_length=100, blank=True, null=True)
    pago_acumulado       = models.DecimalField(max_digits=15, decimal_places=2, blank=True, null=True)
    ultima_fecha_pago    = models.DateField(blank=True, null=True)
    fecha_plan           = models.DateField(blank=True, null=True)
    anticipo             = models.DecimalField(max_digits=15, decimal_places=2, blank=True, null=True)
    cuotas               = models.IntegerField(blank=True, null=True)
    importe              = models.DecimalField(max_digits=15, decimal_places=2, blank=True, null=True)
    total_plan           = models.DecimalField(max_digits=15, decimal_places=2, blank=True, null=True)
    saldo                = models.DecimalField(max_digits=15, decimal_places=2, blank=True, null=True)

    @property
    def entidad_obj(self):
        if self.entidad_id:
            return self.entidad
        from certificado_ldd.models import Entidad
        if self.propietario:
            ent = Entidad.objects.filter(nombre__iexact=self.propietario).first()
            if ent:
                return ent
        return Entidad.objects.filter(nombre__iexact=self.entidadinterna).first()

    class Meta:
        db_table = 'db_bia'
        managed  = True
        indexes = [
            models.Index(Lower('propietario'), name='idx_bdb_prop_lower'),
            models.Index(Lower('entidadinterna'), name='idx_bdb_entint_lower'),
        ]
        # Si usás PostgreSQL  (Django 4.1+): valida que id_pago_unico tenga sólo dígitos cuando no es NULL.
        # Si tu proyecto NO usa Postgres o versión vieja de Django, podés omitir este CheckConstraint.
        constraints = [
            models.CheckConstraint(
                name='id_pago_unico_digits_or_null',
                check=Q(id_pago_unico__regex=r'^\d+$') | Q(id_pago_unico__isnull=True),
            ),
        ]

    def __str__(self):
        return f'{self.id_pago_unico or "—"} / {self.dni or ""}'

    # Nota: bulk_create NO llama save(). Por eso la asignación se hace en las vistas masivas.
    def save(self, *args, **kwargs):
        # Si viene vacío/None, asignamos uno nuevo.
        if not self.id_pago_unico or str(self.id_pago_unico).strip() == '':
            self.id_pago_unico = allocate_id_pago_unico()
        else:
            # Normalizamos a string y sin espacios
            self.id_pago_unico = str(self.id_pago_unico).strip()
        super().save(*args, **kwargs)


class BulkJob(models.Model):
    class Status(models.TextChoices):
        READY = 'ready_to_commit', 'Ready to commit'
        COMMITTED = 'committed', 'Committed'
        CANCELLED = 'cancelled', 'Cancelled'
        FAILED = 'failed', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    filename = models.CharField(max_length=255, blank=True, default='')
    file_hash = models.CharField(max_length=128, blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='bulk_jobs'
    )
    status = models.CharField(
        max_length=32, choices=Status.choices, default=Status.READY, db_index=True
    )
    summary = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    committed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'bulk_job'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['file_hash']),
        ]

    def __str__(self):
        return f'BulkJob {self.id} ({self.filename}) - {self.status}'

    def mark_committed(self):
        self.status = self.Status.COMMITTED
        self.committed_at = timezone.now()
        self.save(update_fields=['status', 'committed_at'])


class StagingBulkChange(models.Model):
    class Operation(models.TextChoices):
        UPDATE = 'UPDATE', 'Update'
        INSERT = 'INSERT', 'Insert'
        DELETE = 'DELETE', 'Delete'
        NOCHANGE = 'NOCHANGE', 'No change'

    job = models.ForeignKey(
        BulkJob, on_delete=models.CASCADE, related_name='staging_rows', db_index=True
    )
    business_key = models.CharField(max_length=255)  # ej: id_pago_unico / dni
    op = models.CharField(max_length=16, choices=Operation.choices, default=Operation.UPDATE)
    payload = models.JSONField(default=dict, blank=True)
    validation_errors = models.JSONField(default=list, blank=True)
    can_apply = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'staging_bulk_change'
        unique_together = (('job', 'business_key'),)
        indexes = [
            models.Index(fields=['job', 'business_key']),
            models.Index(fields=['op']),
            models.Index(fields=['can_apply']),
        ]
        ordering = ['business_key']

    def __str__(self):
        return f'Staging[{self.job_id}] {self.business_key} ({self.op})'


class AuditLog(models.Model):
    class Action(models.TextChoices):
        UPDATE = 'UPDATE', 'Update'
        INSERT = 'INSERT', 'Insert'
        DELETE = 'DELETE', 'Delete'

    table_name = models.CharField(max_length=128, db_index=True)
    business_key = models.CharField(max_length=255, db_index=True)
    field = models.CharField(max_length=128, db_index=True)

    old_value = models.TextField(null=True, blank=True)
    new_value = models.TextField(null=True, blank=True)

    job = models.ForeignKey(BulkJob, null=True, blank=True,
                            on_delete=models.SET_NULL, related_name='audit_logs')
    action = models.CharField(max_length=16, choices=Action.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='bulk_audit_events'
    )
    ts = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'audit_log'
        indexes = [
            models.Index(fields=['table_name', 'business_key']),
            models.Index(fields=['job']),
            models.Index(fields=['ts']),
        ]
        ordering = ['-ts']

    def __str__(self):
        return f'Audit[{self.action}] {self.table_name}.{self.field} ({self.business_key})'
