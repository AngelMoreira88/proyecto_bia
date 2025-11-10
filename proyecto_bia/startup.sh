#!/bin/bash
set -euxo pipefail

APP_DIR="/home/site/wwwroot"
VENV_NAME="venvBIA"
VENV_DIR="$APP_DIR/$VENV_NAME"
PYBIN="$VENV_DIR/bin/python"
PIP="$VENV_DIR/bin/pip"

# Fallback por si Oryx no creó el venv (no debería, pero nos cubrimos)
if [ ! -d "$VENV_DIR" ]; then
  python3.12 -m venv "$VENV_DIR"
fi

# Instalar deps una sola vez por arranque (o cuando falten)
if [ ! -x "$PYBIN" ]; then
  python3.12 -m venv "$VENV_DIR"
fi

"$PIP" install --upgrade pip wheel setuptools
if [ -f "$APP_DIR/requirements.txt" ]; then
  "$PIP" install -r "$APP_DIR/requirements.txt"
fi

export PYTHONPATH="$APP_DIR:${PYTHONPATH:-}"

cd "$APP_DIR"

# Django housekeeping
"$PYBIN" manage.py migrate --noinput
"$PYBIN" manage.py collectstatic --noinput

# Arrancar gunicorn
exec "$VENV_DIR/bin/gunicorn" proyecto_bia.wsgi:application \
  --bind=0.0.0.0:${PORT:-8000} \
  --workers=${GUNICORN_WORKERS:-3} \
  --timeout=120
