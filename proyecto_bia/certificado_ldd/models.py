# certificado_ldd/models.py
from django.db import models
from carga_datos.models import BaseDeDatosBia  # importa desde app carga_datos
from django.db.models.functions import Lower


class Certificate(models.Model):
    client = models.OneToOneField(BaseDeDatosBia, on_delete=models.CASCADE, to_field='id_pago_unico', db_column='client_id')
    pdf_file = models.FileField(upload_to='certificados_generados/')
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'certificate'

class Entidad(models.Model):
    nombre = models.CharField(max_length=255)
    responsable = models.CharField(max_length=255, blank=True, default="")
    cargo = models.CharField(max_length=255, blank=True, default="")
    logo = models.ImageField(upload_to='logos_entidades/', null=True, blank=True)
    firma = models.ImageField(upload_to='firmas_entidades/', null=True, blank=True)
    razon_social = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower('nombre'),
                name='uq_entidad_nombre_ci'
            )
        ]

    def __str__(self):
        return self.nombre