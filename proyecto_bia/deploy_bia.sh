#!/usr/bin/env bash
set -e

# ==============================
# 🔧 CONFIGURACIÓN
# ==============================
APP_NAME="backend-grupobia"
RESOURCE_GROUP="bia"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
ZIP_NAME="backend_bia_${TIMESTAMP}.zip"
VENV_DIR="venvBIA"

echo "🚀 Iniciando deploy para ${APP_NAME} (${TIMESTAMP})"
echo "📁 Proyecto: $(pwd)"

# ==============================
# 1️⃣ Verificar entorno virtual
# ==============================
if [ ! -d "$VENV_DIR" ]; then
  echo "⚠️  No se encontró el entorno virtual '${VENV_DIR}'."
  echo "Crealo con: python3 -m venv ${VENV_DIR} && source ${VENV_DIR}/bin/activate && pip install -r requirements.txt"
  exit 1
fi

echo "==> Activando entorno virtual e instalando dependencias..."
source ${VENV_DIR}/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate

# ==============================
# 2️⃣ Crear ZIP completo
# ==============================
echo "📦 Generando paquete ${ZIP_NAME}..."
zip -r "${ZIP_NAME}" \
  manage.py proyecto_bia carga_datos certificado_ldd utils templates static media logs \
  requirements.txt startup.sh ${VENV_DIR} > /dev/null

ls -lh "${ZIP_NAME}"

# ==============================
# 3️⃣ Deploy directo (sin Oryx)
# ==============================
echo "☁️  Publicando en Azure App Service..."
az webapp deploy \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${APP_NAME}" \
  --src-path "${ZIP_NAME}" \
  --type zip

# ==============================
# 4️⃣ Reiniciar y verificar
# ==============================
echo "🔄 Reiniciando aplicación..."
az webapp restart -g "${RESOURCE_GROUP}" -n "${APP_NAME}"

echo "🩺 Verificando estado de /api/health/ ..."
sleep 5
curl -I "https://${APP_NAME}.azurewebsites.net/api/health/" || true

echo "✅ Deploy completado correctamente (${ZIP_NAME})"