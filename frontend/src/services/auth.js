// frontend/src/services/auth.js
import api from './api';

/** Header de auth */
const AUTH_HEADER = 'Authorization';

/** Claves de cache local */
const ROLE_KEY   = 'user_role';    // "Admin" | "Supervisor" | "Operador" | "readonly"
const GROUPS_KEY = 'user_groups';  // array de grupos del backend

/** Eventos globales */
export function notifyAuthChanged() {
  try { window.dispatchEvent(new Event('auth-changed')); } catch {}
}
export function notifyRoleUpdated() {
  try { window.dispatchEvent(new Event('role-updated')); } catch {}
}

/** Levantar Authorization desde storage en los primeros ms */
(function setAuthHeaderFromStorage() {
  try {
    const access = localStorage.getItem('access_token');
    if (access) api.defaults.headers[AUTH_HEADER] = `Bearer ${access}`;
    else delete api.defaults.headers[AUTH_HEADER];
  } catch {
    delete api.defaults.headers[AUTH_HEADER];
  }
})();

/** --- JWT utils --- */
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1] || '';
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}
function isTokenExpired(token) {
  const p = parseJwt(token);
  if (!p || !p.exp) return true;
  return Date.now() >= p.exp * 1000;
}
export function getUserClaims() {
  try {
    const access = localStorage.getItem('access_token');
    return access ? parseJwt(access) : null;
  } catch {
    return null;
  }
}

/** --- Cache helpers --- */
function setCachedRole(role) {
  try { localStorage.setItem(ROLE_KEY, role || 'readonly'); } catch {}
  // avisar a toda la app inmediatamente
  notifyRoleUpdated();
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

/** Normalización de strings */
function norm(s) { return String(s || '').trim(); }
function lowerSet(arr) { return new Set((arr || []).map(x => norm(x).toLowerCase())); }

/** Mapea grupos Django a un rol principal del front. */
function groupsToPrimaryRole(groups = [], { is_superuser = false } = {}) {
  const g = lowerSet(groups);
  if (is_superuser || g.has('admin'))      return 'Admin';
  if (g.has('supervisor'))                 return 'Supervisor';
  if (g.has('operador'))                   return 'Operador';
  return 'readonly';
}

/** Alias legacy opcional (compat) */
function primaryToLegacyAlias(primaryRole) {
  switch (primaryRole) {
    case 'Admin':      return 'admin';
    case 'Supervisor': return 'editor';
    case 'Operador':   return 'approver';
    default:           return 'readonly';
  }
}

/** Setea header + rol/grupos *al instante* desde el JWT */
function setAuthFromAccess(access) {
  api.defaults.headers[AUTH_HEADER] = `Bearer ${access}`;
  try { localStorage.setItem('access_token', access); } catch {}

  // Claims → rol / grupos inmediatos (UI sin lag)
  const claims = parseJwt(access) || {};
  const jwtGroups = Array.isArray(claims.groups) ? claims.groups : [];
  const is_superuser = !!claims.is_superuser;

  // Si el token trae rol legacy explícito y no hay grupos, respetarlo
  const legacy = (claims.role || claims.user_role || '').toString().toLowerCase();
  let primary = groupsToPrimaryRole(jwtGroups, { is_superuser });
  if (!jwtGroups.length && legacy) {
    if (legacy === 'admin') primary = 'Admin';
    else if (legacy === 'editor') primary = 'Supervisor';
    else if (legacy === 'approver') primary = 'Operador';
  }

  setCachedGroups(jwtGroups);
  setCachedRole(primary); // dispara role-updated + auth-changed
}

/** --- Auth core --- */
export async function login(username, password) {
  const { data } = await api.post('/api/token/', { username, password });
  const { access, refresh } = data || {};

  // Guardar refresh
  try { localStorage.setItem('refresh_token', refresh); } catch {}

  // 👉 Aplicar access y rol/grupos *ya mismo* desde el JWT (sin esperar /me)
  setAuthFromAccess(access);

  // Limpio caches del módulo API (por si había otra sesión)
  try {
    const mod = await import('./api');
    if (typeof mod.clearAdminCaches === 'function') mod.clearAdminCaches();
  } catch {}
}

export function logout() {
  try { localStorage.removeItem('access_token'); } catch {}
  try { localStorage.removeItem('refresh_token'); } catch {}
  delete api.defaults.headers[AUTH_HEADER];

  clearCachedRole();
  setCachedGroups([]);
  notifyRoleUpdated();
  notifyAuthChanged();

  // limpiar caches del módulo API
  import('./api').then((mod) => {
    if (typeof mod.clearAdminCaches === 'function') mod.clearAdminCaches();
  }).catch(() => {});
}

export function isLoggedIn() {
  try {
    const access = localStorage.getItem('access_token');
    if (!access) return false;
    return !isTokenExpired(access);
  } catch {
    return false;
  }
}

export async function refreshToken() {
  const refresh = localStorage.getItem('refresh_token');
  if (!refresh) throw new Error('No refresh token available');
  const { data } = await api.post('/api/token/refresh/', { refresh });
  const access = data?.access;
  if (!access) throw new Error('Refresh sin access token');

  // 👉 También al refrescar: actualizar header + rol/grupos al instante
  setAuthFromAccess(access);
  return access;
}

/**
 * Rol principal del usuario (EFECTIVO).
 * 1) Usa cache (set por JWT en login/refresh)
 * 2) Si no hay cache, infiere desde claims JWT
 */
export function getUserRole() {
  const cached = getCachedRole();
  if (cached) return cached;

  const claims = getUserClaims();
  if (!claims) return 'readonly';

  const groups = Array.isArray(claims.groups) ? claims.groups : [];
  const is_superuser = !!claims.is_superuser;
  let primary = groupsToPrimaryRole(groups, { is_superuser });

  const legacy = (claims.role || claims.user_role || '').toString().toLowerCase();
  if (!groups.length && legacy) {
    if (legacy === 'admin') primary = 'Admin';
    if (legacy === 'editor') primary = 'Supervisor';
    if (legacy === 'approver') primary = 'Operador';
  }
  return primary;
}

/** Atajos de rol */
export function isAdmin()      { return getUserRole() === 'Admin'; }
export function isSupervisor() { return getUserRole() === 'Supervisor'; }
export function isOperador()   { return getUserRole() === 'Operador'; }
export function isStaff() {
  const r = getUserRole();
  return r === 'Admin' || r === 'Supervisor';
}

/** ¿pertenece a un grupo? (claims ∪ cache backend) */
export function inGroup(name) {
  const target = norm(name).toLowerCase();
  const fromClaims = lowerSet(getUserClaims()?.groups || []);
  const fromCache  = lowerSet(getCachedGroups());
  const set = new Set([...fromClaims, ...fromCache]);
  return set.has(target);
}

/** ¿tiene un permiso? (si viniera en claims) */
export function hasPerm(code) {
  const target = norm(code).toLowerCase();
  const perms = (getUserClaims()?.perms || []).map(p => norm(p).toLowerCase());
  return perms.includes(target);
}

/** Roles adicionales (si vinieran en claims) */
export function getUserRoles() {
  const claims = getUserClaims();
  return Array.isArray(claims?.roles) ? claims.roles : [];
}

/**
 * Refresca grupos reales desde backend y fija el rol principal.
 * Acepta tanto `groups` como `roles` desde el backend.
 */
export async function refreshUserRole() {
  if (!isLoggedIn()) {
    clearCachedRole();
    setCachedGroups([]);
    return 'readonly';
  }
  try {
    const { data } = await api.get('/carga-datos/api/admin/me');
    const groups = Array.isArray(data?.groups) ? data.groups : (Array.isArray(data?.roles) ? data.roles : []);
    const role = groupsToPrimaryRole(groups, { is_superuser: !!data?.is_superuser });

    setCachedGroups(groups);
    setCachedRole(role); // dispara role-updated + auth-changed
    return role;
  } catch {
    // fallback: no crashea la UI; mantiene rol inferido
    return getUserRole();
  }
}

/** ============================
 *  Helpers de capacidades (UI)
 *  ============================ */
export function canManageEntidades() {
  const r = getUserRole();
  return r === 'Admin' || r === 'Supervisor';
}
export function canUploadExcel() {
  const r = getUserRole();
  return r === 'Admin' || r === 'Supervisor' || r === 'Operador';
}
export function canBulkValidate() {
  const r = getUserRole();
  return r === 'Admin' || r === 'Supervisor';
}
export function canBulkCommit() {
  return getUserRole() === 'Admin';
}
export function canViewClients() {
  return isLoggedIn();
}

/** Alias legacy opcional */
export function getLegacyRole() {
  return primaryToLegacyAlias(getUserRole());
}
