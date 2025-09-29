# proyecto_bia/settings_dev.py
from .settings import *   # hereda TODO del base
import os

# --- Fuerza UTF-8 y sanea variables PG* problemáticas ---
os.environ.setdefault("PGCLIENTENCODING", "UTF8")
os.environ.setdefault("PYTHONIOENCODING", "UTF-8")

def _sanitize_pg_env():
    """
    Borra variables de entorno PG* que no sean UTF-8 puro para evitar
    UnicodeDecodeError en psycopg2/libpq (típico Windows con cp1252).
    """
    for k, v in list(os.environ.items()):
        if not k.startswith("PG"):
            continue
        if v is None:
            continue
        try:
            v.encode("utf-8", errors="strict")
        except Exception:
            os.environ.pop(k, None)

_sanitize_pg_env()

# --- Cargar .env en UTF-8 (si está disponible) ---
try:
    from dotenv import load_dotenv
    load_dotenv(encoding="utf-8")
except Exception:
    pass

# --- Helper seguro para leer envs como str UTF-8 ---
def _env_str(key: str, default=None):
    v = os.environ.get(key, default)
    if v is None:
        return None
    if isinstance(v, bytes):
        try:
            return v.decode("utf-8")
        except Exception:
            return v.decode("latin-1", errors="ignore")
    try:
        v.encode("utf-8", errors="strict")
        return v
    except Exception:
        return v.encode("latin-1", errors="ignore").decode("utf-8", errors="ignore")

# =========================
# DEV
# =========================
DEBUG = True

SECRET_KEY = _env_str("DJANGO_SECRET_KEY_DEV", "dev-only-not-secure")

ALLOWED_HOSTS = ["127.0.0.1", "localhost", "[::1]"]
CSRF_TRUSTED_ORIGINS = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
]

SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
SECURE_PROXY_SSL_HEADER = None
USE_X_FORWARDED_HOST = False

# --- Base de datos ---
USE_AZURE_DB = _env_str("USE_AZURE_DB", "0") == "1"

if USE_AZURE_DB:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": _env_str("DATABASE_NAME", "bia_db"),
            "USER": _env_str("DATABASE_USER"),
            "PASSWORD": _env_str("DATABASE_PASSWORD"),
            "HOST": _env_str("DATABASE_HOST", "bia.postgres.database.azure.com"),
            "PORT": _env_str("DATABASE_PORT", "5432"),
            "OPTIONS": {
                "sslmode": "require",
                "options": "-c client_encoding=UTF8",
                "application_name": "bia",  # ASCII seguro
            },
            "CONN_MAX_AGE": 0,
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": _env_str("DB_LOCAL_NAME", "bia_db_local"),
            "USER": _env_str("DB_LOCAL_USER", "postgres"),
            "PASSWORD": _env_str("DB_LOCAL_PASSWORD", "postgres"),
            "HOST": _env_str("DB_LOCAL_HOST", "127.0.0.1"),
            "PORT": _env_str("DB_LOCAL_PORT", "5432"),
            "OPTIONS": {
                "options": "-c client_encoding=UTF8",
                "application_name": "bia",
            },
            "CONN_MAX_AGE": 0,
        }
    }

# --- Email a consola en dev ---
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# --- Logging a consola ---
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "DEBUG"},
}