from rest_framework import serializers
from .models import BaseDeDatosBia

class BaseDeDatosBiaSerializer(serializers.ModelSerializer):
    class Meta:
        model = BaseDeDatosBia
        fields = '__all__'