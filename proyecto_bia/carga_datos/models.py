# carga_datos/models.py
from django.db import models
from django.db.models.functions import Lower

class BaseDeDatosBia(models.Model):
    id_pago_unico   = models.CharField(max_length=50, primary_key=True)

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
    dni                  = models.CharField(max_length=20)
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
