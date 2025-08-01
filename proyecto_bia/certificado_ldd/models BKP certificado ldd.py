from django.db import models
from django.utils import timezone 

class ClientesBia(models.Model):
    entidad_nombre = models.CharField(max_length=255, blank=True, null=True)
    cartera = models.CharField(max_length=50, blank=True, null=True)
    legajo = models.CharField(max_length=50, blank=True, null=True)
    fecha_carga = models.DateField(blank=True, null=True)
    dni = models.CharField(max_length=20, blank=True, primary_key=True, null=False)
    nombre = models.CharField(max_length=255, blank=True, null=True)
    deuda_o = models.DecimalField(max_digits=15, decimal_places=2, blank=True, null=True)
    f_caida_real = models.DateField(blank=True, null=True)
    deuda = models.DecimalField(max_digits=15, decimal_places=2, blank=True, null=True)
    f_caida = models.DateField(blank=True, null=True)
    estado_leg = models.CharField(max_length=50, blank=True, null=True)
    promesa = models.DecimalField(max_digits=15, decimal_places=2, blank=True, null=True)
    convenio = models.CharField(max_length=10, blank=True, null=True)
    f_operacion = models.DateField(blank=True, null=True)
    estado_conv = models.CharField(max_length=20, blank=True, null=True)
    operador = models.CharField(max_length=255, blank=True, null=True)
    ult_tarea = models.CharField(max_length=50, blank=True, null=True)
    ult_tarea2 = models.CharField(max_length=50, blank=True, null=True)
    fecha_vto = models.DateField(blank=True, null=True)
    valor_cuota = models.DecimalField(max_digits=15, decimal_places=2, blank=True, null=True)
    observaciones = models.TextField(blank=True, null=True)
    estado_deudor = models.CharField(max_length=50, blank=True, null=True)
    id_operacion = models.IntegerField(blank=True, null=True)
    nro_operacion = models.IntegerField(blank=True, null=True)
    idpagounico = models.CharField(max_length=100, blank=True, null=True)
    promo = models.CharField(max_length=50, blank=True, null=True)
    segmentacion = models.CharField(max_length=50, blank=True, null=True)
    producto = models.CharField(max_length=100, blank=True, null=True)
    negocio = models.CharField(max_length=50, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'clientes_bia'
class Certificate(models.Model):
    client = models.OneToOneField('certificado_ldd.ClientesBia', on_delete=models.CASCADE, to_field='dni', db_column='client_id')
    pdf_file = models.FileField(upload_to='certificados_generados/')
    generated_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"Certificado para {self.client.dni}"
    class Meta:
        db_table = 'certificate'