# proyecto_bia/celery.py
import os
from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "proyecto_bia.settings")

app = Celery("proyecto_bia")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
