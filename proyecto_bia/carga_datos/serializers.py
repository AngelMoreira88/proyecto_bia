# carga_datos/serializers_admin.py
from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import BaseDeDatosBia

User = get_user_model()

# ============================================
# Serializers para BaseDeDatosBia (tu código)
# ============================================
class BaseDeDatosBiaSerializer(serializers.ModelSerializer):
    class Meta:
        model = BaseDeDatosBia
        fields = '__all__'
        read_only_fields = ["id", "dni", "id_pago_unico"]  # si no querés que se editen


# ============================================
# Serializers para Administración de Usuarios
# ============================================

class AdminUserListSerializer(serializers.ModelSerializer):
    """
    Serializer liviano para mostrar usuarios (listado, búsqueda).
    """
    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "is_active")


class AdminUserCreateUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer para creación y edición de usuarios por un Admin.
    - Incluye validación de contraseña (4 dígitos numéricos).
    - Usa set_password() para guardar encriptado.
    """
    password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        help_text="Contraseña numérica de 4 dígitos."
    )

    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "password", "is_active")

    def validate_username(self, v):
        if not v:
            raise serializers.ValidationError("El nombre de usuario es obligatorio.")
        return v

    def validate_password(self, v):
        """
        Opcional: exigir contraseña de 4 dígitos numéricos.
        """
        if v and (not v.isdigit() or len(v) != 4):
            raise serializers.ValidationError("La contraseña debe ser numérica de 4 dígitos.")
        return v

    def create(self, validated_data):
        pwd = validated_data.pop("password", None)
        user = User(**validated_data)
        if pwd:
            user.set_password(pwd)
        else:
            # Si no se pasa password, se marca como unusable (no puede loguear)
            user.set_unusable_password()
        user.save()
        return user

    def update(self, instance, validated_data):
        pwd = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if pwd:
            instance.set_password(pwd)
        instance.save()
        return instance
