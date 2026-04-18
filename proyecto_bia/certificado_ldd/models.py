from django.db import models, transaction
from django.db.models.functions import Lower
from carga_datos.models import BaseDeDatosBia


class Entidad(models.Model):
    nombre       = models.CharField(max_length=255)
    responsable  = models.CharField(max_length=255, blank=True, default="")
    cargo        = models.CharField(max_length=255, blank=True, default="")
    logo         = models.ImageField(upload_to='logos_entidades/', null=True, blank=True)
    firma        = models.ImageField(upload_to='firmas_entidades/', null=True, blank=True)
    razon_social = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(Lower('nombre'), name='uq_entidad_nombre_ci')
        ]

    def __str__(self):
        return self.nombre


class PlantillaTexto(models.Model):
    """
    Plantilla versionada de texto para el PDF de certificados.
    Cada entidad puede tener múltiples versiones; solo una está activa.
    Los certificados ya emitidos quedan ligados a la versión que se usó,
    garantizando inmutabilidad del texto legal.
    """
    MODELO_CHOICES = [
        ('BIA',            'Genérico BIA'),
        ('WENANCE_TRUSTS', 'Wenance con fideicomisos'),
        ('AZUR',           'Azur Investment'),
        ('EMPRESA',        'Empresa'),
        ('GENERICO',       'Genérico con nombre de entidad'),
    ]

    PLACEHOLDERS_AYUDA = (
        'Placeholders disponibles — Párrafo 1: {nombre}, {dni}, {razon_social}, {id}, {entidad_original}. '
        'Asterisco: {razon_social}, {fecha_carga}. '
        'Solo WENANCE_TRUSTS: agregar {fiduciarios} en el párrafo 1 donde corresponda.'
    )

    entidad     = models.ForeignKey(Entidad, on_delete=models.CASCADE, related_name='plantillas')
    version     = models.PositiveIntegerField(editable=False, default=1)
    modelo_base = models.CharField(max_length=20, choices=MODELO_CHOICES, default='GENERICO')
    parrafo1    = models.TextField(help_text=PLACEHOLDERS_AYUDA)
    asterisco   = models.TextField(
        blank=True,
        help_text='Texto del bloque con asterisco (*). Puede quedar vacío.',
    )
    fiduciarios = models.CharField(
        max_length=500, blank=True,
        help_text='Solo WENANCE_TRUSTS. Fideicomisos separados por coma (ej: MERCHANT, CILSA, FINTOP, FINUP).',
    )
    activa    = models.BooleanField(default=True)
    creada_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'plantilla_texto'
        ordering = ['entidad', '-version']
        constraints = [
            models.UniqueConstraint(
                fields=['entidad', 'version'],
                name='uq_plantilla_entidad_version',
            )
        ]

    def __str__(self):
        estado = 'activa' if self.activa else 'inactiva'
        return f"{self.entidad.nombre} — v{self.version} ({estado})"

    @transaction.atomic
    def save(self, *args, **kwargs):
        if self._state.adding:
            # Auto-incrementar versión por entidad
            ultima = (
                PlantillaTexto.objects.filter(entidad=self.entidad)
                .order_by('-version')
                .values_list('version', flat=True)
                .first()
            )
            self.version = (ultima + 1) if ultima else 1
            # Desactivar la plantilla activa anterior para esta entidad
            if self.activa:
                PlantillaTexto.objects.filter(entidad=self.entidad, activa=True).update(activa=False)
        super().save(*args, **kwargs)


class Certificate(models.Model):
    client = models.OneToOneField(
        BaseDeDatosBia,
        on_delete=models.CASCADE,
        related_name='certificate',
        db_column='client_id',
    )
    pdf_file          = models.FileField(upload_to='certificados_generados/')
    generated_at      = models.DateTimeField(auto_now_add=True)
    plantilla_version = models.ForeignKey(
        PlantillaTexto,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='certificados',
        help_text='Versión de plantilla usada al generar este certificado (inmutable).',
    )

    class Meta:
        db_table = 'certificate'
