# proyecto_bia/settings.py
import os
from pathlib import Path
from django.core.exceptions import ImproperlyConfigured
from datetime import timedelta
import environ

# =====================================
# Paths
# =====================================
BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)

# =====================================
# Env (valores por defecto)
# =====================================
env = environ.Env(
    DEBUG=(bool, True),
    DJANGO_SECRET_KEY=(str, ""),
    DJANGO_ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1"]),

    # CORS / CSRF
    CORS_ALLOWED_ORIGINS=(list, [
        "http://localhost:3000",
        "http://localhost:3001",
        "https://portalbia.com.ar",
        "https://www.portalbia.com.ar",
    ]),
    CSRF_TRUSTED_ORIGINS=(list, [
        "http://localhost:3000",
        "http://localhost:3001",
        "https://portalbia.com.ar",
        "https://www.portalbia.com.ar",
    ]),

    # Cookies
    SESSION_COOKIE_SECURE=(bool, False),
    CSRF_COOKIE_SECURE=(bool, False),
    SESSION_COOKIE_SAMESITE=(str, "Lax"),
    CSRF_COOKIE_SAMESITE=(str, "Lax"),

    # Auth redirects
    LOGIN_REDIRECT_URL=(str, "/"),
    LOGOUT_REDIRECT_URL=(str, "/"),

    # Session lifetime
    SESSION_EXPIRE_AT_BROWSER_CLOSE=(bool, True),
    SESSION_COOKIE_AGE=(int, 3600),

    # Static & media
    STATIC_URL=(str, "/static/"),
    MEDIA_URL=(str, "/media/"),

    # DB (solo PostgreSQL)
    DB_ENGINE=(str, "django.db.backends.postgresql"),
    DB_NAME=(str, "bia_db"),
    DB_USER=(str, ""),
    DB_PASSWORD=(str, ""),
    DB_HOST=(str, "localhost"),
    DB_PORT=(str, "5432"),

    WRITE_FILE_LOGS=(bool, False),
)

env_file = PROJECT_ROOT / ".env"
if env_file.exists():
    env.read_env(str(env_file))

# =====================================
# Seguridad / Core
# =====================================
SECRET_KEY = env("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    raise ImproperlyConfigured("⚠️ Falta DJANGO_SECRET_KEY (definilo en .env o en App Settings de Azure).")

DEBUG = env("DEBUG")
ALLOWED_HOSTS = env("DJANGO_ALLOWED_HOSTS")

# =====================================
# CORS / CSRF
# =====================================
CORS_ALLOWED_ORIGINS = env("CORS_ALLOWED_ORIGINS")
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https?:\/\/localhost:\d+$",
    r"^https?:\/\/127\.0\.0\.1:\d+$",
]
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = env("CSRF_TRUSTED_ORIGINS")

SESSION_COOKIE_SECURE = env("SESSION_COOKIE_SECURE")
CSRF_COOKIE_SECURE = env("CSRF_COOKIE_SECURE")
SESSION_COOKIE_SAMESITE = env("SESSION_COOKIE_SAMESITE")
CSRF_COOKIE_SAMESITE = env("CSRF_COOKIE_SAMESITE")

# =====================================
# Installed apps
# =====================================
INSTALLED_APPS = [
    "corsheaders",
    "rest_framework",

    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    "certificado_ldd.apps.CertificadoLddConfig",
    "carga_datos.apps.CargaDatosConfig",
]

# =====================================
# Middleware
# =====================================
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# =====================================
# URLs / WSGI
# =====================================
ROOT_URLCONF = "proyecto_bia.urls"
WSGI_APPLICATION = "proyecto_bia.wsgi.application"

# =====================================
# Templates
# =====================================
TEMPLATES_DIR = PROJECT_ROOT / "templates"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [TEMPLATES_DIR],
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

# =====================================
# Base de datos (solo PostgreSQL)
# =====================================
DATABASES = {
    "default": {
        "ENGINE": env("DB_ENGINE"),
        "NAME": env("DB_NAME"),
        "USER": env("DB_USER"),
        "PASSWORD": env("DB_PASSWORD"),
        "HOST": env("DB_HOST"),
        "PORT": env("DB_PORT"),
        "OPTIONS": {"sslmode": "require"},
    }
}

# =====================================
# Password validators
# =====================================
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# =====================================
# I18N / TZ
# =====================================
LANGUAGE_CODE = "es-ar"
TIME_ZONE = "America/Argentina/Buenos_Aires"
USE_I18N = True
USE_TZ = True

# =====================================
# Static & Media
# =====================================
STATIC_URL = env("STATIC_URL")
STATICFILES_DIRS = [PROJECT_ROOT / "static"]
STATIC_ROOT = PROJECT_ROOT / "staticfiles"

MEDIA_URL = env("MEDIA_URL")
MEDIA_ROOT = PROJECT_ROOT / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# =====================================
# Auth redirects
# =====================================
LOGIN_REDIRECT_URL = env("LOGIN_REDIRECT_URL")
LOGOUT_REDIRECT_URL = env("LOGOUT_REDIRECT_URL")

# =====================================
# Sessions
# =====================================
SESSION_EXPIRE_AT_BROWSER_CLOSE = env("SESSION_EXPIRE_AT_BROWSER_CLOSE")
SESSION_COOKIE_AGE = env("SESSION_COOKIE_AGE")

# =====================================
# DRF + JWT
# =====================================
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.UserRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"user": "120/min"},
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=25),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# =====================================
# Logging
# =====================================
WRITE_FILE_LOGS = env("WRITE_FILE_LOGS")
_base_handlers = {
    "console": {
        "level": "DEBUG" if DEBUG else "INFO",
        "class": "logging.StreamHandler",
        "formatter": "verbose",
    }
}
if WRITE_FILE_LOGS:
    _base_handlers["file"] = {
        "level": "DEBUG",
        "class": "logging.FileHandler",
        "filename": os.path.join(LOG_DIR, "actividad.log"),
        "formatter": "verbose",
    }

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {"format": "[{asctime}] {levelname} {name} - {message}", "style": "{"},
    },
    "handlers": _base_handlers,
    "loggers": {
        "django.request": {"handlers": list(_base_handlers.keys()), "level": "INFO", "propagate": False},
        "certificado_ldd": {"handlers": list(_base_handlers.keys()), "level": "DEBUG" if DEBUG else "INFO", "propagate": False},
        "carga_datos": {"handlers": list(_base_handlers.keys()), "level": "DEBUG" if DEBUG else "INFO", "propagate": False},
    },
    "root": {"handlers": list(_base_handlers.keys()), "level": "INFO"},
}
