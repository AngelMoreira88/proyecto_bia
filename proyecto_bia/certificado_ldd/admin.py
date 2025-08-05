from django.contrib import admin
from .models import Entidad

@admin.register(Entidad)
class EntidadAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'responsable', 'cargo', 'razon_social')