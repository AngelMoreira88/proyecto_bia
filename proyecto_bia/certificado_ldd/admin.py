from django.contrib import admin
from .models import Entidad, PlantillaTexto


class PlantillaTextoInline(admin.TabularInline):
    model = PlantillaTexto
    extra = 0
    readonly_fields = ('version', 'creada_en')
    fields = ('version', 'modelo_base', 'activa', 'parrafo1', 'asterisco', 'fiduciarios', 'creada_en')
    ordering = ('-version',)


@admin.register(Entidad)
class EntidadAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'responsable', 'cargo', 'razon_social', 'plantilla_activa')
    inlines = [PlantillaTextoInline]

    def plantilla_activa(self, obj):
        p = obj.plantillas.filter(activa=True).first()
        return f"v{p.version} — {p.get_modelo_base_display()}" if p else "Sin plantilla"
    plantilla_activa.short_description = 'Plantilla activa'


@admin.register(PlantillaTexto)
class PlantillaTextoAdmin(admin.ModelAdmin):
    list_display = ('entidad', 'version', 'modelo_base', 'activa', 'creada_en')
    list_filter = ('activa', 'modelo_base', 'entidad')
    readonly_fields = ('version', 'creada_en')
    ordering = ('entidad', '-version')
