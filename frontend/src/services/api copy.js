// frontend/src/services/api.js
import axios from 'axios';

// Crear instancia de Axios
const api = axios.create({
  baseURL: '/', // Ajustá esto si tu backend corre en otro puerto o dominio
});

// Agregar token JWT automáticamente si existe
const token = localStorage.getItem('access_token');
if (token) {
  api.defaults.headers['Authorization'] = `Bearer ${token}`;
}

export default api;

// -------------------------
// FUNCIONES API
// -------------------------

/**
 * Obtiene la lista de certificados.
 */
export function fetchCertificados() {
  return api.get('/api/certificados/');
}

/**
 * Sube el archivo Excel para previsualizar datos.
 * @param {FormData} formData
 */
export function subirExcel(formData) {
  return api.post('/carga-datos/api/', formData);
}

/**
 * Confirma la carga de registros en la base.
 * @param {Array<Object>} records - Array de objetos a insertar.
 */
export function confirmarCarga(records) {
  return api.post(
    '/carga-datos/api/confirmar/',
    { records },
    { headers: { 'Content-Type': 'application/json' } }
  );
}

/**
 * Obtiene la lista de errores de validación.
 */
export function fetchErrores() {
  return api.get('/carga-datos/api/errores/');
}
