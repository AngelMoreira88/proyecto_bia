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
  withCredentials: true,           // si usás sesión/CSRF en el mismo dominio
  xsrfCookieName: 'csrftoken',     // nombres por defecto Django/DRF
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

function getCookie(name) {
  const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
  return m ? decodeURIComponent(m.pop()) : null;
}

// ===============================
// Logout seguro sin ciclo de import
// ===============================
async function safeLogout() {
  try {
    const mod = await import('./auth'); // ← import dinámico para evitar ciclos
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

  const csrftoken = getCookie('csrftoken');
  if (csrftoken) {
    config.headers = config.headers || {};
    config.headers['X-CSRFToken'] = csrftoken;
  }

  // Si es FormData, dejar que Axios setee el boundary automáticamente
  if (config.data instanceof FormData) {
    if (config.headers && config.headers['Content-Type']) {
      delete config.headers['Content-Type'];
    }
  }

  return config;
});

// ===================================
// Interceptor de RESPONSE (inteligente)
// - 401 sin Authorization → reintenta 1 vez con access actual (sin refresh)
// - 401 con Authorization → intenta refresh (con cola de espera)
// - 401 final → logout suave
// - 403 → NO desloguea; devuelve error a la UI
// ===================================
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const originalRequest = error?.config;

    // Sin response (network/CORS): rechazar
    if (!error.response) {
      return Promise.reject(error);
    }

    if (status === 401 && originalRequest) {
      const access = getAccessToken();
      const refresh = getRefreshToken();
      const hadAuthHeader = !!(originalRequest.headers && originalRequest.headers.Authorization);

      // Caso A: la request original salió SIN Authorization → reintentar 1 vez con el access actual
      if (!hadAuthHeader && access) {
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${access}`;
        return api(originalRequest);
      }

      // Caso B: venía con Authorization y falló → intentar refresh (una sola vez por request)
      if (!originalRequest._retry && refresh) {
        if (isRefreshing) {
          // Esperar a que otro refresh termine
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
          // usar axios plano para evitar loop con el mismo interceptor
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

          // Guardar y aplicar nuevo access
          try { localStorage.setItem('access_token', newAccess); } catch {}
          api.defaults.headers.common.Authorization = `Bearer ${newAccess}`;
          processQueue(null, newAccess);

          // Reintentar el request original con el token nuevo
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${newAccess}`;
          return api(originalRequest);
        } catch (refreshErr) {
          processQueue(refreshErr, null);

          // Logout y redirección
          await safeLogout();
          try { history.push('/login'); } catch {}
          window.location.reload();
          return Promise.reject(refreshErr);
        } finally {
          isRefreshing = false;
        }
      }

      // 401 sin posibilidad de refresh → logout
      await safeLogout();
      try { history.push('/login'); } catch {}
      window.location.reload();
      return Promise.reject(error);
    }

    if (status === 403) {
      // No cerrar sesión; dejar que la UI muestre “No autorizado”
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
}

/**
 * Confirma la carga después de la vista previa.
 * records: payload validado del backend
 * (⚠️ Si no pasás `records`, el backend usa lo guardado en sesión.)
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
  return api.get('/carga-datos/api/exportar-datos-bia.csv', { responseType: 'blob' });
}

/** Ping de salud (smoke test) */
export function pingCargaDatos() {
  return api.get('/carga-datos/api/ping/');
}

// =============================================
// Endpoints: CERTIFICADOS LDD
// =============================================

/** Genera el certificado (POST) */
export function generarCertificado(payload) {
  // El view acepta GET/POST; usamos POST JSON por simplicidad
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

/** Crear entidad (FormData con imágenes/archivos) */
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
// ✅ MINI-INTEGRACIÓN: búsqueda con filtros opcionales por grupo y roles
// - q: string de búsqueda. Si querés listar todo, podés pasar "__all__"
// - group: nombre del grupo (Admin/Supervisor/Operador), opcional
// - rolesCsv: string "Admin,Supervisor" (si el backend lo soporta). Si no, el front filtrará en cliente.
export function adminSearchUsers(q, group = "", rolesCsv = "") {
  const params = {};
  if (typeof q === 'string' && q.trim() !== '') params.q = q;
  if (group) params.group = group;
  if (rolesCsv) params.roles = rolesCsv;
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

// =======================================================
// NUEVO: Endpoints Admin de usuarios (para Perfil.jsx)
// (mantenemos el mismo estilo de paths sin barra final)
// =======================================================
export function adminCreateUser(payload) {
  // payload: {username, email, first_name, last_name, password, is_active}
  return api.post('/carga-datos/api/admin/users', payload, {
    headers: { 'Content-Type': 'application/json' },
  });
}
export function adminUpdateUser(userId, payload) {
  // payload: mismos campos que create; password es opcional en edición
  // soporta también: { current_password, new_password } para cambio propio
  return api.patch(`/carga-datos/api/admin/users/${userId}`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });
}
// (opcional) desactivar usuario
export function adminDeactivateUser(userId) {
  return api.post(`/carga-datos/api/admin/users/${userId}/deactivate`, {});
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
