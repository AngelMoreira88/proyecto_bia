# certificado_ldd/models.py
from django.db import models
from carga_datos.models import BaseDeDatosBia  # importa desde app carga_datos

class Certificate(models.Model):
    client = models.OneToOneField(
        BaseDeDatosBia,
        on_delete=models.CASCADE,
        to_field='id_pago_unico',  # PK real
        db_column='client_id'
    )
    pdf_file = models.FileField(upload_to='certificados_generados/')
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'certificate'

