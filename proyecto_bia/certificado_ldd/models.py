from django.db import models
from django.utils import timezone 

class BaseDeDatosBia(models.Model):
    id_pago_unico = models.CharField(max_length=50)
    propietario = models.CharField(max_length=100)
    entidad_original_1 = models.CharField(max_length=100)
    entidad_original_2 = models.CharField(max_length=100)
    grupo = models.CharField(max_length=100)
    tramo = models.CharField(max_length=100)
    comision = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    dni = models.CharField(max_length=20, primary_key=True)
    cuit = models.CharField(max_length=20)
    nombre_apellido = models.CharField(max_length=200)
    fecha_apertura = models.DateField(null=True, blank=True)
    fecha_deuda = models.DateField(null=True, blank=True)
    saldo_capital = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    saldo_exigible = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    interes_diario = models.DecimalField(max_digits=7, decimal_places=4, null=True, blank=True)
    interes_total = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    saldo_actualizado = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    cancel_min = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    cod_rp = models.CharField(max_length=50, null=True, blank=True)
    agencia = models.CharField(max_length=100, null=True, blank=True)
    estado = models.CharField(max_length=50, null=True, blank=True)
    sub_estado = models.CharField(max_length=50, null=True, blank=True)
    tel_1 = models.CharField(max_length=50, null=True, blank=True)
    tel_2 = models.CharField(max_length=50, null=True, blank=True)
    tel_3 = models.CharField(max_length=50, null=True, blank=True)
    tel_4 = models.CharField(max_length=50, null=True, blank=True)
    tel_5 = models.CharField(max_length=50, null=True, blank=True)
    mail_1 = models.EmailField(max_length=100, null=True, blank=True)
    mail_2 = models.EmailField(max_length=100, null=True, blank=True)
    mail_3 = models.EmailField(max_length=100, null=True, blank=True)
    provincia = models.CharField(max_length=100, null=True, blank=True)
    pago_acumulado = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    ultima_fecha_pago = models.DateField(null=True, blank=True)
    fecha_plan = models.DateField(null=True, blank=True)
    anticipo = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    cuotas = models.IntegerField(null=True, blank=True)
    importe = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    total_plan = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    saldo = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
        
class Certificate(models.Model):
    client = models.OneToOneField('certificado_ldd.BaseDeDatosBia', on_delete=models.CASCADE, to_field='dni', db_column='client_id')
    pdf_file = models.FileField(upload_to='certificados_generados/')
    generated_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"Certificado para {self.client.dni}"
    class Meta:
        db_table = 'certificate'