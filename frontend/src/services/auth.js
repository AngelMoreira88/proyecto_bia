// frontend/src/services/auth.js
import api from './api';

/** Clave del header */
const AUTH_HEADER = 'Authorization';

/** Claves de cache local (rol efectivo y grupos) */
const ROLE_KEY   = 'user_role';     // rol efectivo (admin/approver/editor/staff/readonly)
const GROUPS_KEY = 'user_groups';   // cache de grupos del backend

/** Notifica a la app (misma pestaña) que cambió el estado de autenticación. */
export function notifyAuthChanged() {
  window.dispatchEvent(new Event('auth-changed'));
}

/** Intenta setear el header Authorization si hay token en storage (p. ej. tras reload). */
(function setAuthHeaderFromStorage() {
  const access = localStorage.getItem('access_token');
  if (access) {
    api.defaults.headers[AUTH_HEADER] = `Bearer ${access}`;
  } else {
    delete api.defaults.headers[AUTH_HEADER];
  }
})();

/** Decodifica payload de un JWT (sin validar). */
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1] || '';
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Devuelve true si el token está expirado (o inválido). */
function isTokenExpired(token) {
  const p = parseJwt(token);
  if (!p || !p.exp) return true;
  return Date.now() >= p.exp * 1000; // exp viene en segundos
}

/** Devuelve el payload (claims) del access token actual, o null si no hay/invalid. */
export function getUserClaims() {
  const access = localStorage.getItem('access_token');
  return access ? parseJwt(access) : null;
}

/** Utilidades de cache (rol/grupos) */
function setCachedRole(role) {
  try { localStorage.setItem(ROLE_KEY, role || 'readonly'); } catch {}
  notifyAuthChanged();
}
function clearCachedRole() {
  try { localStorage.removeItem(ROLE_KEY); } catch {}
}
function getCachedRole() {
  try { return localStorage.getItem(ROLE_KEY) || ''; } catch { return ''; }
}
function setCachedGroups(groups) {
  try { localStorage.setItem(GROUPS_KEY, JSON.stringify(groups || [])); } catch {}
}
function getCachedGroups() {
  try {
    const raw = localStorage.getItem(GROUPS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Mapea grupos Django a un rol efectivo del front. */
function mapGroupsToRole(groups = [], { is_superuser = false, is_staff = false } = {}) {
  const g = new Set((groups || []).map(String).map(s => s.toLowerCase()));
  if (is_superuser || g.has('admin')) return 'admin';
  if (g.has('approver')) return 'approver';
  if (g.has('editor'))   return 'editor';
  if (is_staff || g.has('staff')) return 'staff';
  return 'readonly';
}

/**
 * Inicia sesión usando JWT en lugar de sesiones de Django.
 * Envía credenciales y guarda los tokens en localStorage.
 */
export async function login(username, password) {
  const response = await api.post('/api/token/', { username, password });
  const { access, refresh } = response.data;

  localStorage.setItem('access_token', access);
  localStorage.setItem('refresh_token', refresh);

  api.defaults.headers[AUTH_HEADER] = `Bearer ${access}`;

  // Limpiamos cache previo por las dudas; Home/Header invocan refreshUserRole()
  clearCachedRole();
  setCachedGroups([]);

  notifyAuthChanged();
}

/**
 * Borra los tokens y el header de autorización.
 */
export function logout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  delete api.defaults.headers[AUTH_HEADER];

  clearCachedRole();
  setCachedGroups([]);

  notifyAuthChanged();
}

/**
 * Comprueba si hay un token de acceso activo (no expirado).
 */
export function isLoggedIn() {
  const access = localStorage.getItem('access_token');
  if (!access) return false;
  return !isTokenExpired(access);
}

/**
 * Refresca el token de acceso usando el refresh token.
 */
export async function refreshToken() {
  const refresh = localStorage.getItem('refresh_token');
  if (!refresh) throw new Error('No refresh token available');
  const response = await api.post('/api/token/refresh/', { refresh });
  const { access } = response.data;

  localStorage.setItem('access_token', access);
  api.defaults.headers[AUTH_HEADER] = `Bearer ${access}`;

  // No tocamos el rol cacheado acá; se mantiene hasta el próximo refresh explícito
  notifyAuthChanged();
  return access;
}

/**
 * Rol principal del usuario (EFECTIVO).
 * Prioridades:
 *  1) Cache local (refrescado desde backend con refreshUserRole)
 *  2) Claims del JWT
 */
export function getUserRole() {
  // 1) si hay cache de rol (viene de /carga-datos/api/admin/me), priorizarlo
  const cached = getCachedRole();
  if (cached) return cached;

  // 2) derivar desde claims del JWT
  const claims = getUserClaims();
  if (!claims) return 'readonly';

  const role = (claims.role || claims.user_role || '').toString().toLowerCase();
  const isSuper = !!claims.is_superuser;
  const isStaff = !!claims.is_staff;
  const groups = Array.isArray(claims.groups) ? claims.groups.map(g => String(g).toLowerCase()) : [];
  const perms  = Array.isArray(claims.perms)  ? claims.perms.map(p => String(p).toLowerCase())  : [];

  if (role === 'admin') return 'admin';
  if (isSuper) return 'admin';
  if (groups.includes('admin') || perms.includes('bia_admin')) return 'admin';
  if (groups.includes('approver')) return 'approver';
  if (groups.includes('editor'))   return 'editor';
  if (isStaff || groups.includes('staff')) return 'staff';
  return 'readonly';
}

/** Atajos */
export function isAdmin() { return getUserRole() === 'admin'; }
export function isStaff() { return getUserRole() === 'staff'; }

/** ¿pertenece a un grupo (claims ∪ cache backend)? */
export function inGroup(name) {
  const target = String(name || '').toLowerCase();
  const claims = getUserClaims();
  const fromClaims = Array.isArray(claims?.groups)
    ? claims.groups.map(g => String(g).toLowerCase())
    : [];
  const fromCache = getCachedGroups().map(g => String(g).toLowerCase());
  const set = new Set([...fromClaims, ...fromCache]);
  return set.has(target);
}

/** ¿tiene un permiso (solo claims)? */
export function hasPerm(code) {
  const claims = getUserClaims();
  const target = String(code || '').toLowerCase();
  const perms = Array.isArray(claims?.perms) ? claims.perms.map(p => String(p).toLowerCase()) : [];
  return perms.includes(target);
}

/** Lista de roles adicionales (claim `roles`), si existiera. */
export function getUserRoles() {
  const claims = getUserClaims();
  return Array.isArray(claims?.roles) ? claims.roles : [];
}

/**
 * Refresca el rol consultando al backend los grupos reales del usuario.
 * RUTA correcta con prefijo de app: /carga-datos/api/admin/me
 */
export async function refreshUserRole() {
  if (!isLoggedIn()) {
    clearCachedRole();
    setCachedGroups([]);
    return 'readonly';
  }
  try {
    const { data } = await api.get('/carga-datos/api/admin/me');
    const groups = Array.isArray(data?.groups) ? data.groups : [];
    const role = mapGroupsToRole(groups, {
      is_superuser: !!data?.is_superuser,
      is_staff: !!data?.is_staff,
    });
    setCachedGroups(groups);
    setCachedRole(role);
    return role;
  } catch {
    // Si falla, devolvemos el rol actual (claims o cache)
    return getUserRole();
  }
}
