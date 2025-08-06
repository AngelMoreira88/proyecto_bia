// frontend/src/services/api.js
import axios from 'axios';
import { logout } from './auth'; // usamos tu logout para limpiar tokens
import { createBrowserHistory } from 'history';

// Necesitamos el history manual porque no estamos dentro de un componente
const history = createBrowserHistory();

// Crear instancia de Axios
const api = axios.create({
  baseURL: '/', // gracias al proxy de React
});

// ✅ Interceptor de request: agrega el token en cada request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ✅ Interceptor de respuesta: maneja errores globales
api.interceptors.response.use(
  response => response, // si está OK, sigue como siempre
  error => {
    const status = error.response?.status;

    if (status === 401 || status === 403) {
      // Token inválido o expirado
      console.warn('Token expirado o no autorizado. Redirigiendo al login...');
      logout(); // limpia tokens
      history.push('/login'); // redirige
      window.location.reload(); // fuerza redirección si fuera necesario
    }

    return Promise.reject(error); // sigue el flujo normal de errores
  }
);

export default api;

// -------------------------
// FUNCIONES API
// -------------------------

export function fetchCertificados() {
  return api.get('/api/certificados/');
}

export function subirExcel(formData) {
  return api.post('/carga-datos/api/', formData);
}

export function confirmarCarga(records) {
  return api.post(
    '/carga-datos/api/confirmar/',
    { records },
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export function fetchErrores() {
  return api.get('/carga-datos/api/errores/');
}
