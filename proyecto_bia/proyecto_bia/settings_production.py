# proyecto_bia/settings_production.py
from .settings import *   # hereda TODO del base
from pathlib import Path
import os

# =========================
# Núcleo / Seguridad
# =========================
DEBUG = False  # producción

# =========================
# Hosts permitidos
# - Hereda DJANGO_ALLOWED_HOSTS del base (ENV)
# - Agrega dominios de prod y variable EXTRA_ALLOWED_HOSTS (opcional)
# =========================
_prod_hosts = [
    "grupobia.com.ar",
    "www.grupobia.com.ar",
    "portalbia.com.ar",
    "www.portalbia.com.ar",
    "backend-grupobia.azurewebsites.net",
]
_extra = os.getenv("EXTRA_ALLOWED_HOSTS", "")
_extra_hosts = [h.strip() for h in _extra.split(",") if h.strip()]

# ALLOWED_HOSTS viene del base; lo fusionamos evitando duplicados
ALLOWED_HOSTS = list(dict.fromkeys(ALLOWED_HOSTS + _prod_hosts + _extra_hosts))

# =========================
# CORS / CSRF
# - Si no vienen por ENV, damos fallbacks razonables
# - Tu base ya define CORS_ALLOWED_ORIGINS / CSRF_TRUSTED_ORIGINS desde ENV
#   Aquí solo damos defaults si quedaron vacías.
# =========================
def _csv(name: str, default: str = ""):
    val = os.getenv(name, default)
    return [x.strip() for x in val.split(",") if x.strip()]

if not CORS_ALLOWED_ORIGINS:
    CORS_ALLOWED_ORIGINS = _csv(
        "CORS_ALLOWED_ORIGINS",
        # SWA (prod) + localhost:3000 para pruebas desde dev
        "https://happy-bay-014d9740f.2.azurestaticapps.net,http://localhost:3000"
    )

# En JWT no es obligatorio, pero útil si algún flujo usa CSRF
if not CSRF_TRUSTED_ORIGINS:
    CSRF_TRUSTED_ORIGINS = _csv(
        "CSRF_TRUSTED_ORIGINS",
        "https://grupobia.com.ar,https://www.grupobia.com.ar,"
        "https://portalbia.com.ar,https://www.portalbia.com.ar,"
        "https://happy-bay-014d9740f.2.azurestaticapps.net,http://localhost:3000"
    )

CORS_ALLOW_CREDENTIALS = True

# =========================
# SSL / Cookies (detrás del proxy de Azure)
# =========================
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True
SECURE_SSL_REDIRECT = True  # forzamos HTTPS

# Cookies seguras en prod
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
# SameSite Lax (si en el futuro necesitás cookies cross-site, evalúa "None")
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

# =========================
# Base de datos
# - El base toma credenciales desde ENV (DB_*)
# - Afinamos keep-alive y SSL para Postgres gestionado
# =========================
DATABASES["default"]["CONN_MAX_AGE"] = 600  # 10 minutos
if DATABASES["default"]["ENGINE"] == "django.db.backends.postgresql":
    DATABASES["default"].setdefault("OPTIONS", {})["sslmode"] = "require"

# =========================
# Archivos estáticos (WhiteNoise)
# =========================
BASE_DIR = Path(__file__).resolve().parent.parent

# Respetamos STATIC_URL del base; definimos STATIC_ROOT para collectstatic
STATIC_ROOT = BASE_DIR / "staticfiles"

# Almacenamiento comprimido con manifest
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"
    },
}
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

# Insertar WhiteNoise después de SecurityMiddleware si no está
_mw = list(MIDDLEWARE)
if "whitenoise.middleware.WhiteNoiseMiddleware" not in _mw:
    try:
        idx = _mw.index("django.middleware.security.SecurityMiddleware") + 1
    except ValueError:
        idx = 0
    _mw.insert(idx, "whitenoise.middleware.WhiteNoiseMiddleware")
MIDDLEWARE = _mw

# =========================
# Logging a consola (para `az webapp log tail`)
# =========================
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[{asctime}] {levelname} {name} - {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "verbose"},
    },
    "root": {"handlers": ["console"], "level": "INFO"},
}
