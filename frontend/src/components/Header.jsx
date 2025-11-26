// src/components/Header.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { isLoggedIn, logout } from "../services/auth";
import { adminGetMe } from "../services/api";

export default function Header() {
  const [logged, setLogged] = useState(isLoggedIn());
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [roles, setRoles] = useState([]); // ["Admin","Supervisor","Operador"]
  const [loadingMe, setLoadingMe] = useState(true);

  const navigate = useNavigate();

  // ==== Anti-bucle /me ====
  const inFlightRef = useRef(false);
  const lastFetchTsRef = useRef(0);
  const scheduledRef = useRef(null);
  const MIN_INTERVAL_MS = 8000;

  const safeFetchGuard = () => {
    const now = Date.now();
    if (inFlightRef.current) return false;
    if (now - lastFetchTsRef.current < MIN_INTERVAL_MS) return false;
    inFlightRef.current = true;
    lastFetchTsRef.current = now;
    return true;
  };

  const releaseFetchGuard = () => {
    inFlightRef.current = false;
  };

  // Helpers
  const hasRole = (name) => roles.includes(name);

  // Cargar permisos REALES desde backend
  const doLoadMe = useCallback(async () => {
    if (!isLoggedIn()) {
      setLogged(false);
      setIsSuperUser(false);
      setRoles([]);
      setLoadingMe(false);
      return;
    }
    setLoadingMe(true);
    try {
      const { data } = await adminGetMe({ force: true });
      const r = Array.isArray(data?.roles) ? data.roles : (Array.isArray(data?.groups) ? data.groups : []);
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
  }, []);

  const scheduleMe = useCallback((immediate = false) => {
    if (scheduledRef.current) {
      clearTimeout(scheduledRef.current);
      scheduledRef.current = null;
    }
    const run = async () => {
      if (!safeFetchGuard()) return;
      try {
        await doLoadMe();
      } finally {
        releaseFetchGuard();
      }
    };
    if (immediate) run();
    else scheduledRef.current = setTimeout(run, 150);
  }, [doLoadMe]);

  useEffect(() => {
    // carga inicial
    scheduleMe(true);

    const syncAuth = () => {
      setLogged(isLoggedIn());
      scheduleMe(false);
    };

    const onStorage = (e) => {
      const k = e?.key || '';
      if (k.includes('access_token') || k.includes('user_role') || k.includes('user_groups')) {
        syncAuth();
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("auth-changed", syncAuth);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("auth-changed", syncAuth);
      if (scheduledRef.current) clearTimeout(scheduledRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardTo = (path) => {
    if (isLoggedIn()) navigate(path);
    else {
      try { localStorage.setItem("redirectAfterLogin", path); } catch {}
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

                  {/* Generar Certificado (ajustá si tu back lo restringe) */}
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

                  {/* Dropdown Operaciones */}
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
                      Operaciones
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
                            <div className="modern-title">Cargar excel</div>
                            <small className="text-secondary">Altas de registros desde un archivo</small>
                          </div>
                        </RenderLink>

                        {/* Mostrar datos → canViewClients */}
                        <RenderLink to="/datos/mostrar" allowed={caps.canViewClients}>
                          <span className="modern-icon" aria-hidden="true">
                            {/* Search */}
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                              <path d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
                                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                          <div className="flex-grow-1">
                            <div className="modern-title">Acciones individuales</div>
                            <small className="text-secondary">Consultá y editá registros individuales</small>
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
                            <div className="modern-title">
                              <span>Acciones masivas</span>
                            </div>
                            <small className="text-secondary">Actualizar, insertar, eliminar registros de forma masiva</small>
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
                      Portal de Consultas y Descargas
                    </NavLink>
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Indicador de carga de /me sin parpadeo infinito */}
      {logged && loadingMe && (
        <div className="position-fixed top-0 end-0 p-2">
          <span className="badge text-bg-light border">Verificando permisos…</span>
        </div>
      )}
    </nav>
  );
}
