# proyecto_bia/settings_local.py
from .settings import *   # hereda TODO del base (NO del production)
import os

# --- Desarrollo local ---
DEBUG = True

# Clave SOLO para dev (podés sobreescribirla con DJANGO_SECRET_KEY_DEV)
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY_DEV", "dev-only-not-secure")

ALLOWED_HOSTS = ["127.0.0.1", "localhost", "[::1]"]
CSRF_TRUSTED_ORIGINS = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
]

# Nada de forzar HTTPS en local
SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
SECURE_PROXY_SSL_HEADER = None
USE_X_FORWARDED_HOST = False

# --- Base de datos ---
# Por defecto usa DB LOCAL. Para usar Azure desde local, corré con USE_AZURE_DB=1 y seteá las envs.
USE_AZURE_DB = os.getenv("USE_AZURE_DB", "0") == "1"

if USE_AZURE_DB:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("DATABASE_NAME", "bia_db"),
            "USER": os.environ.get("DATABASE_USER"),
            "PASSWORD": os.environ.get("DATABASE_PASSWORD"),
            "HOST": os.environ.get("DATABASE_HOST", "bia.postgres.database.azure.com"),
            "PORT": "5432",
            "OPTIONS": {"sslmode": "require"},
            "CONN_MAX_AGE": 0,  # en dev prefiero conexiones cortas
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("DB_LOCAL_NAME", "bia_db_local"),
            "USER": os.environ.get("DB_LOCAL_USER", "postgres"),
            "PASSWORD": os.environ.get("DB_LOCAL_PASSWORD", "postgres"),
            "HOST": os.environ.get("DB_LOCAL_HOST", "127.0.0.1"),
            "PORT": os.environ.get("DB_LOCAL_PORT", "5432"),
        }
    }

# --- Estáticos en dev ---
# Usamos staticfiles del base; no hace falta STATIC_ROOT. WhiteNoise no es necesario en dev.

# --- Email a consola en dev ---
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# --- Logging prolijo a consola ---
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "DEBUG"},
}
