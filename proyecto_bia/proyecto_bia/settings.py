import os
from pathlib import Path
from django.core.exceptions import ImproperlyConfigured
import environ
import logging

# Root directory (one level above this settings folder)
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Directorio base del proyecto
BASE_DIR = Path(__file__).resolve().parent.parent

# Crear carpeta de logs si no existe
LOG_DIR = BASE_DIR / 'logs'
LOG_DIR.mkdir(exist_ok=True)


# Initialize django-environ with defaults
env = environ.Env(
    DEBUG=(bool, True),
    DJANGO_SECRET_KEY=(str, ''),
    DJANGO_ALLOWED_HOSTS=(list, []),
    CORS_ALLOWED_ORIGINS=(list, []),
    DB_ENGINE=(str, 'django.db.backends.mysql'),
    DB_NAME=(str, ''),
    DB_USER=(str, ''),
    DB_PASSWORD=(str, ''),
    DB_HOST=(str, 'localhost'),
    DB_PORT=(str, '3306'),
    STATIC_URL=(str, '/static/'),
    MEDIA_URL=(str, '/media/'),
    LOGIN_REDIRECT_URL=(str, '/'),
    LOGOUT_REDIRECT_URL=(str, '/'),
    SESSION_EXPIRE_AT_BROWSER_CLOSE=(bool, True),
    SESSION_COOKIE_AGE=(int, 3600),
    CSRF_TRUSTED_ORIGINS=(list, ['http://localhost:3000']),
)

# Load environment variables from .env in PROJECT_ROOT
env_file = PROJECT_ROOT / '.env'
if not env_file.exists():
    raise ImproperlyConfigured(f".env file not found at {env_file}")
env.read_env(str(env_file))

# SECURITY SETTINGS
SECRET_KEY = env('DJANGO_SECRET_KEY')
if not SECRET_KEY:
    raise ImproperlyConfigured('The DJANGO_SECRET_KEY variable is not set in .env')

DEBUG = env('DEBUG')
DEBUG = True
ALLOWED_HOSTS = env('DJANGO_ALLOWED_HOSTS')

# CORS
CORS_ALLOWED_ORIGINS = env('CORS_ALLOWED_ORIGINS')
CORS_ALLOW_CREDENTIALS = True

# CSRF settings for cross-origin
CSRF_TRUSTED_ORIGINS = env('CSRF_TRUSTED_ORIGINS')
CSRF_COOKIE_SAMESITE = 'None'
CSRF_COOKIE_SECURE = False

# Installed apps
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

# Middleware
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

# URLs and WSGI
ROOT_URLCONF = 'proyecto_bia.urls'
WSGI_APPLICATION = 'proyecto_bia.wsgi.application'

# Templates
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

# Database config
DATABASES = {
    'default': {
        'ENGINE': env('DB_ENGINE'),
        'NAME': env('DB_NAME'),
        'USER': env('DB_USER'),
        'PASSWORD': env('DB_PASSWORD'),
        'HOST': env('DB_HOST'),
        'PORT': env('DB_PORT'),
        'OPTIONS': {
            'sslmode': 'require',
        },
    }
}

# Password validators
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Internationalization
LANGUAGE_CODE = 'es-ar'
TIME_ZONE = 'America/Argentina/Buenos_Aires'
USE_I18N = True
USE_TZ = True

# Static & media files
STATIC_URL = env('STATIC_URL')
STATICFILES_DIRS = [PROJECT_ROOT / 'static']
MEDIA_URL = env('MEDIA_URL')
MEDIA_ROOT = PROJECT_ROOT / 'media'

# Default PK field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Auth redirects
LOGIN_REDIRECT_URL = env('LOGIN_REDIRECT_URL')
LOGOUT_REDIRECT_URL = env('LOGOUT_REDIRECT_URL')

# Sessions
SESSION_EXPIRE_AT_BROWSER_CLOSE = env('SESSION_EXPIRE_AT_BROWSER_CLOSE')
SESSION_COOKIE_AGE = env('SESSION_COOKIE_AGE')
SESSION_COOKIE_SAMESITE = 'None'
SESSION_COOKIE_SECURE = False


from datetime import timedelta

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=30),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
    # … otros ajustes opcionales …
}

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
            'level': 'INFO',
            'class': 'logging.FileHandler',
            'filename': os.path.join(LOG_DIR, 'actividad.log'),
            'formatter': 'verbose',
        },
        'console': {
            'level': 'INFO',
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
    }
}