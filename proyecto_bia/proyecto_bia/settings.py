# proyecto_bia/settings.py
import os
from pathlib import Path
from django.core.exceptions import ImproperlyConfigured
import environ
from datetime import timedelta

# =====================================
# Paths
# =====================================
PROJECT_ROOT = Path(__file__).resolve().parent.parent
BASE_DIR = Path(__file__).resolve().parent.parent

# Logs dir
LOG_DIR = BASE_DIR / 'logs'
LOG_DIR.mkdir(exist_ok=True)

# =====================================
# Env
# =====================================
env = environ.Env(
    DEBUG=(bool, True),

    # Core
    DJANGO_SECRET_KEY=(str, ''),
    DJANGO_ALLOWED_HOSTS=(list, ['localhost', '127.0.0.1']),

    # CORS / CSRF
    CORS_ALLOWED_ORIGINS=(list, ['http://localhost:3000']),
    CSRF_TRUSTED_ORIGINS=(list, ['http://localhost:3000']),

    # Cookies (configurables por entorno)
    SESSION_COOKIE_SECURE=(bool, False),
    CSRF_COOKIE_SECURE=(bool, False),
    SESSION_COOKIE_SAMESITE=(str, 'Lax'),   # 'Lax' predeterminado en dev
    CSRF_COOKIE_SAMESITE=(str, 'Lax'),

    # Auth redirects
    LOGIN_REDIRECT_URL=(str, '/'),
    LOGOUT_REDIRECT_URL=(str, '/'),

    # Session lifetime
    SESSION_EXPIRE_AT_BROWSER_CLOSE=(bool, True),
    SESSION_COOKIE_AGE=(int, 3600),

    # Static & media
    STATIC_URL=(str, '/static/'),
    MEDIA_URL=(str, '/media/'),

    # DB (dev defaults; prod via env)
    DB_ENGINE=(str, 'django.db.backends.mysql'),
    DB_NAME=(str, ''),
    DB_USER=(str, ''),
    DB_PASSWORD=(str, ''),
    DB_HOST=(str, 'localhost'),
    DB_PORT=(str, '3306'),

    # Opcional para MySQL SSL (ruta a CA) o flags extra
    DB_SSL_CA=(str, ''),  # e.g., '/path/to/DigiCertGlobalRootCA.crt.pem'
)

env_file = PROJECT_ROOT / '.env'
if env_file.exists():
    env.read_env(str(env_file))   
    
# en Azure no hay .env; usamos App Settings
# si no existe, seguimos solo con variables de entorno del sistema

# =====================================
# Security
# =====================================
SECRET_KEY = env('DJANGO_SECRET_KEY')
if not SECRET_KEY:
    raise ImproperlyConfigured('The DJANGO_SECRET_KEY variable is not set in .env')

DEBUG = env('DEBUG')
ALLOWED_HOSTS = env('DJANGO_ALLOWED_HOSTS')

# =====================================
# CORS / CSRF
# =====================================
CORS_ALLOWED_ORIGINS = env('CORS_ALLOWED_ORIGINS')
CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = env('CSRF_TRUSTED_ORIGINS')

# Cookies (evitar None+no-secure en dev)
SESSION_COOKIE_SECURE = env('SESSION_COOKIE_SECURE')
CSRF_COOKIE_SECURE = env('CSRF_COOKIE_SECURE')
SESSION_COOKIE_SAMESITE = env('SESSION_COOKIE_SAMESITE')
CSRF_COOKIE_SAMESITE = env('CSRF_COOKIE_SAMESITE')

# =====================================
# Installed apps
# =====================================
INSTALLED_APPS = [
    'corsheaders',
    'rest_framework',

    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    'certificado_ldd.apps.CertificadoLddConfig',
    'carga_datos.apps.CargaDatosConfig',
]

# =====================================
# Middleware
# CORS debe estar antes de CommonMiddleware y CSRF
# =====================================
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',

    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',

    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# =====================================
# URLs / WSGI
# =====================================
ROOT_URLCONF = 'proyecto_bia.urls'
WSGI_APPLICATION = 'proyecto_bia.wsgi.application'

# =====================================
# Templates
# =====================================
TEMPLATES_DIR = PROJECT_ROOT / 'templates'
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [TEMPLATES_DIR],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# =====================================
# Database (elige OPTIONS según engine)
# =====================================
_db_engine = env('DB_ENGINE')
_db_options = {}

if _db_engine == 'django.db.backends.postgresql':
    # Azure PostgreSQL: sslmode=require
    _db_options = {'sslmode': 'require'}
elif _db_engine == 'django.db.backends.mysql':
    # Para MySQL podés habilitar SSL si tenés CA:
    # Si definís DB_SSL_CA en .env, lo agrego automáticamente
    _ssl_ca = env('DB_SSL_CA')
    if _ssl_ca:
        _db_options = {
            'ssl': {'ca': _ssl_ca}
        }
    else:
        _db_options = {}
else:
    _db_options = {}  # otros engines sin opciones por defecto

DATABASES = {
    'default': {
        'ENGINE': _db_engine,
        'NAME': env('DB_NAME'),
        'USER': env('DB_USER'),
        'PASSWORD': env('DB_PASSWORD'),
        'HOST': env('DB_HOST'),
        'PORT': env('DB_PORT'),
        'OPTIONS': _db_options,
        # Nota: para Postgres en prod usaremos CONN_MAX_AGE en settings_production
    }
}

# =====================================
# Password validators
# =====================================
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# =====================================
# I18N / TZ
# =====================================
LANGUAGE_CODE = 'es-ar'
TIME_ZONE = 'America/Argentina/Buenos_Aires'
USE_I18N = True
USE_TZ = True

# =====================================
# Static & media
# =====================================
STATIC_URL = env('STATIC_URL')
STATICFILES_DIRS = [PROJECT_ROOT / 'static']
STATIC_ROOT = PROJECT_ROOT / 'staticfiles'
MEDIA_URL = env('MEDIA_URL')
MEDIA_ROOT = PROJECT_ROOT / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# =====================================
# Auth redirects
# =====================================
LOGIN_REDIRECT_URL = env('LOGIN_REDIRECT_URL')
LOGOUT_REDIRECT_URL = env('LOGOUT_REDIRECT_URL')

# =====================================
# Sessions
# =====================================
SESSION_EXPIRE_AT_BROWSER_CLOSE = env('SESSION_EXPIRE_AT_BROWSER_CLOSE')
SESSION_COOKIE_AGE = env('SESSION_COOKIE_AGE')

# =====================================
# DRF + JWT
# =====================================
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "user": "120/min",
    },
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=25),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# =====================================
# Logging
# =====================================
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,

    'formatters': {
        'verbose': {
            'format': '[{asctime}] {levelname} {name} - {message}',
            'style': '{',
        },
    },

    'handlers': {
        'file': {
            'level': 'DEBUG',
            'class': 'logging.FileHandler',
            'filename': os.path.join(LOG_DIR, 'actividad.log'),
            'formatter': 'verbose',
        },
        'console': {
            'level': 'DEBUG',
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },

    'loggers': {
        'django.request': {
            'handlers': ['file', 'console'],
            'level': 'INFO',
            'propagate': False,
        },
        'certificado_ldd': {
            'handlers': ['file', 'console'],
            'level': 'DEBUG',
            'propagate': False,
        },
        'carga_datos': {
            'handlers': ['file', 'console'],
            'level': 'DEBUG',
            'propagate': False,
        },
    },

    'root': {
        'handlers': ['console', 'file'],
        'level': 'INFO',
    }
}
