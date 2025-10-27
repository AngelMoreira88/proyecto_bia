# proyecto_bia/settings_production.py
from .settings import *  # hereda todo del base (PostgreSQL-only)
from django.core.exceptions import ImproperlyConfigured
from pathlib import Path
import os

# =========================
# Núcleo / Seguridad
# =========================
DEBUG = False

# Forzar PostgreSQL en PROD (defensa ante config accidental)
if DATABASES["default"]["ENGINE"] != "django.db.backends.postgresql":
    raise ImproperlyConfigured(
        "En producción la base debe ser PostgreSQL. "
        "Setea DB_ENGINE=django.db.backends.postgresql en App Settings."
    )

# Conexiones persistentes + SSL (Azure)
DATABASES["default"]["CONN_MAX_AGE"] = 600  # 10 minutos
DATABASES["default"].setdefault("OPTIONS", {})["sslmode"] = "require"

# Detrás del proxy de Azure
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True
SECURE_SSL_REDIRECT = True  # forzar HTTPS

# Cookies seguras
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

# HSTS (activar cuando el dominio esté 100% en HTTPS)
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# =========================
# Hosts permitidos
# =========================
def _csv(name: str, default: str = ""):
    val = os.getenv(name, default)
    return [x.strip() for x in val.split(",") if x.strip()]

# Hosts base de producción
_prod_hosts = [
    "grupobia.com.ar",
    "www.grupobia.com.ar",
    "portalbia.com.ar",
    "www.portalbia.com.ar",
    "backend-grupobia.azurewebsites.net",
]

# Construir ALLOWED_HOSTS una sola vez
ALLOWED_HOSTS = list(set(
    (_csv("DJANGO_ALLOWED_HOSTS", "") or []) +
    _prod_hosts
))

# Hostname real del sitio en Azure
wh = os.getenv("WEBSITE_HOSTNAME")
if wh and wh not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(wh)

# Warmup interno de Azure
if "169.254.130.4" not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append("169.254.130.4")

# =========================
# CORS / CSRF (endurecido)
# =========================
_fronts_default = "https://portalbia.com.ar,https://www.portalbia.com.ar"
_backend_default = "https://backend-grupobia.azurewebsites.net"

# CORS
CORS_ALLOWED_ORIGINS = list(set((CORS_ALLOWED_ORIGINS or []) + _csv("CORS_ALLOWED_ORIGINS", _fronts_default)))
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https?:\/\/localhost:\d+$",
    r"^https?:\/\/127\.0\.0\.1:\d+$",
]
CORS_ALLOW_CREDENTIALS = True

# CSRF
CSRF_TRUSTED_ORIGINS = list(set((CSRF_TRUSTED_ORIGINS or []) + _csv(
    "CSRF_TRUSTED_ORIGINS",
    f"{_fronts_default},{_backend_default}"
)))

# =========================
# Archivos estáticos y media (WhiteNoise + persistencia Azure)
# =========================
BASE_DIR = Path(__file__).resolve().parent.parent

STATIC_URL = "/static/"
STATIC_ROOT = Path(os.getenv("STATIC_ROOT", "/home/site/staticfiles"))

MEDIA_URL = "/media/"
MEDIA_ROOT = Path(os.getenv("MEDIA_ROOT", "/home/site/media"))

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
        "OPTIONS": {
            "location": str(MEDIA_ROOT),
            "base_url": MEDIA_URL,
        },
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
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
# Logging (a consola para App Service)
# =========================
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {"format": "[{asctime}] {levelname} {name} - {message}", "style": "{"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "verbose"},
    },
    "root": {"handlers": ["console"], "level": "INFO"},
}

# =========================
# Templates (Django)
# =========================
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]
