// frontend/src/services/api.js
import axios from 'axios';
import { logout } from './auth';
import { createBrowserHistory } from 'history';

const history = createBrowserHistory();

// Usa variable de entorno en prod, proxy CRA en dev
// Ejemplo .env: REACT_APP_API_BASE=http://localhost:8000/
const API_BASE = process.env.REACT_APP_API_BASE || '/';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

// -------------------------------
// Auth helpers: auto-refresh JWT
// -------------------------------
let isRefreshing = false;
let pendingRequests = [];

const processQueue = (error, token = null) => {
  pendingRequests.forEach((prom) => {
    if (error) prom.reject(error);
    else {
      prom.resolve(token);
    }
  });
  pendingRequests = [];
};

// ---- Interceptor: Authorization Bearer ----
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---- Interceptor de respuesta ----
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const originalRequest = error.config;

    // 401 → intentar refresh (una sola vez por request)
    if (status === 401 && !originalRequest?._retry) {
      const refresh = localStorage.getItem('refresh_token');
      if (refresh) {
        if (isRefreshing) {
          // cola mientras se renueva el token
          return new Promise((resolve, reject) => {
            pendingRequests.push({
              resolve: (newAccess) => {
                originalRequest.headers.Authorization = `Bearer ${newAccess}`;
                resolve(api(originalRequest));
              },
              reject,
            });
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          // Usamos axios "plano" para evitar loops del interceptor
          const { data } = await axios.post(
            `${API_BASE}api/token/refresh/`,
            { refresh }
          );

          const newAccess = data?.access;
          if (newAccess) {
            localStorage.setItem('access_token', newAccess);
            api.defaults.headers.common.Authorization = `Bearer ${newAccess}`;
            processQueue(null, newAccess);
            // Reintenta el request original
            originalRequest.headers.Authorization = `Bearer ${newAccess}`;
            return api(originalRequest);
          }
          throw new Error('No se recibió access token en refresh');
        } catch (refreshErr) {
          processQueue(refreshErr, null);
          logout();
          history.push('/login');
          window.location.reload();
          return Promise.reject(refreshErr);
        } finally {
          isRefreshing = false;
        }
      }
    }

    // 401/403 sin refresh → salir a login
    if (status === 401 || status === 403) {
      logout();
      history.push('/login');
      window.location.reload();
    }

    return Promise.reject(error);
  }
);

export default api;

// -------------------------------------------------
// Endpoints: CARGA DE DATOS (coinciden con backend)
// Base final: /carga-datos/api/...
// -------------------------------------------------

/**
 * Sube un Excel/CSV para validación previa.
 * formData: { archivo: File }
 */
export function subirExcel(formData) {
  return api.post('/carga-datos/api/cargar/', formData, {
    // Nota: axios setea boundary en multipart automáticamente,
    // este header es opcional
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

/**
 * Confirma la carga después de la vista previa.
 * records: payload validado del backend
 */
export function confirmarCarga(records) {
  return api.post('/carga-datos/api/confirmar/', { records }, {
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Errores de validación detectados en la carga previa */
export function fetchErrores() {
  return api.get('/carga-datos/api/errores/');
}

/** Lista registros de DB BIA (filtros por params) */
export function listarDatosBia(params) {
  return api.get('/carga-datos/api/mostrar-datos-bia/', { params });
}

/** Actualiza un registro por PK (PATCH) */
export function actualizarDatoBia(pk, payload) {
  return api.patch(`/carga-datos/api/mostrar-datos-bia/${pk}/`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Exporta CSV de datos BIA */
export function exportarDatosBiaCSV() {
  return api.get('/carga-datos/api/exportar-datos-bia.csv', {
    responseType: 'blob',
  });
}

/** Ping de salud (smoke test) */
export function pingCargaDatos() {
  return api.get('/carga-datos/api/ping/');
}

// -------------------------------------------------
// Endpoints: CERTIFICADOS LDD
// Base final: /api/certificado/...
// -------------------------------------------------

/** Genera el certificado (POST) */
export function generarCertificado(payload) {
  // Tenés dos alias válidos en backend: /generar/ o /generar-certificado/
  return api.post('/api/certificado/generar/', payload, {
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Lista de entidades (ViewSet DRF) */
export function listarEntidades(params) {
  return api.get('/api/certificado/entidades/', { params });
}

/** Detalle de entidad por id (ViewSet DRF) */
export function obtenerEntidad(id) {
  return api.get(`/api/certificado/entidades/${id}/`);
}

/** Ping de salud certificados */
export function pingCertificado() {
  return api.get('/api/certificado/ping/');
}
