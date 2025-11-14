#!/usr/bin/env bash
set -euo pipefail

APP_NAME="backend-grupobia"
RESOURCE_GROUP="bia"
TS=$(date +"%Y%m%d_%H%M%S")
ZIP_NAME="backend_bia_${TS}.zip"

echo "🚀 Deploy liviano a ${APP_NAME} @ ${TS}"
echo "📁 Directorio: $(pwd)"

# Normalizar EOL y permisos del startup.sh
if file startup.sh | grep -qi 'CRLF'; then
  echo "↪️ Corrigiendo CRLF -> LF en startup.sh"
  perl -pi -e 's/\r$//' startup.sh
fi
chmod +x startup.sh

echo "📦 Empaquetando (sin venv, sin basura de build)..."
# Empaquetar solo lo necesario. NO subimos venvBIA ni staticfiles ni logs.
zip -r "${ZIP_NAME}" \
  manage.py proyecto_bia carga_datos certificado_ldd utils templates static media \
  requirements.txt startup.sh \
  -x "venvBIA/*" \
     "staticfiles/*" \
     "logs/*" \
     "__pycache__/*" \
     "*.pyc" \
     ".git/*" \
     ".github/*" \
     ".DS_Store" \
     "*.zip" \
  >/dev/null
ls -lh "${ZIP_NAME}"

echo "⚙️ Ajustes de app (desactivar Oryx, storage persistente, puerto)"
az webapp config appsettings set -g "${RESOURCE_GROUP}" -n "${APP_NAME}" --settings \
  SCM_DO_BUILD_DURING_DEPLOYMENT=0 \
  ENABLE_ORYX_BUILD=false \
  WEBSITES_ENABLE_APP_SERVICE_STORAGE=true \
  WEBSITES_PORT=8000 \
  WEBSITES_CONTAINER_START_TIME_LIMIT=1800 >/dev/null

echo "📌 Forzando startup file"
az webapp config set -g "${RESOURCE_GROUP}" -n "${APP_NAME}" \
  --startup-file "bash -lc /home/site/wwwroot/startup.sh" >/dev/null

echo "☁️ Enviando paquete (async=true)"
az webapp deploy \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${APP_NAME}" \
  --src-path "${ZIP_NAME}" \
  --type zip \
  --async true

echo "🔄 Reiniciando app..."
az webapp restart -g "${RESOURCE_GROUP}" -n "${APP_NAME}" >/dev/null

#echo "📜 Tail de logs (corta con Ctrl+C cuando veas 'gunicorn en :8000')"
#az webapp log tail -g "${RESOURCE_GROUP}" -n "${APP_NAME}"
