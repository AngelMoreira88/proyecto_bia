# carga_datos/models.py
from django.db import models
from django.db.models.functions import Lower
import uuid
from django.conf import settings
from django.utils import timezone


class BaseDeDatosBia(models.Model):
    id = models.BigAutoField(primary_key=True)  # PK técnica recomendada
    id_pago_unico   = models.CharField(max_length=50, db_index=True, null=True, blank=True, unique=True)
    creditos        = models.CharField(max_length=255, blank=True, null=True)
    propietario     = models.CharField(max_length=255, blank=True, null=True, db_index=True)
    entidadoriginal = models.CharField(max_length=255, blank=True, null=True)
    entidadinterna  = models.CharField(max_length=255, db_index=True)

    # FK canónica a Entidad (emisora). Al principio puede ser null; después la volvés obligatoria.
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

    # Compatibilidad temporal
    @property
    def entidad_obj(self):
        if self.entidad_id:
            return self.entidad
        from certificado_ldd.models import Entidad
        # preferir propietario; si no, entidadinterna
        if self.propietario:
            ent = Entidad.objects.filter(nombre__iexact=self.propietario).first()
            if ent:
                return ent
        return Entidad.objects.filter(nombre__iexact=self.entidadinterna).first()

    class Meta:
        db_table = 'db_bia'
        managed  = True
        # (Opcional, PostgreSQL) índices funcionales para búsquedas case-insensitive
        indexes = [
            models.Index(Lower('propietario'), name='idx_bdb_prop_lower'),
            models.Index(Lower('entidadinterna'), name='idx_bdb_entint_lower'),
        ]


class BulkJob(models.Model):
    class Status(models.TextChoices):
        READY = 'ready_to_commit', 'Ready to commit'
        COMMITTED = 'committed', 'Committed'
        CANCELLED = 'cancelled', 'Cancelled'
        FAILED = 'failed', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    filename = models.CharField(max_length=255, blank=True, default='')
    file_hash = models.CharField(max_length=128, blank=True, default='')  # sha256 sugerido
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='bulk_jobs'
    )
    status = models.CharField(
        max_length=32, choices=Status.choices, default=Status.READY, db_index=True
    )
    summary = models.JSONField(default=dict, blank=True)  # contadores, columnas afectadas, etc.
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
    payload = models.JSONField(default=dict, blank=True)            # fila propuesta (valores nuevos)
    validation_errors = models.JSONField(default=list, blank=True)  # lista[str] o dict por campo
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