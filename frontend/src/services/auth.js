// frontend/src/services/auth.js
import api from './api';

/** Header de auth */
const AUTH_HEADER = 'Authorization';

/** Claves de cache local */
const ROLE_KEY   = 'user_role';    // guarda "Admin" | "Supervisor" | "Operador" | "readonly"
const GROUPS_KEY = 'user_groups';  // array de grupos reales del backend

/** Notificar a la app que cambió auth/rol (mismo tab) */
export function notifyAuthChanged() {
  try { window.dispatchEvent(new Event('auth-changed')); } catch {}
}

/** Levantar Authorization desde storage en primeros milisegundos */
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

/** 
 * Mapea grupos Django a un rol principal del front.
 * Prioridad: is_superuser -> "Admin"
 * Luego: "Admin" | "Supervisor" | "Operador"
 * Fallback: "readonly"
 */
function groupsToPrimaryRole(groups = [], { is_superuser = false } = {}) {
  const g = lowerSet(groups);
  if (is_superuser || g.has('admin'))      return 'Admin';
  if (g.has('supervisor'))                 return 'Supervisor';
  if (g.has('operador'))                   return 'Operador';
  return 'readonly';
}

/**
 * Compatibilidad: algunos componentes viejos podrían chequear 'admin'/'editor'/'approver'.
 * Devolvemos el alias legacy para ese código si lo necesitaras.
 * - Admin      -> 'admin'
 * - Supervisor -> 'editor'    (puede validar y gestionar entidades)
 * - Operador   -> 'approver'  (lectura/Cargar Excel)
 * - readonly   -> 'readonly'
 */
function primaryToLegacyAlias(primaryRole) {
  switch (primaryRole) {
    case 'Admin':      return 'admin';
    case 'Supervisor': return 'editor';
    case 'Operador':   return 'approver';
    default:           return 'readonly';
  }
}

/** --- Auth core --- */
export async function login(username, password) {
  const { data } = await api.post('/api/token/', { username, password });
  const { access, refresh } = data || {};

  localStorage.setItem('access_token', access);
  localStorage.setItem('refresh_token', refresh);
  api.defaults.headers[AUTH_HEADER] = `Bearer ${access}`;

  // limpiamos caches; el rol real se setea con refreshUserRole()
  clearCachedRole();
  setCachedGroups([]);
  notifyAuthChanged();
}

export function logout() {
  try { localStorage.removeItem('access_token'); } catch {}
  try { localStorage.removeItem('refresh_token'); } catch {}
  delete api.defaults.headers[AUTH_HEADER];

  clearCachedRole();
  setCachedGroups([]);
  notifyAuthChanged();
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

  localStorage.setItem('access_token', access);
  api.defaults.headers[AUTH_HEADER] = `Bearer ${access}`;
  notifyAuthChanged();
  return access;
}

/**
 * Rol principal del usuario (EFECTIVO).
 * 1) Usa cache refrescada desde /carga-datos/api/admin/me
 * 2) Si no hay cache, infiere desde claims JWT
 * Retorna: "Admin" | "Supervisor" | "Operador" | "readonly"
 */
export function getUserRole() {
  const cached = getCachedRole();
  if (cached) return cached;

  const claims = getUserClaims();
  if (!claims) return 'readonly';

  // Si el token trae grupos/perms, inferimos
  const groups = Array.isArray(claims.groups) ? claims.groups : [];
  const is_superuser = !!claims.is_superuser;
  const primary = groupsToPrimaryRole(groups, { is_superuser });

  // Compatibilidad: si algún claim custom trae role=minúsculas, lo consideramos
  const legacy = (claims.role || claims.user_role || '').toString().toLowerCase();
  if (!groups.length && legacy) {
    if (legacy === 'admin') return 'Admin';
    if (legacy === 'editor') return 'Supervisor';
    if (legacy === 'approver') return 'Operador';
  }

  return primary;
}

/** Atajos de rol (no removemos isStaff por compat) */
export function isAdmin()     { return getUserRole() === 'Admin'; }
export function isSupervisor(){ return getUserRole() === 'Supervisor'; }
export function isOperador()  { return getUserRole() === 'Operador'; }
export function isStaff()     { 
  // compat: si algún código antiguo usa 'staff', lo equiparamos a Supervisor/Admin
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
 * Endpoint: /carga-datos/api/admin/me → { is_superuser, groups: [...] }
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
    const role = groupsToPrimaryRole(groups, { is_superuser: !!data?.is_superuser });

    setCachedGroups(groups);
    setCachedRole(role);
    return role;
  } catch {
    // si falla, devolvemos el rol inferido (no crashea la UI)
    return getUserRole();
  }
}

/** ============================
 *  Helpers de capacidades (UI)
 *  ============================ 
 *  Centralizá en un lugar qué puede hacer cada rol.
 *  El backend IGUAL hace cumplir permisos reales.
 */
export function canManageEntidades() {
  // Admin / Supervisor
  const r = getUserRole();
  return r === 'Admin' || r === 'Supervisor';
}
export function canUploadExcel() {
  // Admin / Supervisor / Operador
  const r = getUserRole();
  return r === 'Admin' || r === 'Supervisor' || r === 'Operador';
}
export function canBulkValidate() {
  // Admin / Supervisor (la validación de Modificar Masivo)
  const r = getUserRole();
  return r === 'Admin' || r === 'Supervisor';
}
export function canBulkCommit() {
  // Solo Admin (el backend también lo restringe)
  return getUserRole() === 'Admin';
}
export function canViewClients() {
  // Todos los roles autenticados; Operador es solo lectura (lo impone backend)
  return isLoggedIn();
}

/** ===== Compat opcional =====
 * Si algún código viejo espera strings minúsculas ('admin'/'editor'/'approver'),
 * podés usar este alias.
 */
export function getLegacyRole() {
  return primaryToLegacyAlias(getUserRole());
}
