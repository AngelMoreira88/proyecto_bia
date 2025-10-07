// frontend/src/services/api.js
import axios from 'axios';
import { createBrowserHistory } from 'history';

const history = createBrowserHistory();

// ===============================
// Base URL (env) y configuración
// ===============================
const API_BASE = process.env.REACT_APP_API_BASE || '/';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  withCredentials: true,
  xsrfCookieName: 'csrftoken',
  xsrfHeaderName: 'X-CSRFToken',
});

// ===============================
//
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

function getCookie(name) {
  const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
  return m ? decodeURIComponent(m.pop()) : null;
}

// ===============================
// Logout seguro sin ciclo de import
// ===============================
async function safeLogout() {
  try {
    const mod = await import('./auth'); // import dinámico, evita ciclo
    if (typeof mod.logout === 'function') {
      mod.logout();
      return;
    }
  } catch {}
  try { localStorage.removeItem('access_token'); } catch {}
  try { localStorage.removeItem('refresh_token'); } catch {}
  delete api.defaults.headers.Authorization;
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
// 🔧 Normalizador de rutas (FIX 404)
// Reescribe /carga-datos/api/... -> /api/carga-datos/...
// sin tocar el resto del código.
// ===================================
const LEGACY_PREFIX = '/carga-datos/api/';
const CORRECT_PREFIX = '/api/carga-datos/';

function normalizeLegacyPath(url) {
  if (typeof url !== 'string') return url;
  // Solo toca rutas relativas que empiezan con el prefijo legado
  if (url.startsWith(LEGACY_PREFIX)) {
    return url.replace(LEGACY_PREFIX, CORRECT_PREFIX);
  }
  return url;
}

// ===================================
// Interceptor de REQUEST
// ===================================
api.interceptors.request.use((config) => {
  // 🔧 Aplicar normalización de ruta ANTES de enviar
  if (config && typeof config.url === 'string') {
    config.url = normalizeLegacyPath(config.url);
  }

  const token = getAccessToken();
  if (token && !config.headers?.Authorization) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Adjunta CSRF si existe cookie
  const csrftoken = getCookie('csrftoken');
  if (csrftoken) {
    config.headers = config.headers || {};
    config.headers['X-CSRFToken'] = csrftoken;
  }

  // Si es FormData, no fijar Content-Type manualmente
  if (config.data instanceof FormData) {
    if (config.headers && config.headers['Content-Type']) {
      delete config.headers['Content-Type'];
    }
  }

  return config;
});

// ===================================
// Interceptor de RESPONSE
// ===================================
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const originalRequest = error?.config;

    if (!error.response) return Promise.reject(error);

    // 401 con refresh disponible
    if (status === 401 && originalRequest && !originalRequest._retry) {
      const refresh = getRefreshToken();
      if (refresh) {
        if (isRefreshing) {
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
          const { data } = await axios.post(
            `${API_BASE}api/token/refresh/`,
            { refresh },
            {
              withCredentials: true,
              xsrfCookieName: 'csrftoken',
              xsrfHeaderName: 'X-CSRFToken',
            }
          );

          const newAccess = data?.access;
          if (!newAccess) throw new Error('No se recibió access token en refresh');

          localStorage.setItem('access_token', newAccess);
          api.defaults.headers.common.Authorization = `Bearer ${newAccess}`;
          processQueue(null, newAccess);

          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${newAccess}`;
          return api(originalRequest);
        } catch (refreshErr) {
          processQueue(refreshErr, null);
          await safeLogout();
          try { history.push('/login'); } catch {}
          window.location.reload();
          return Promise.reject(refreshErr);
        } finally {
          isRefreshing = false;
        }
      }
    }

    // 401 sin refresh: logout
    if (status === 401) {
      await safeLogout();
      try { history.push('/login'); } catch {}
      window.location.reload();
      return Promise.reject(error);
    }

    // 403: no desloguear; que la UI lo maneje
    if (status === 403) {
      console.warn('403 Forbidden:', error?.response?.data || '(sin detalle)');
      return Promise.reject(error);
    }

    // 429: backoff y reintento hasta 3 veces
    if (status === 429 && originalRequest) {
      const prev = originalRequest._retry429 || 0;
      if (prev >= 3) {
        return Promise.reject(error);
      }
      const hdr = error.response.headers?.['retry-after'];
      const retryMs = hdr ? Number(hdr) * 1000 : 2000 * (prev + 1); // 2s,4s,6s
      originalRequest._retry429 = prev + 1;
      return new Promise((resolve) => {
        setTimeout(() => resolve(api(originalRequest)), retryMs);
      });
    }

    return Promise.reject(error);
  }
);

export default api;

// =======================================================
// Endpoints: CARGA DE DATOS (base /carga-datos/api/...)
// (Se normalizan a /api/carga-datos/ en el interceptor)
// =======================================================

export function subirExcel(formData) {
  return api.post('/carga-datos/api/cargar/', formData);
}

export function confirmarCarga(records) {
  const payload = Array.isArray(records) && records.length > 0 ? { records } : {};
  return api.post('/carga-datos/api/confirmar/', payload, {
    headers: { 'Content-Type': 'application/json' },
  });
}

export function fetchErrores() {
  return api.get('/carga-datos/api/errores/');
}

export function listarDatosBia(params) {
  return api.get('/carga-datos/api/mostrar-datos-bia/', { params });
}

export function actualizarDatoBia(pk, payload) {
  return api.patch(`/carga-datos/api/mostrar-datos-bia/${pk}/`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });
}

export function exportarDatosBiaCSV() {
  return api.get('/carga-datos/api/exportar-datos-bia.csv', {
    responseType: 'blob',
  });
}

export function pingCargaDatos() {
  return api.get('/carga-datos/api/ping/');
}

// =============================================
// Endpoints: CERTIFICADOS LDD
// =============================================
export function generarCertificado(payload) {
  return api.post('/api/certificado/generar/', payload, {
    headers: { 'Content-Type': 'application/json' },
  });
}

export function consultarPorDni(dni) {
  return api.get('/api/certificado/consulta/dni/', { params: { dni } });
}

export function listarEntidades(params) {
  return api.get('/api/certificado/entidades/', { params });
}

export function obtenerEntidad(id) {
  return api.get(`/api/certificado/entidades/${id}/`);
}

export function crearEntidad(formData) {
  return api.post('/api/certificado/entidades/', formData);
}

export function actualizarEntidad(id, formData) {
  return api.patch(`/api/certificado/entidades/${id}/`, formData);
}

export function eliminarEntidad(id) {
  return api.delete(`/api/certificado/entidades/${id}/`);
}

export function pingCertificado() {
  return api.get('/api/certificado/ping/');
}

// =======================================================
// Otros endpoints previos
// =======================================================
export const eliminarDatoBia = (id) =>
  api.delete(`/api/db_bia/${encodeURIComponent(id)}/`);

// =======================================================
// Endpoints Admin de roles (app carga_datos) con CACHE
// =======================================================

// --- Cache y dedupe para /admin/me ---
let _meCache = { data: null, at: 0, promise: null };
const ME_TTL_MS = 5 * 60 * 1000; // 5 min

export function adminGetMe({ force = false } = {}) {
  const now = Date.now();
  if (!force && _meCache.data && (now - _meCache.at) < ME_TTL_MS) {
    return Promise.resolve({ data: _meCache.data });
  }
  if (_meCache.promise && !force) return _meCache.promise;

  _meCache.promise = api.get('/carga-datos/api/admin/me')
    .then((res) => {
      _meCache.data = res.data;
      _meCache.at = Date.now();
      return res;
    })
    .finally(() => { _meCache.promise = null; });

  return _meCache.promise;
}

// --- Cache y dedupe para /admin/roles ---
let _rolesCache = { data: null, at: 0, promise: null };
const ROLES_TTL_MS = 30 * 60 * 1000; // 30 min

export function adminListRoles({ force = false } = {}) {
  const now = Date.now();
  if (!force && _rolesCache.data && (now - _rolesCache.at) < ROLES_TTL_MS) {
    return Promise.resolve({ data: _rolesCache.data });
  }
  if (_rolesCache.promise && !force) return _rolesCache.promise;

  _rolesCache.promise = api.get('/carga-datos/api/admin/roles')
    .then((res) => {
      _rolesCache.data = res.data;
      _rolesCache.at = Date.now();
      return res;
    })
    .finally(() => { _rolesCache.promise = null; });

  return _rolesCache.promise;
}

/**
 * Buscar usuarios con soporte de:
 *  - q: texto ("" | "__all__")
 *  - rolesCsv: "Admin,Supervisor"
 *  - page: número de página (1..N)
 *  - pageSize: tamaño de página (10/20/50)
 */
export function adminSearchUsers(q = "", page = 1, rolesCsv, pageSize = 10) {
  const params = {};
  // __all__ o texto normal
  if (q !== undefined && q !== null) params.q = q;
  if (rolesCsv) params.roles = rolesCsv;
  if (page) params.page = page;
  if (pageSize) params.page_size = pageSize;
  return api.get('/carga-datos/api/admin/users', { params });
}

export function adminGetUserRoles(userId) {
  return api.get(`/carga-datos/api/admin/users/${userId}/roles`);
}

export function adminSetUserRoles(userId, body) {
  return api.post(`/carga-datos/api/admin/users/${userId}/roles`, body, {
    headers: { 'Content-Type': 'application/json' },
  });
}

/** (Opcional) “calentar” CSRF cookie desde el front */
export function ensureCsrf() {
  return api.get('/carga-datos/api/admin/csrf');
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

// =======================================================
// Admin Users (crear/actualizar)
// =======================================================
/**
 * Crear usuario.
 * Acepta tanto { role } (string) como { roles } (array) pero lo habitual
 * es crear y luego llamar a adminSetUserRoles con el set completo.
 */
export function adminCreateUser({ email, password, role, roles, nombre, first_name, last_name, username, is_active }) {
  const payload = { email, password };
  if (role) payload.role = role;
  if (Array.isArray(roles)) payload.roles = roles;
  if (nombre) payload.nombre = nombre;
  if (first_name) payload.first_name = first_name;
  if (last_name) payload.last_name = last_name;
  if (username) payload.username = username;
  if (typeof is_active === 'boolean') payload.is_active = is_active;
  return api.post('/carga-datos/api/admin/users', payload, {
    headers: { 'Content-Type': 'application/json' },
  });
}

export function adminUpdateUser(userId, payload) {
  return api.patch(`/carga-datos/api/admin/users/${userId}`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });
}

// =======================================================
// Invalidación de caches locales de admin (/me y roles)
// =======================================================
export function clearAdminCaches() {
  _meCache = { data: null, at: 0, promise: null };
  _rolesCache = { data: null, at: 0, promise: null };
}

// Limpiar caches cuando cambian auth/rol
try {
  window.addEventListener('auth-changed', clearAdminCaches);
  window.addEventListener('role-updated', clearAdminCaches);
} catch {}
