#!/usr/bin/env bash
set -e

cd /home/site/wwwroot

# si existe un output.tar.gz no descomprimido, hacerlo una sola vez
if [ -f "output.tar.gz" ]; then
  echo "[startup] Descomprimiendo output.tar.gz en /home/site/wwwroot ..."
  tar -xzvf output.tar.gz
  rm -f output.tar.gz
  echo "[startup] Descompresión completada."
fi

echo "[startup] applying migrations..."
python manage.py migrate --settings=proyecto_bia.settings_production

echo "[startup] collectstatic..."
python manage.py collectstatic --noinput --settings=proyecto_bia.settings_production

echo "[startup] starting gunicorn..."
gunicorn proyecto_bia.wsgi:application \
  --bind=0.0.0.0:8000 \
  --workers=1 \                # 1 worker reduce consumo total de memoria
  --worker-class=gthread \
  --threads=8 \                # paralelismo por threads
  --timeout=300  
