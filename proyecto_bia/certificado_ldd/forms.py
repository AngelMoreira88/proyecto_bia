from django import forms
from .models import Entidad

class EntidadForm(forms.ModelForm):
    class Meta:
        model = Entidad
        fields = ['nombre', 'responsable', 'cargo', 'firma', 'logo', 'razon_social']
