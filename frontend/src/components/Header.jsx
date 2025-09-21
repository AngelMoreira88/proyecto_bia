// src/components/Header.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { isLoggedIn, logout } from "../services/auth";
import { adminGetMe } from "../services/api";

export default function Header() {
  const [logged, setLogged] = useState(isLoggedIn());
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [roles, setRoles] = useState([]); // ["Admin","Supervisor","Operador"]
  const [loadingMe, setLoadingMe] = useState(true);

  const navigate = useNavigate();

  // Helpers
  const hasRole = (name) => roles.includes(name);

  // Cargar permisos REALES desde backend
  const loadMe = async () => {
    if (!isLoggedIn()) {
      setLogged(false);
      setIsSuperUser(false);
      setRoles([]);
      setLoadingMe(false);
      return;
    }
    try {
      setLoadingMe(true);
      const { data } = await adminGetMe();
      const r = Array.isArray(data?.roles) ? data.roles : [];
      setLogged(true);
      setIsSuperUser(!!data?.is_superuser);
      setRoles(r);
    } catch {
      // si falla /me, consideramos sin permisos
      setIsSuperUser(false);
      setRoles([]);
    } finally {
      setLoadingMe(false);
    }
  };

  useEffect(() => {
    loadMe();

    const syncAuth = () => {
      setLogged(isLoggedIn());
      loadMe();
    };

    window.addEventListener("storage", syncAuth);
    window.addEventListener("auth-changed", syncAuth);
    return () => {
      window.removeEventListener("storage", syncAuth);
      window.removeEventListener("auth-changed", syncAuth);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardTo = (path) => {
    if (isLoggedIn()) navigate(path);
    else {
      localStorage.setItem("redirectAfterLogin", path);
      navigate("/login");
    }
  };

  const handleLogout = () => {
    logout();
    setLogged(false);
    setIsSuperUser(false);
    setRoles([]);
    navigate("/");
  };

  // --------- Capacidades (alineadas a carga_datos/permissions.py) ----------
  const caps = useMemo(() => {
    const isAdmin = isSuperUser || hasRole("Admin");
    return {
      isAdmin,
      canManageEntities: isSuperUser || hasRole("Admin") || hasRole("Supervisor"),
      canUploadExcel: isSuperUser || hasRole("Admin") || hasRole("Supervisor") || hasRole("Operador"),
      canViewClients: isSuperUser || hasRole("Admin") || hasRole("Supervisor") || hasRole("Operador"),
      canBulkModify: isSuperUser || hasRole("Admin") || hasRole("Supervisor"),
    };
  }, [isSuperUser, roles]);

  // Bloqueo explícito (no navegar si no tiene permiso)
  const noPerm = (e) => {
    if (e?.preventDefault) e.preventDefault();
    alert("No tenés permisos para esta sección.");
  };

  // Render helper: link habilitado / deshabilitado
  const RenderLink = ({ to, allowed, children, className = "modern-item d-flex align-items-start gap-3 text-decoration-none" }) => {
    if (allowed) {
      return (
        <NavLink to={to} className={className}>
          {children}
        </NavLink>
      );
    }
    return (
      <div
        className={`${className} opacity-75`}
        title="No tenés permisos para esta sección"
        aria-disabled="true"
        role="button"
        onClick={noPerm}
      >
        {children}
      </div>
    );
  };

  return (
    <nav className="navbar navbar-expand-lg fixed-top header-glass">
      <div className="container-fluid px-3 px-lg-4">
        {/* Brand */}
        <Link className="navbar-brand d-flex align-items-center" to={logged ? "/portal" : "/"}>
          <img
            src="/images/LogoBIA2.png"
            alt="BIA"
            className="brand-logo"
            style={{ objectFit: "contain" }}
          />
        </Link>

        {/* Toggler (mobile) */}
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="offcanvas"
          data-bs-target="#mainNav"
          aria-controls="mainNav"
          aria-label="Abrir menú"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        {/* Offcanvas + body */}
        <div
          className="offcanvas offcanvas-end offcanvas-nav"
          tabIndex="-1"
          id="mainNav"
          aria-labelledby="mainNavLabel"
        >
          <div className="offcanvas-header">
            <h5 id="mainNavLabel" className="m-0">Menú</h5>
            <button type="button" className="btn-close" data-bs-dismiss="offcanvas" aria-label="Cerrar"></button>
          </div>

          <div className="offcanvas-body">
            <ul className="navbar-nav ms-auto align-items-lg-center nav-underline gap-lg-3">
              {logged ? (
                <>
                  {/* Portal (siempre para logueados) */}
                  <li className="nav-item">
                    <NavLink to="/portal" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
                      Portal BIA
                    </NavLink>
                  </li>

                  {/* Generar Certificado (siempre para logueados; ajustá si tu back lo restringe) */}
                  <li className="nav-item">
                    <NavLink to="/certificado" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
                      Consultas y Descargas
                    </NavLink>
                  </li>

                  {/* Gestión de Entidades → canManageEntities */}
                  <li className="nav-item">
                    {caps.canManageEntities ? (
                      <NavLink to="/entidades" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
                        Gestión de Entidades
                      </NavLink>
                    ) : (
                      <a href="#!" className="nav-link opacity-75" onClick={noPerm}>
                        Gestión de Entidades
                      </a>
                    )}
                  </li>

                  {/* Dropdown Obligaciones */}
                  <li className="nav-item dropdown dropdown-hover">
                    <a
                      href="#!"
                      className="nav-link dropdown-toggle"
                      id="deudoresDropdown"
                      role="button"
                      data-bs-toggle="dropdown"
                      data-bs-display="static"
                      aria-expanded="false"
                    >
                      Obligaciones
                    </a>

                    <div
                      className="dropdown-menu dropdown-menu-start dropdown-menu-modern p-3"
                      data-bs-popper="static"
                      aria-labelledby="deudoresDropdown"
                    >
                      <div className="d-grid gap-2" style={{ minWidth: 260 }}>
                        {/* Cargar Excel → canUploadExcel */}
                        <RenderLink to="/carga-datos/upload" allowed={caps.canUploadExcel}>
                          <span className="modern-icon" aria-hidden="true">
                            {/* Upload */}
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                              <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"
                                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                          <div className="flex-grow-1">
                            <div className="modern-title">Cargar Excel</div>
                            <small className="text-secondary">Subí un excel para actualizar los registros</small>
                          </div>
                        </RenderLink>

                        {/* Listar por DNI → canViewClients */}
                        <RenderLink to="/datos/mostrar" allowed={caps.canViewClients}>
                          <span className="modern-icon" aria-hidden="true">
                            {/* Search */}
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                              <path d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
                                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                          <div className="flex-grow-1">
                            <div className="modern-title">Listar por DNI</div>
                            <small className="text-secondary">Consultá y editá estados individuales</small>
                          </div>
                        </RenderLink>

                        {/* Modificar Masivo → canBulkModify */}
                        <RenderLink to="/modificar-masivo" allowed={caps.canBulkModify}>
                          <span className="modern-icon" aria-hidden="true">
                            {/* Tools / Pencil */}
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                              <path d="M14 7l3 3-8 8H6v-3l8-8Z"
                                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M13 6l1-1a2.828 2.828 0 1 1 4 4l-1 1"
                                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                          <div className="flex-grow-1">
                            <div className="modern-title d-flex align-items-center gap-2">
                              <span>Modificar Masivo</span>
                              <span className="badge text-bg-light border">Nuevo</span>
                            </div>
                            <small className="text-secondary">Ajuste masivo de columnas desde un excel</small>
                          </div>
                        </RenderLink>
                      </div>
                    </div>
                  </li>

                  {/* Perfil (siempre para logueados) */}
                  <li className="nav-item">
                    <NavLink
                      to="/perfil"
                      className={({ isActive }) =>
                        "nav-link d-flex align-items-center gap-1" + (isActive ? " active" : "")
                      }
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M12 12c2.485 0 4.5-2.015 4.5-4.5S14.485 3 12 3 7.5 5.015 7.5 7.5 9.515 12 12 12Z"
                              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M4.5 21c0-3.313 3.358-6 7.5-6s7.5 2.687 7.5 6"
                              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span>Perfil</span>
                    </NavLink>
                  </li>

                  <li className="nav-item">
                    <button className="btn btn-outline-danger btn-sm ms-lg-2" onClick={handleLogout}>
                      Salir
                    </button>
                  </li>
                </>
              ) : (
                <>
                  <li className="nav-item">
                    <NavLink to="/certificado" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
                      Generar Certificado
                    </NavLink>
                  </li>
                  <li className="nav-item">
                    <button
                      className="btn btn-bia btn-nav-compact-s ms-lg-2"
                      onClick={() => guardTo("/portal")}
                    >
                      Portal BIA
                    </button>
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Opcional: indicador de carga de /me para evitar “parpadeos” de menú */}
      {logged && loadingMe && (
        <div className="position-fixed top-0 end-0 p-2">
          <span className="badge text-bg-light border">Verificando permisos…</span>
        </div>
      )}
    </nav>
  );
}
