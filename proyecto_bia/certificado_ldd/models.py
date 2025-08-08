# certificado_ldd/models.py
from django.db import models
from carga_datos.models import BaseDeDatosBia  # importa desde app carga_datos

class Certificate(models.Model):
    client = models.OneToOneField(BaseDeDatosBia, on_delete=models.CASCADE, to_field='id_pago_unico', db_column='client_id')
    pdf_file = models.FileField(upload_to='certificados_generados/')
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'certificate'

class Entidad(models.Model):
    nombre = models.CharField(max_length=100, unique=True)  # Debe coincidir con 'entidadinterna' en BaseDeDatosBia
    responsable = models.CharField(max_length=100)
    cargo = models.CharField(max_length=100)
    logo = models.ImageField(upload_to='logos_entidades/', blank=True, null=True)
    firma = models.ImageField(upload_to='firmas_entidades/', blank=True, null=True)
    razon_social = models.CharField(max_length=200, null=True, blank=True)

    def __str__(self):
        return self.nombre