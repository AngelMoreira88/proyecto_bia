// src/components/Header.jsx
import React, { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { isLoggedIn, logout } from "../services/auth";

export default function Header() {
  const [logged, setLogged] = useState(isLoggedIn());
  const navigate = useNavigate();

  useEffect(() => {
    const check = () => setLogged(isLoggedIn());
    window.addEventListener("storage", check);
    return () => window.removeEventListener("storage", check);
  }, []);

  // Si no hay login, va a /login y luego vuelve al destino
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

  return (
    <nav className="navbar navbar-expand-lg fixed-top header-glass">
      <div className="container">
        {/* Brand: solo logo (sin texto) */}
        <Link className="navbar-brand d-flex align-items-center" to={logged ? "/portal" : "/"}>
          <img
            src="/images/LogoBIA2.png"
            alt="BIA"
            className="brand-logo"
            style={{ objectFit: "contain" }}
          />
        </Link>

        {/* Toggler → offcanvas en mobile */}
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

                  {/* Solo visible con sesión */}
                  <li className="nav-item">
                    <NavLink to="/entidades" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
                      Gestión de Entidades
                    </NavLink>
                  </li>

            {/* Dropdown Deudores (moderno) */}
            <li className="nav-item dropdown dropdown-hover">
              <a
                href="#!"
                className="nav-link dropdown-toggle"
                id="deudoresDropdown"
                role="button"
                data-bs-toggle="dropdown"
                aria-expanded="false"
              >
                Deudores
              </a>

              <div
                className="dropdown-menu dropdown-menu-end dropdown-menu-modern p-3"
                aria-labelledby="deudoresDropdown"
              >

                <div className="d-grid gap-2" style={{ minWidth: 320 }}>
                  <NavLink to="/carga-datos/upload" className="modern-item d-flex align-items-start gap-3 text-decoration-none">
                    <span className="modern-icon" aria-hidden="true">
                      {/* Subir / Upload (SVG inline) */}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <div className="flex-grow-1">
                      <div className="modern-title">Cargar Excel</div>
                      <small className="text-secondary">Subí un excel para actualizar los registros</small>
                    </div>
                  </NavLink>

                  <NavLink to="/datos/mostrar" className="modern-item d-flex align-items-start gap-3 text-decoration-none">
                    <span className="modern-icon" aria-hidden="true">
                      {/* Buscar / Search */}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <div className="flex-grow-1">
                      <div className="modern-title">Listar por DNI</div>
                      <small className="text-secondary">Consultá y editá estados individuales</small>
                    </div>
                  </NavLink>

                  <NavLink to="/carga-datos/upload" className="modern-item d-flex align-items-start gap-3 text-decoration-none">
                    <span className="modern-icon" aria-hidden="true">
                      {/* Herramientas / Tools */}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M14 7l3 3-8 8H6v-3l8-8Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M13 6l1-1a2.828 2.828 0 1 1 4 4l-1 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <div className="flex-grow-1">
                      <div className="modern-title">Modificar Masivo</div>
                      <small className="text-secondary">Ajuste masivo de columnas desde un excel</small>
                    </div>
                  </NavLink>
                </div>
              </div>
            </li>

                  <li className="nav-item">
                    <NavLink to="/profile" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
                      Perfil
                    </NavLink>
                  </li>

                  <li className="nav-item ms-lg-2">
                    <button className="btn btn-outline-danger btn-sm" onClick={handleLogout}>
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

                  {/* Botón BIA apenas más grande */}
                  <li className="nav-item ms-lg-2">
                    <button
                      className="btn btn-bia btn-nav-compact-s"
                      onClick={() => guardTo("/carga-datos/upload")}
                    >
                      Portal BIA
                    </button>
                  </li>
                  {/* “Gestión de Entidades” no se muestra sin sesión */}
                </>
              )}
            </ul>
          </div>
        </div>
      </div>
    </nav>
  );
}
