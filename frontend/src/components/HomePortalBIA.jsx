// frontend/src/components/HomePortalBia.jsx
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  isLoggedIn,
  getUserRole,
  refreshUserRole,
  // ✅ helpers de capacidades centralizados en auth.js
  canManageEntidades,
  canBulkValidate,
  canUploadExcel,
} from '../services/auth';

export default function HomePortalBia() {
  const [role, setRole] = useState(getUserRole());
  const logged = isLoggedIn();

  useEffect(() => {
    (async () => {
      if (isLoggedIn()) {
        const r = await refreshUserRole();
        setRole(r);
      } else {
        setRole('readonly');
      }
    })();

    const sync = () => setRole(getUserRole());
    window.addEventListener('auth-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('auth-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // 🔐 Reglas usando helpers
  const canManageEntidadesUI = canManageEntidades(); // Admin / Supervisor
  const canModifyMasivo     = canBulkValidate();     // Admin / Supervisor (commit lo corta el backend a Admin)
  const canUploadExcelUI    = canUploadExcel();      // Admin / Supervisor / Operador

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
              {logged && (
                <div className="mt-2">
                  <span className="badge text-bg-light border">
                    Sesión activa · Rol: <strong className="ms-1">{role}</strong>
                  </span>
                </div>
              )}
            </div>

            <hr className="mt-2 mb-4" />
            <p className="text-muted text-center mb-4">Elegí una acción para comenzar:</p>

            {logged ? (
              <>
                <div className="row g-3 g-md-4">
                  {/* Gestionar Entidades -> Admin/Supervisor */}
                  {canManageEntidadesUI && (
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

                  {/* Cargar Excel -> Admin/Supervisor/Operador */}
                  {canUploadExcelUI && (
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

                  {/* Modificar Masivo -> Admin/Supervisor (commit restringido en backend a Admin) */}
                  {canModifyMasivo && (
                    <div className="col-12 col-md-6">
                      <Link to="/modificar-masivo" className="text-decoration-none">
                        <div
                          className="border rounded-3 p-3 p-md-4 h-100 d-flex align-items-center gap-3 shadow-sm hover-shadow-sm bg-white"
                          aria-label="Modificar Masivo"
                          title="Ajuste de columnas desde Excel/CSV con vista previa y auditoría"
                        >
                          <span className="modern-icon" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                              <path d="M4 5a2 2 0 0 1 2-2h8.5a2 2 0 0 1 1.4.58l3.52 3.52c.37.37.58.88.58 1.41V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M14 3v4a2 2 0 0 0 2 2h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M7 13h5M7 17h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                              <path d="M17.5 12.5l2 2-4 4-2.2.3.3-2.3 3.9-4Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                          <div className="flex-grow-1">
                            <div className="d-flex align-items-center gap-2">
                              <div className="fw-semibold text-body">Modificar Masivo</div>
                              <span className="badge text-bg-light border">Nuevo</span>
                            </div>
                            <small className="text-secondary">
                              Ajuste de columnas desde Excel/CSV con vista previa y auditoría
                            </small>
                          </div>
                        </div>
                      </Link>
                    </div>
                  )}

                  {/* Mostrar Datos -> todos (Operador solo lectura; lo impone backend) */}
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
                          <small className="text-secondary">Consultá y editá por DNI/ID</small>
                        </div>
                      </div>
                    </Link>
                  </div>

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
