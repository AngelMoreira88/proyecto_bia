// src/components/Header.jsx
import React, { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { isLoggedIn, logout, getUserRole, refreshUserRole } from "../services/auth";

export default function Header() {
  const [logged, setLogged] = useState(isLoggedIn());
  const [role, setRole] = useState(getUserRole());
  const navigate = useNavigate();

  useEffect(() => {
    const syncAuth = () => {
      setLogged(isLoggedIn());
      setRole(getUserRole());
    };

    // Refrescar rol real desde backend al montar
    (async () => {
      if (isLoggedIn()) {
        await refreshUserRole().catch(() => {});
        setRole(getUserRole());
      } else {
        setRole("readonly");
      }
    })();

    window.addEventListener("storage", syncAuth);
    window.addEventListener("auth-changed", syncAuth);
    return () => {
      window.removeEventListener("storage", syncAuth);
      window.removeEventListener("auth-changed", syncAuth);
    };
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
    navigate("/");
  };

  const canModifyMasivo = ["admin", "editor", "approver"].includes(role);

  return (
    <nav className="navbar navbar-expand-lg fixed-top header-glass">
      {/* container-fluid para “pegar” el logo a la izquierda con poco margen */}
      <div className="container-fluid px-3 px-lg-4">
        {/* Brand: solo logo a la izquierda */}
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

        {/* Offcanvas (mobile) + body normal (desktop) */}
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
            {/* ÚNICA lista: ms-auto → empuja TODO al margen derecho en desktop */}
            <ul className="navbar-nav ms-auto align-items-lg-center nav-underline gap-lg-3">
              {logged ? (
                <>
                  <li className="nav-item">
                    <NavLink to="/portal" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
                      Portal
                    </NavLink>
                  </li>

                  <li className="nav-item">
                    <NavLink to="/certificado" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
                      Generar Certificado
                    </NavLink>
                  </li>

                  <li className="nav-item">
                    <NavLink to="/entidades" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
                      Gestión de Entidades
                    </NavLink>
                  </li>

                  {/* Dropdown Obligaciones */}
                  <li className="nav-item dropdown dropdown-hover">
                    <a
                      href="#!"
                      className="nav-link dropdown-toggle"
                      id="deudoresDropdown"
                      role="button"
                      data-bs-toggle="dropdown"
                      data-bs-display="static"      /* 👈 evita auto-reposicionamiento */
                      aria-expanded="false"
                    >
                      Obligaciones
                    </a>

                    <div
                      className="dropdown-menu dropdown-menu-start dropdown-menu-modern p-3" /* 👈 fija a la izquierda */
                      data-bs-popper="static"                                            /* 👈 posición estática */
                      aria-labelledby="deudoresDropdown"
                    >
                      <div className="d-grid gap-2" style={{ minWidth: 260 }}>
                        <NavLink to="/carga-datos/upload" className="modern-item d-flex align-items-start gap-3 text-decoration-none">
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
                        </NavLink>

                        <NavLink to="/datos/mostrar" className="modern-item d-flex align-items-start gap-3 text-decoration-none">
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
                        </NavLink>

                        {/* Modificar Masivo */}
                        {canModifyMasivo ? (
                          <NavLink to="/modificar-masivo" className="modern-item d-flex align-items-start gap-3 text-decoration-none">
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
                          </NavLink>
                        ) : (
                          <div
                            className="modern-item d-flex align-items-start gap-3 text-decoration-none opacity-75"
                            title="Requiere rol: admin, editor o approver"
                            aria-disabled="true"
                            role="button"
                            onClick={() => guardTo("/modificar-masivo")}
                          >
                            <span className="modern-icon" aria-hidden="true">
                              {/* Lock */}
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                <path d="M7 10V7a5 5 0 1 1 10 0v3M6 10h12v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9Z"
                                      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </span>
                            <div className="flex-grow-1">
                              <div className="modern-title">Modificar Masivo</div>
                              <small className="text-secondary">Requiere rol autorizado</small>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>

                  {/* Perfil */}
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
    </nav>
  );
}
