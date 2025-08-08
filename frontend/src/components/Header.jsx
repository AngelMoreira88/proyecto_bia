// src/components/Header.jsx
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isLoggedIn, logout } from '../services/auth';

export default function Header() {
  const [logged, setLogged] = useState(isLoggedIn());
  const navigate = useNavigate();

  // Cierra sesión y vuelve al home público
  const handleLogout = () => {
    logout();
    setLogged(false);
    navigate('/');
  };

  // Al hacer click en “Panel Interno” si no está logueado
  const handlePanelInternoClick = () => {
    if (isLoggedIn()) {
      navigate('/carga-datos/upload');
    } else {
      localStorage.setItem('redirectAfterLogin', '/carga-datos/upload');
      navigate('/login');
    }
  };

  // Escucha cambios de login desde otras pestañas o tras dispatchEvent('storage')
  useEffect(() => {
    const checkLogin = () => setLogged(isLoggedIn());
    window.addEventListener('storage', checkLogin);
    return () => window.removeEventListener('storage', checkLogin);
  }, []);

  return (
    <header
      style={{
        height: '100px',
        backdropFilter: 'blur(8px)',
        background: 'rgba(255, 255, 255, 0.85)',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        zIndex: 1030,
      }}
    >
      <div
        className="d-flex justify-content-between align-items-center"
        style={{ height: '100%', padding: '0 24px' }}
      >
        {/* Logo */}
        <Link to={logged ? '/portal' : '/'}>
          <img
            src="/images/LogoBIA2.png"
            alt="Logo BIA"
            style={{ height: '58px', objectFit: 'contain' }}
          />
        </Link>

        {/* Navegación principal */}
        <nav className="d-none d-md-flex align-items-center gap-4">
          {logged ? (
            <>
              {/* Home portal */}
              <Link className="text-decoration-none text-dark" to="/portal">
                Home
              </Link>

              {/* Generar certificado */}
              <Link className="text-decoration-none text-dark" to="/certificado">
                Generar Certificado
              </Link>

              {/* Dropdown “Datos” */}
              <div className="dropdown">
                <button
                  className="btn btn-link text-dark dropdown-toggle p-0"
                  type="button"
                  id="datosDropdown"
                  data-bs-toggle="dropdown"
                  aria-expanded="false"
                >
                  Datos
                </button>
                <ul className="dropdown-menu" aria-labelledby="datosDropdown">
                  <li>
                    <Link className="dropdown-item" to="/datos/mostrar">
                      Mostrar
                    </Link>
                  </li>
                  <li>
                    <Link className="dropdown-item" to="/carga-datos/upload">
                      Cargar Excel
                    </Link>
                  </li>
                </ul>
              </div>

              {/* Perfil */}
              <Link className="text-decoration-none text-dark" to="/profile">
                Perfil
              </Link>

              {/* Salir */}
              <button
                className="btn btn-outline-danger btn-sm"
                onClick={handleLogout}
              >
                Salir
              </button>
            </>
          ) : (
            <>
              {/* Invitado: solo Certificado y Panel Interno */}
              <Link className="text-decoration-none text-dark" to="/certificado">
                Generar Certificado
              </Link>
              <span
                className="text-decoration-none text-dark"
                role="button"
                style={{ cursor: 'pointer' }}
                onClick={handlePanelInternoClick}
              >
                Panel Interno
              </span>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
