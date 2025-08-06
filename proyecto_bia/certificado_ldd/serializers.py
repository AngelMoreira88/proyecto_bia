from rest_framework import serializers
from .models import Certificate, Entidad
from .models import BaseDeDatosBia

class CertificateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Certificate
        fields = "__all__"
        
class EntidadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Entidad
        fields = '__all__'

class BaseDeDatosBiaSerializer(serializers.ModelSerializer):
    class Meta:
        model = BaseDeDatosBia
        fields = '__all__'