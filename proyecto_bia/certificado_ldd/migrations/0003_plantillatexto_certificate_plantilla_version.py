import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('certificado_ldd', '0002_alter_certificate_client_entidad_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='PlantillaTexto',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('version', models.PositiveIntegerField(default=1, editable=False)),
                ('modelo_base', models.CharField(
                    choices=[
                        ('BIA', 'Genérico BIA'),
                        ('WENANCE_TRUSTS', 'Wenance con fideicomisos'),
                        ('AZUR', 'Azur Investment'),
                        ('EMPRESA', 'Empresa'),
                        ('GENERICO', 'Genérico con nombre de entidad'),
                    ],
                    default='GENERICO',
                    max_length=20,
                )),
                ('parrafo1', models.TextField()),
                ('asterisco', models.TextField(blank=True)),
                ('fiduciarios', models.CharField(blank=True, max_length=500)),
                ('activa', models.BooleanField(default=True)),
                ('creada_en', models.DateTimeField(auto_now_add=True)),
                ('entidad', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='plantillas',
                    to='certificado_ldd.entidad',
                )),
            ],
            options={
                'db_table': 'plantilla_texto',
                'ordering': ['entidad', '-version'],
            },
        ),
        migrations.AddConstraint(
            model_name='plantillatexto',
            constraint=models.UniqueConstraint(
                fields=['entidad', 'version'],
                name='uq_plantilla_entidad_version',
            ),
        ),
        migrations.AddField(
            model_name='certificate',
            name='plantilla_version',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='certificados',
                to='certificado_ldd.plantillatexto',
                help_text='Versión de plantilla usada al generar este certificado (inmutable).',
            ),
        ),
    ]
