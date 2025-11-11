#!/usr/bin/env bash
set -euo pipefail

# === variables base ===
APP_DIR="/home/site/wwwroot"
VENV_DIR="$APP_DIR/venvBIA"
PORT="${PORT:-8000}"

echo "[startup] cd $APP_DIR"
cd "$APP_DIR"

# === crear/activar venv ===
if [ ! -d "$VENV_DIR" ]; then
  echo "[startup] creando venv en $VENV_DIR"
  python3 -m venv "$VENV_DIR"
fi

echo "[startup] activando venv"
# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"

# === pip y dependencias ===
echo "[startup] pip install -U pip wheel setuptools"
python -m pip install -U pip wheel setuptools

if [ -f requirements.txt ]; then
  echo "[startup] instalando requirements"
  pip install -r requirements.txt
else
  echo "[startup] ¡No existe requirements.txt!"; exit 1
fi

# === entorno django ===
export PYTHONUNBUFFERED=1
export PYTHONPATH="$APP_DIR:${PYTHONPATH:-}"

echo "[startup] aplicando migraciones"
python manage.py migrate --noinput

echo "[startup] collectstatic"
python manage.py collectstatic --noinput

# === gunicorn ===
echo "[startup] lanzando gunicorn en :$PORT"
exec gunicorn proyecto_bia.wsgi:application \
  --bind "0.0.0.0:$PORT" \
  --workers 2 \
  --timeout 120
