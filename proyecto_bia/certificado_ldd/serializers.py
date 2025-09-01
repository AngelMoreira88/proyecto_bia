from rest_framework import serializers
from django.core.exceptions import ValidationError
from .models import Certificate, Entidad
from .models import BaseDeDatosBia
from .utils.images import process_image


class CertificateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Certificate
        fields = "__all__"
        
class EntidadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Entidad
        fields = ['id', 'nombre', 'responsable', 'cargo', 'razon_social', 'logo', 'firma']

    def _handle_image(self, img_file, *, max_w, max_h, max_kb):
        """
        Procesa (resize -> PNG) y luego valida el tamaño final.
        """
        if not img_file:
            return None

        # 1) Procesar primero (reduce dimensiones y peso)
        processed = process_image(img_file, max_w=max_w, max_h=max_h, out_format='PNG')

        # 2) Validar tamaño del procesado
        size_kb = processed.size / 1024
        if size_kb > max_kb:
            # Mensaje claro si aún supera el límite
            raise ValidationError(
                f"La imagen final ({int(size_kb)} KB) supera el máximo permitido de {max_kb} KB."
            )

        # 3) Asegurar nombre .png
        original_name = getattr(img_file, 'name', 'image') or 'image'
        name_wo_ext = original_name.rsplit('.', 1)[0]
        processed.name = f"{name_wo_ext}.png"
        return processed

    def create(self, validated_data):
        logo = validated_data.pop('logo', None)
        firma = validated_data.pop('firma', None)

        if logo:
            logo = self._handle_image(logo, max_w=600, max_h=200, max_kb=300)
        if firma:
            firma = self._handle_image(firma, max_w=600, max_h=180, max_kb=200)

        ent = Entidad.objects.create(**validated_data)
        if logo:
            ent.logo.save(logo.name, logo, save=False)
        if firma:
            ent.firma.save(firma.name, firma, save=False)
        ent.save()
        return ent

    def update(self, instance, validated_data):
        logo = validated_data.pop('logo', None)
        firma = validated_data.pop('firma', None)

        for attr, val in validated_data.items():
            setattr(instance, attr, val)

        if logo:
            logo = self._handle_image(logo, max_w=600, max_h=200, max_kb=300)
            instance.logo.save(logo.name, logo, save=False)
        if firma:
            firma = self._handle_image(firma, max_w=600, max_h=180, max_kb=200)
            instance.firma.save(firma.name, firma, save=False)

        instance.save()
        return instance
class BaseDeDatosBiaSerializer(serializers.ModelSerializer):
    class Meta:
        model = BaseDeDatosBia
        fields = '__all__'

