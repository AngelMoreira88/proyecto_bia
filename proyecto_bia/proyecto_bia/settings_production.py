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

# Warmup internos de Azure (IPs link-local que usan probes)
for _probe_ip in ("169.254.130.4", "169.254.131.3"):
    if _probe_ip not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(_probe_ip)

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

# CSRF - partir de defaults + env y además derivar de ALLOWED_HOSTS (https)
CSRF_TRUSTED_ORIGINS = list(set((CSRF_TRUSTED_ORIGINS or []) + _csv(
    "CSRF_TRUSTED_ORIGINS",
    f"{_fronts_default},{_backend_default}"
)))

# Derivar https://<host> desde ALLOWED_HOSTS, evitando localhost y 169.254.x.x
def _csrf_from_hosts(hosts):
    out = []
    for h in hosts:
        h = (h or "").strip()
        if not h:
            continue
        if h in ("localhost", "127.0.0.1") or h.startswith("169.254."):
            continue
        # normalizar si alguien puso ".dominio.com"
        out.append(f"https://{h.lstrip('.')}")
    return out

# extender lista deduplicada
CSRF_TRUSTED_ORIGINS = list(set(CSRF_TRUSTED_ORIGINS + _csrf_from_hosts(ALLOWED_HOSTS)))

# =========================
# Archivos estáticos y media (WhiteNoise + persistencia Azure)
# =========================
BASE_DIR = Path(__file__).resolve().parent.parent

STATIC_URL = "/static/"
MEDIA_URL = "/media/"

# --- Resolución robusta de roots en App Service Linux ---
def _pick_first_existing(candidates: list[str], fallback: str) -> Path:
    for p in candidates:
        if not p:
            continue
        try:
            pp = Path(p)
            if pp.exists():
                return pp
        except Exception:
            pass
    return Path(fallback)

# Candidatos típicos en App Service:
# - Código desplegado:           /home/site/wwwroot/...
# - Montajes heredados/legacy:   /home/site/...
# - Carpeta local del repo:      BASE_DIR / "staticfiles" o "media"
_env_static = os.getenv("STATIC_ROOT", "")
_env_media  = os.getenv("MEDIA_ROOT", "")

_static_candidates = [
    _env_static,
    "/home/site/wwwroot/static",
    "/home/site/static",
    str(BASE_DIR / "staticfiles"),
    str(BASE_DIR / "static"),
]
_media_candidates = [
    _env_media,
    "/home/site/wwwroot/media",
    "/home/site/media",
    str(BASE_DIR / "media"),
]

STATIC_ROOT = _pick_first_existing(_static_candidates, "/home/site/wwwroot/static")
MEDIA_ROOT  = _pick_first_existing(_media_candidates,  "/home/site/wwwroot/media")

# Creamos los directorios si no existen (no falla si ya existen)
try:
    STATIC_ROOT.mkdir(parents=True, exist_ok=True)
    MEDIA_ROOT.mkdir(parents=True, exist_ok=True)
except Exception:
    pass

# DEBUG de arranque para ver qué rutas tomó (aparece en az webapp log tail)
print(f"[settings_production] STATIC_ROOT={STATIC_ROOT}  MEDIA_ROOT={MEDIA_ROOT}")

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

# Subida de archivos: use disco y aumente límites razonables
DATA_UPLOAD_MAX_MEMORY_SIZE = 50 * 1024 * 1024      # 50 MB
FILE_UPLOAD_MAX_MEMORY_SIZE = 50 * 1024 * 1024
FILE_UPLOAD_TEMP_DIR = "/tmp"                       # existe en App Service
FILE_UPLOAD_HANDLERS = ["django.core.files.uploadhandler.TemporaryFileUploadHandler"]
