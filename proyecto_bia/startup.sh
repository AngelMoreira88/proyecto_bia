#!/usr/bin/env bash
set -e

echo "[startup] applying migrations..."
python manage.py migrate --settings=proyecto_bia.settings_production

echo "[startup] collectstatic..."
python manage.py collectstatic --noinput --settings=proyecto_bia.settings_production

echo "[startup] starting gunicorn..."
exec gunicorn --bind 0.0.0.0:8000 proyecto_bia.wsgi:application
