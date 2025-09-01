from io import BytesIO
from PIL import Image, ImageOps
from django.core.files.base import ContentFile
from django.core.exceptions import ValidationError

ALLOWED_FORMATS = {'PNG', 'JPEG', 'JPG', 'WEBP'}

def process_image(uploaded_file, *, max_w: int, max_h: int, out_format='PNG') -> ContentFile:
    """
    Normaliza la imagen:
    - Verifica formato permitido (PNG/JPEG/JPG/WEBP)
    - Respeta orientación EXIF
    - Convierte a RGBA (preserva transparencia)
    - Reduce a caja (max_w x max_h) sin agrandar
    - Exporta como PNG optimizado
    - Devuelve ContentFile listo para .save()
    """
    uploaded_file.seek(0)
    try:
        with Image.open(uploaded_file) as im:
            fmt = (im.format or '').upper()
            if fmt not in ALLOWED_FORMATS:
                raise ValidationError("Formato no soportado. Usa PNG o JPG.")

            # Orientación correcta y modo
            im = ImageOps.exif_transpose(im).convert('RGBA')

            # Redimensionar manteniendo proporción (no agrandar)
            w, h = im.size
            ratio = min(max_w / w, max_h / h, 1.0)
            new_w, new_h = int(w * ratio), int(h * ratio)
            if (new_w, new_h) != (w, h):
                im = im.resize((new_w, new_h), Image.LANCZOS)

            # Guardar como PNG optimizado
            buffer = BytesIO()
            im.save(buffer, format=out_format, optimize=True)
            return ContentFile(buffer.getvalue())
    except ValidationError:
        raise
    except Exception:
        raise ValidationError("No se pudo procesar la imagen.")
