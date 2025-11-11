#!/usr/bin/env bash
set -e

# ==============================
# ⚙️ CONFIGURACIÓN
# ==============================
APP_NAME="backend-grupobia"
RESOURCE_GROUP="bia"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
ZIP_NAME="backend_bia_fast_${TIMESTAMP}.zip"
VENV_DIR="venvBIA"

echo "🚀 Deploy rápido iniciado (${TIMESTAMP})"
echo "📁 Proyecto: $(pwd)"

# ==============================
# 1️⃣ Verificar entorno
# ==============================
if [ ! -d "$VENV_DIR" ]; then
  echo "❌ No se encontró el entorno virtual '${VENV_DIR}'."
  echo "Crealo con: python3 -m venv ${VENV_DIR} && source ${VENV_DIR}/bin/activate && pip install -r requirements.txt"
  exit 1
fi

# ==============================
# 2️⃣ Empaquetar sin reinstalar
# ==============================
echo "📦 Empaquetando código + entorno + media..."
zip -r "${ZIP_NAME}" \
  manage.py proyecto_bia carga_datos certificado_ldd utils templates static media \
  requirements.txt startup.sh ${VENV_DIR} \
  -x "*/__pycache__/*" "*.log" > /dev/null

ls -lh "${ZIP_NAME}"

# ==============================
# 3️⃣ Subir a Azure
# ==============================
echo "☁️  Subiendo a Azure App Service..."
az webapp deploy \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${APP_NAME}" \
  --src-path "${ZIP_NAME}" \
  --type zip

# ==============================
# 4️⃣ Reiniciar y testear
# ==============================
echo "🔄 Reiniciando aplicación..."
az webapp restart -g "${RESOURCE_GROUP}" -n "${APP_NAME}"

echo "🩺 Probando endpoint /api/health/..."
sleep 5
curl -I "https://${APP_NAME}.azurewebsites.net/api/health/" || true

echo "✅ Deploy rápido completado correctamente (${ZIP_NAME})"
