from rest_framework import serializers
from .models import BaseDeDatosBia

class BaseDeDatosBiaSerializer(serializers.ModelSerializer):
    class Meta:
        model = BaseDeDatosBia
        fields = '__all__'
        read_only_fields = ["id", "dni", "id_pago_unico"]  # si no querés que se editen