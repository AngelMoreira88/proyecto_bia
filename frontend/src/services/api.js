// frontend/src/services/api.js
import axios from 'axios';
// ❌ QUITADO para evitar ciclo: import { logout } from './auth';
import { createBrowserHistory } from 'history';

const history = createBrowserHistory();

// ===============================
// Base URL (env) y configuración
// ===============================
const API_BASE = process.env.REACT_APP_API_BASE || '/';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  // Si tu frontend y backend están en orígenes distintos y usás sesión/CSRF,
  // necesitás enviar cookies:
  withCredentials: true,
  // Nombres por defecto de Django/DRF para CSRF
  xsrfCookieName: 'csrftoken',
  xsrfHeaderName: 'X-CSRFToken',
});

// ===============================
// Helpers de Auth y CSRF
// ===============================
function getAccessToken() {
  try {
    return localStorage.getItem('access_token');
  } catch {
    return null;
  }
}

function getRefreshToken() {
  try {
    return localStorage.getItem('refresh_token');
  } catch {
    return null;
  }
}

// Fallback por si querés leer el CSRF manualmente (Axios ya usa xsrfCookieName/xsrfHeaderName)
function getCookie(name) {
  const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
  return m ? decodeURIComponent(m.pop()) : null;
}

// ===============================
// Logout seguro sin ciclo de import
// ===============================
async function safeLogout() {
  try {
    const mod = await import('./auth'); // ← import dinámico, rompe el ciclo
    if (typeof mod.logout === 'function') {
      mod.logout();
      return;
    }
  } catch (e) {
    // Si por alguna razón falla, limpiamos storage a mano
  }
  try { localStorage.removeItem('access_token'); } catch {}
  try { localStorage.removeItem('refresh_token'); } catch {}
  delete api.defaults.headers.Authorization;
  // Aviso global a la app
  try { window.dispatchEvent(new Event('auth-changed')); } catch {}
}

// ===================================
// Cola para refresh de access tokens
// ===================================
let isRefreshing = false;
let pendingRequests = [];

const processQueue = (error, newAccess = null) => {
  pendingRequests.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(newAccess);
  });
  pendingRequests = [];
};

// ===================================
// Interceptor de REQUEST
// - Agrega Authorization Bearer si hay JWT
// - Agrega CSRF (por si usás sesión)
// - No fuerza Content-Type con FormData
// ===================================
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token && !config.headers?.Authorization) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Si usás SessionAuthentication, ayuda adjuntar CSRF manualmente (además de xsrfHeaderName)
  const csrftoken = getCookie('csrftoken');
  if (csrftoken) {
    config.headers = config.headers || {};
    config.headers['X-CSRFToken'] = csrftoken;
  }

  // Importantísimo: si es FormData, dejamos que Axios ponga el boundary
  if (config.data instanceof FormData) {
    if (config.headers && config.headers['Content-Type']) {
      delete config.headers['Content-Type'];
    }
  }

  return config;
});

// ===================================
// Interceptor de RESPONSE
// - Si 401 y hay refresh, intenta renovar y reintenta
// - *** CAMBIO: 403 ya no hace logout; devuelve el error a la UI
// ===================================
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const originalRequest = error?.config;

    // Si no hay response (network/CORS), rechazar
    if (!error.response) {
      return Promise.reject(error);
    }

    // Intentar refresh de access token UNA sola vez por request
    if (status === 401 && originalRequest && !originalRequest._retry) {
      const refresh = getRefreshToken();
      if (refresh) {
        if (isRefreshing) {
          // Poner en cola hasta que termine otro refresh en curso
          return new Promise((resolve, reject) => {
            pendingRequests.push({
              resolve: (newAccess) => {
                if (newAccess) {
                  originalRequest.headers = originalRequest.headers || {};
                  originalRequest.headers.Authorization = `Bearer ${newAccess}`;
                }
                resolve(api(originalRequest));
              },
              reject,
            });
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          // Usar axios "plano" para evitar loops con el mismo interceptor
          const { data } = await axios.post(
            `${API_BASE}api/token/refresh/`,
            { refresh },
            {
              // Si tu refresh requiere cookie/CSRF:
              withCredentials: true,
              xsrfCookieName: 'csrftoken',
              xsrfHeaderName: 'X-CSRFToken',
            }
          );

          const newAccess = data?.access;
          if (!newAccess) throw new Error('No se recibió access token en refresh');

          // Guardar y aplicar nuevo access
          localStorage.setItem('access_token', newAccess);
          api.defaults.headers.common.Authorization = `Bearer ${newAccess}`;
          processQueue(null, newAccess);

          // Reintentar el request original con el token nuevo
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${newAccess}`;
          return api(originalRequest);
        } catch (refreshErr) {
          processQueue(refreshErr, null);

          // Logout sin ciclo de import
          await safeLogout();
          try { history.push('/login'); } catch {}
          // Forzar un reload para limpiar estado cliente
          window.location.reload();
          return Promise.reject(refreshErr);
        } finally {
          isRefreshing = false;
        }
      }
    }

    // *** CAMBIO: 401 (sin refresh posible) => logout + redirección
    if (status === 401) {
      await safeLogout();
      try { history.push('/login'); } catch {}
      window.location.reload();
      return Promise.reject(error);
    }

    // *** CAMBIO: 403: NO cerrar sesión; devolver error para que la UI lo maneje
    if (status === 403) {
      console.warn('403 Forbidden:', error?.response?.data || '(sin detalle)');
      return Promise.reject(error);
    }

    // Resto de errores: se devuelven a la UI
    return Promise.reject(error);
  }
);

export default api;

// =======================================================
// Endpoints: CARGA DE DATOS (se mantienen los que tenías)
// Base final: /carga-datos/api/...
// =======================================================

/**
 * Sube un Excel/CSV para validación previa.
 * formData: { archivo: File }
 */
export function subirExcel(formData) {
  return api.post('/carga-datos/api/cargar/', formData);
  // Nota: al ser FormData, NO seteamos 'Content-Type'
}

/**
 * Confirma la carga después de la vista previa.
 * records: payload validado del backend
 * (⚠️ Si no pasás `records`, envía `{}` para que el backend use lo guardado en sesión.)
 */
export function confirmarCarga(records) {
  const payload = Array.isArray(records) && records.length > 0 ? { records } : {};
  return api.post('/carga-datos/api/confirmar/', payload, {
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

// =============================================
// Endpoints: CERTIFICADOS LDD (manteniendo base)
// =============================================

/** Genera el certificado (POST) */
export function generarCertificado(payload) {
  // Alias válido: /api/certificado/generar/ (ajusta si usás otro)
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

/** Crear entidad (FormData con imágenes) */
export function crearEntidad(formData) {
  return api.post('/api/certificado/entidades/', formData);
}

/** Actualizar entidad (PATCH con FormData) */
export function actualizarEntidad(id, formData) {
  return api.patch(`/api/certificado/entidades/${id}/`, formData);
}

/** Eliminar entidad */
export function eliminarEntidad(id) {
  return api.delete(`/api/certificado/entidades/${id}/`);
}

/** Ping de salud certificados */
export function pingCertificado() {
  return api.get('/api/certificado/ping/');
}

// =======================================================
// Otros endpoints que ya tenías (ejemplo DB BIA delete)
// =======================================================
export const eliminarDatoBia = (id) =>
  api.delete(`/api/db_bia/${encodeURIComponent(id)}/`);

// =======================================================
// Endpoints Admin de roles (prefijo de app carga_datos)
// =======================================================
export function adminGetMe() {
  return api.get('/carga-datos/api/admin/me');
}
export function adminListRoles() {
  return api.get('/carga-datos/api/admin/roles');
}
export function adminSearchUsers(q) {
  return api.get('/carga-datos/api/admin/users', { params: { q } });
}
export function adminGetUserRoles(userId) {
  return api.get(`/carga-datos/api/admin/users/${userId}/roles`);
}
export function adminSetUserRoles(userId, body) {
  return api.post(`/carga-datos/api/admin/users/${userId}/roles`, body, {
    headers: { 'Content-Type': 'application/json' },
  });
}

// =======================================================
// Endpoints Bulk Update (Modificar Masivo)
// =======================================================
export function bulkValidar(formData) {
  return api.post('/carga-datos/api/bulk-update/validate', formData);
}
export function bulkCommit(jobId) {
  return api.post('/carga-datos/api/bulk-update/commit', { job_id: jobId }, {
    headers: { 'Content-Type': 'application/json' },
  });
}
