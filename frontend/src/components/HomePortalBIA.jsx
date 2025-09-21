// frontend/src/components/HomePortalBia.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  isLoggedIn,
  getUserRole,
  refreshUserRole,
  canManageEntidades,
  canBulkValidate,
  canUploadExcel,
} from '../services/auth';
import { adminGetMe } from '../services/api';

export default function HomePortalBia() {
  const [role, setRole] = useState(getUserRole());
  const [logged, setLogged] = useState(isLoggedIn());

  // Estado de /me
  const [me, setMe] = useState({
    first_name: '',
    last_name: '',
    email: '',
    roles: [],
    username: '',
    is_superuser: false,
  });
  const [loadingMe, setLoadingMe] = useState(false);

  // Reglas de UI (derivadas del rol local — helpers sincrónicos)
  const [perm, setPerm] = useState({
    canManageEntidadesUI: canManageEntidades(),
    canModifyMasivo: canBulkValidate(),
    canUploadExcelUI: canUploadExcel(),
  });

  const updatePerms = useCallback(() => {
    setPerm({
      canManageEntidadesUI: canManageEntidades(),
      canModifyMasivo: canBulkValidate(),
      canUploadExcelUI: canUploadExcel(),
    });
  }, []);

  const reFetchMe = useCallback(async () => {
    // Si no hay sesión, limpiar y salir sin “verificar permisos” eternos
    if (!isLoggedIn()) {
      setLogged(false);
      setRole('readonly');
      setMe({
        first_name: '',
        last_name: '',
        email: '',
        roles: [],
        username: '',
        is_superuser: false,
      });
      updatePerms();
      return;
    }

    setLogged(true);
    setLoadingMe(true);
    try {
      // Refrescar rol local (sin bloquear la UI)
      const r = await refreshUserRole().catch(() => getUserRole());
      setRole(r || getUserRole());
      updatePerms();

      // Traer /me (solo para datos visibles: nombre, email, grupos)
      const { data } = await adminGetMe();
      setMe({
        first_name: data?.first_name ?? '',
        last_name: data?.last_name ?? '',
        email: data?.email ?? '',
        roles: Array.isArray(data?.roles) ? data.roles : [],
        username: data?.username ?? '',
        is_superuser: !!data?.is_superuser,
      });
    } catch {
      // Si falla /me, no dejamos la UI “verificando”
      setMe((prev) => ({ ...prev, roles: [] }));
    } finally {
      setLoadingMe(false);
    }
  }, [updatePerms]);

  // Carga inicial
  useEffect(() => {
    reFetchMe();
  }, [reFetchMe]);

  // Reaccionar a cambios de auth/almacenamiento/perfil
  useEffect(() => {
    const syncAll = () => {
      setLogged(isLoggedIn());
      setRole(getUserRole());
      updatePerms();
      reFetchMe(); // refresca /me si hay sesión
    };

    const syncRoleOnly = () => {
      setRole(getUserRole());
      updatePerms();
    };

    window.addEventListener('auth-changed', syncAll);
    window.addEventListener('storage', syncAll);
    window.addEventListener('profile-updated', syncAll);

    // (por si alguna otra vista solo cambiara el rol local)
    window.addEventListener('role-updated', syncRoleOnly);

    return () => {
      window.removeEventListener('auth-changed', syncAll);
      window.removeEventListener('storage', syncAll);
      window.removeEventListener('profile-updated', syncAll);
      window.removeEventListener('role-updated', syncRoleOnly);
    };
  }, [reFetchMe, updatePerms]);

  const grupos = me.roles && me.roles.length ? me.roles.join(', ') : '—';
  const nombreCompleto =
    [me.first_name, me.last_name].filter(Boolean).join(' ') || '—';

  return (
    <div
      className="page-fill d-flex align-items-center w-100 bg-dark-subtle"
      style={{ minHeight: 'calc(100vh - 88px)' }}
    >
      <div className="container">
        <div className="card border-0 shadow-sm rounded-4 w-100 mx-auto" style={{ maxWidth: 960 }}>
          <div className="card-body p-4 p-md-5">
            {/* Encabezado */}
            <div className="text-center mb-4">
              <h2 className="fw-bold text-bia mb-1">Portal de Grupo BIA</h2>
              <small className="text-secondary">
                Accedé a las funcionalidades internas y herramientas de gestión
              </small>
            </div>

            {/* ──────────────────────────────
                Bloque compacto: Sesión + datos
               ────────────────────────────── */}
            {logged && (
              <div className="border rounded-3 bg-light-subtle py-2 px-3 mb-4 small">
                <div className="d-flex flex-column flex-md-row align-items-start align-items-md-center justify-content-between gap-2">
                  <div className="d-flex flex-wrap gap-2">
                    <span className="badge text-bg-light border">Sesión activa</span>
                    <span className="badge text-bg-light border">
                      Rol: <strong>{role}</strong>
                    </span>
                    {loadingMe && (
                      <span className="badge text-bg-light border">Cargando…</span>
                    )}
                  </div>
                  {me.username && (
                    <span className="text-secondary">
                      Usuario: <span className="fw-semibold">{me.username}</span>
                    </span>
                  )}
                </div>
                <div className="row g-2 mt-2">
                  <div className="col-12 col-md-4">
                    <div className="text-secondary">Nombre y Apellido</div>
                    <div className="fw-semibold text-truncate" title={nombreCompleto}>
                      {nombreCompleto}
                    </div>
                  </div>
                  <div className="col-12 col-md-4">
                    <div className="text-secondary">Email</div>
                    <div className="fw-semibold text-truncate" title={me.email || '—'}>
                      {me.email || '—'}
                    </div>
                  </div>
                  <div className="col-12 col-md-4">
                    <div className="text-secondary">Grupo(s)</div>
                    <div className="fw-semibold text-truncate" title={grupos}>
                      {grupos}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <p className="text-muted text-center mb-4">Elegí una acción para comenzar:</p>

            {logged ? (
              <>
                <div className="row g-3 g-md-4">
                  {/* Gestionar Entidades */}
                  {perm.canManageEntidadesUI && (
                    <div className="col-12 col-md-6">
                      <Link to="/entidades" className="text-decoration-none">
                        <div className="border rounded-3 p-3 p-md-4 h-100 d-flex align-items-center gap-3 shadow-sm hover-shadow-sm bg-white">
                          <span className="modern-icon" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                              <path d="M3 21h18M6 21V7h12v14M9 7V3h6v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                          <div>
                            <div className="fw-semibold text-body">Gestionar Entidades</div>
                            <small className="text-secondary">Alta, edición y administración</small>
                          </div>
                        </div>
                      </Link>
                    </div>
                  )}

                  {/* Cargar Excel */}
                  {perm.canUploadExcelUI && (
                    <div className="col-12 col-md-6">
                      <Link to="/carga-datos/upload" className="text-decoration-none">
                        <div className="border rounded-3 p-3 p-md-4 h-100 d-flex align-items-center gap-3 shadow-sm hover-shadow-sm bg-white">
                          <span className="modern-icon" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                              <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 21h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                          <div>
                            <div className="fw-semibold text-body">Cargar Excel</div>
                            <small className="text-secondary">Altas de registros desde archivo</small>
                          </div>
                        </div>
                      </Link>
                    </div>
                  )}

                  {/* Modificar Masivo */}
                  {perm.canModifyMasivo && (
                    <div className="col-12 col-md-6">
                      <Link to="/modificar-masivo" className="text-decoration-none">
                        <div className="border rounded-3 p-3 p-md-4 h-100 d-flex align-items-center gap-3 shadow-sm hover-shadow-sm bg-white">
                          <span className="modern-icon" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                              <path d="M4 5a2 2 0 0 1 2-2h8.5a2 2 0 0 1 1.4.58l3.52 3.52c.37.37.58.88.58 1.41V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M14 3v4a2 2 0 0 0 2 2h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M7 13h5M7 17h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                              <path d="M17.5 12.5l2 2-4 4-2.2.3.3-2.3 3.9-4Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                          <div>
                            <div className="fw-semibold text-body">Modificar Masivo</div>
                            <small className="text-secondary">Ajuste masivo de registros</small>
                          </div>
                        </div>
                      </Link>
                    </div>
                  )}

                  {/* Mostrar Datos */}
                  <div className="col-12 col-md-6">
                    <Link to="/datos/mostrar" className="text-decoration-none">
                      <div className="border rounded-3 p-3 p-md-4 h-100 d-flex align-items-center gap-3 shadow-sm hover-shadow-sm bg-white">
                        <span className="modern-icon" aria-hidden="true">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </span>
                        <div>
                          <div className="fw-semibold text-body">Mostrar Datos</div>
                          <small className="text-secondary">Consulta por DNI/ID</small>
                        </div>
                      </div>
                    </Link>
                  </div>

                  {/* Generar Certificado */}
                  <div className="col-12 col-md-6">
                    <Link to="/certificado" className="text-decoration-none">
                      <div className="border rounded-3 p-3 p-md-4 h-100 d-flex align-items-center gap-3 shadow-sm hover-shadow-sm bg-white">
                        <span className="modern-icon" aria-hidden="true">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M7 3h10a2 2 0 0 1 2 2v13.5a.5.5 0 0 1-.8.4L15 17l-3.2 1.9a.5.5 0 0 1-.6 0L8 17l-3.2 1.9a.5.5 0 0 1-.8-.4V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M9 7h6M9 10h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                          </svg>
                        </span>
                        <div>
                          <div className="fw-semibold text-body">Generar Certificado</div>
                          <small className="text-secondary">Libre de Deuda</small>
                        </div>
                      </div>
                    </Link>
                  </div>
                </div>
              </>
            ) : (
              <div className="d-grid">
                <Link to="/login" className="btn btn-bia btn-lg">Iniciar sesión</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
