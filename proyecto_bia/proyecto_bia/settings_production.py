# proyecto_bia/settings_production.py

from .settings import *  # hereda TODO del settings base
import os
from pathlib import Path

# =========================
# Núcleo / Seguridad
# =========================
DEBUG = False
SECRET_KEY = os.environ.get("SECRET_KEY")  # definido en App Service

# Armamos ALLOWED_HOSTS combinando lo que venga del base + producción
_base_hosts = locals().get("ALLOWED_HOSTS", [])
_prod_hosts = [
    "https://grupobia.com.ar",
    "https://www.grupobia.com.ar",
    "portalbia.com.ar",
    "www.portalbia.com.ar",
    "backend-grupobia.azurewebsites.net",  # <- webapp real en Azure
    "https://happy-bay-014d9740f.2.azurestaticapps.net",

]
_extra = os.environ.get("EXTRA_ALLOWED_HOSTS", "")
_extra_hosts = [h.strip() for h in _extra.split(",") if h.strip()]
ALLOWED_HOSTS = list(dict.fromkeys(_base_hosts + _prod_hosts + _extra_hosts))

CSRF_TRUSTED_ORIGINS = [
    "https://grupobia.com.ar",
    "https://www.grupobia.com.ar",
    "https://happy-bay-014d9740f.2.azurestaticapps.net",
    "https://www.portalbia.com.ar",
    "portalbia.com.ar",
]

# Detrás de Front Door / App Service
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True
SECURE_SSL_REDIRECT = True

SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

# HSTS (activá cuando el dominio final esté estable)
# SECURE_HSTS_SECONDS = 86400
# SECURE_HSTS_INCLUDE_SUBDOMAINS = True
# SECURE_HSTS_PRELOAD = True

# =========================
# Base de datos (Azure Postgres con SSL)
# =========================
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("DATABASE_NAME", "bia_db"),
        "USER": os.environ.get("DATABASE_USER"),
        "PASSWORD": os.environ.get("DATABASE_PASSWORD"),
        "HOST": os.environ.get("DATABASE_HOST", "bia.postgres.database.azure.com"),
        "PORT": "5432",
        "OPTIONS": {"sslmode": "require"},
        "CONN_MAX_AGE": 600,
    }
}
# Alternativa con una sola URL:
# import dj_database_url
# DATABASES = {"default": dj_database_url.parse(os.environ["DATABASE_URL"], conn_max_age=600)}

# =========================
# Estáticos (WhiteNoise)
# =========================
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Django >= 4.2 (preferido)
STORAGES = {
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
# Compatibilidad con versiones previas:
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

# Asegurarnos de que WhiteNoise esté en el MIDDLEWARE (por si el base no lo tenía)
_mw = list(locals().get("MIDDLEWARE", []))
if "whitenoise.middleware.WhiteNoiseMiddleware" not in _mw:
    try:
        idx = _mw.index("django.middleware.security.SecurityMiddleware") + 1
    except ValueError:
        idx = 0
    _mw.insert(idx, "whitenoise.middleware.WhiteNoiseMiddleware")
    MIDDLEWARE = _mw  # noqa: F401

# =========================
# Logging a consola (para ver en `az webapp log tail`)
# =========================
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
