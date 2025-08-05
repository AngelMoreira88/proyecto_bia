from django.db import models

class BaseDeDatosBia(models.Model):
    id_pago_unico        = models.CharField(max_length=50, primary_key=True)
    propietario          = models.CharField(max_length=255, blank=True, null=True)
    entidadoriginal      = models.CharField(max_length=255, blank=True, null=True)
    entidadinterna       = models.CharField(max_length=255)
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

    class Meta:
        # Si querés que la tabla se llame db_bia en lugar de carga_datos_basededatosbia,
        # mantené esto; si no, podés borrarlo y Django usará el nombre por defecto.
        db_table = 'db_bia'
        managed  = True

