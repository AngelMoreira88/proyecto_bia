// frontend/src/services/auth.js
import api from './api';

/** Clave del header */
const AUTH_HEADER = 'Authorization';

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
  notifyAuthChanged();
}

/**
 * Borra los tokens y el header de autorización.
 */
export function logout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  delete api.defaults.headers[AUTH_HEADER];
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
  notifyAuthChanged();
  return access;
}

/**
 * Rol principal del usuario.
 * Prioridades:
 *  - role / user_role === 'admin' → 'admin'
 *  - is_superuser → 'admin'
 *  - grupo 'admin' o permiso 'bia_admin' → 'admin'
 *  - is_staff o grupo 'staff' → 'staff'
 *  - por defecto → 'readonly'
 */
export function getUserRole() {
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
  if (isStaff || groups.includes('staff')) return 'staff';
  return 'readonly';
}

/** Atajo: ¿tiene privilegios administrativos? */
export function isAdmin() {
  return getUserRole() === 'admin';
}

/** Atajo: ¿es staff (pero no admin)? */
export function isStaff() {
  return getUserRole() === 'staff';
}

/** ¿pertenece a un grupo (case-insensitive)? */
export function inGroup(name) {
  const claims = getUserClaims();
  const target = String(name || '').toLowerCase();
  const groups = Array.isArray(claims?.groups) ? claims.groups.map(g => String(g).toLowerCase()) : [];
  return groups.includes(target);
}

/** ¿tiene un permiso (case-insensitive)? */
export function hasPerm(code) {
  const claims = getUserClaims();
  const target = String(code || '').toLowerCase();
  const perms = Array.isArray(claims?.perms) ? claims.perms.map(p => String(p).toLowerCase()) : [];
  return perms.includes(target);
}

/**
 * Lista de roles adicionales (claim `roles`), si existiera.
 */
export function getUserRoles() {
  const claims = getUserClaims();
  return Array.isArray(claims?.roles) ? claims.roles : [];
}
