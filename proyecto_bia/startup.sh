#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/site/wwwroot"
VENV_DIR="$APP_DIR/venvBIA"
PORT="${PORT:-8000}"
PIP_CACHE_DIR="/home/site/.pipcache"
REQ_FILE="$APP_DIR/requirements.txt"
REQ_HASH_FILE="$VENV_DIR/.req_hash"

export PYTHONUNBUFFERED=1
export PYTHONPATH="$APP_DIR:${PYTHONPATH:-}"
export TZ="America/Argentina/Buenos_Aires"

echo "[startup] whoami: $(whoami)"
echo "[startup] python3: $(command -v python3 || true)"; python3 -V || true
echo "[startup] cd $APP_DIR"; cd "$APP_DIR"
echo "[startup] ls -la:"
ls -la

# Normalizar CRLF si hiciera falta (sin usar 'file')
if grep -q $'\r' startup.sh 2>/dev/null; then
  echo "[startup] corrigiendo CRLF -> LF"
  sed -i 's/\r$//' startup.sh || true
fi

# 0) Cache de pip
mkdir -p "$PIP_CACHE_DIR"
export PIP_CACHE_DIR

# 1) Crear venv si no existe o está corrupto
if [ ! -d "$VENV_DIR" ] || [ ! -f "$VENV_DIR/bin/activate" ]; then
  echo "[startup] creando venv limpia en $VENV_DIR"
  rm -rf "$VENV_DIR"
  python3 -m venv "$VENV_DIR"
fi

# 2) Activar venv
# shellcheck source=/dev/null
echo "[startup] activando venv..."
source "$VENV_DIR/bin/activate"

# 3) Asegurar toolchain
echo "[startup] upgrade pip/wheel/setuptools"
python -m pip install -U pip wheel setuptools

# 4) Instalar requirements SOLO si cambiaron
if [ ! -f "$REQ_FILE" ]; then
  echo "[startup] ¡Falta requirements.txt!"
  exit 1
fi

REQ_HASH_NOW="$(sha256sum "$REQ_FILE" | awk '{print $1}')"
REQ_HASH_OLD="$(cat "$REQ_HASH_FILE" 2>/dev/null || echo '')"

if [ "$REQ_HASH_NOW" != "$REQ_HASH_OLD" ]; then
  echo "[startup] requirements cambiaron (old=$REQ_HASH_OLD new=$REQ_HASH_NOW). Instalando..."
  pip install -r "$REQ_FILE"
  echo "$REQ_HASH_NOW" > "$REQ_HASH_FILE"
else
  echo "[startup] requirements sin cambios. No reinstalo."
fi

# 5) Migraciones y collectstatic
echo "[startup] migrate"
python manage.py migrate --noinput

if [ -d "$APP_DIR/static" ]; then
  echo "[startup] collectstatic"
  python manage.py collectstatic --noinput
else
  echo "[startup] no hay carpeta static en el repo, omito collectstatic"
fi

# 6) Arrancar gunicorn
GUNICORN="$VENV_DIR/bin/gunicorn"
echo "[startup] gunicorn en :$PORT"
exec "$GUNICORN" proyecto_bia.wsgi:application \
  --bind "0.0.0.0:$PORT" \
  --workers 2 \
  --timeout 120
