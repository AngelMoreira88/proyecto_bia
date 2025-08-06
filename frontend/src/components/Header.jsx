// src/components/Header.jsx
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isLoggedIn, logout } from '../services/auth';

export default function Header() {
  const [logged, setLogged] = useState(isLoggedIn());
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    setLogged(false);
    navigate('/');
  };

  const handlePanelInternoClick = () => {
    if (isLoggedIn()) {
      navigate('/carga-datos/upload');
    } else {
      localStorage.setItem('redirectAfterLogin', '/carga-datos/upload');
      navigate('/login');
    }
  };

  // Sincroniza login si cambia en otra pestaña o tras dispatchEvent('storage')
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
        style={{ height: '100%', paddingLeft: '24px', paddingRight: '24px' }}
      >
        {/* Logo */}
        <Link to="/">
          <img
            src="https://img1.wsimg.com/isteam/ip/11dbfe7c-906d-4e0a-a18f-617be49fc6cd/LOGO%20BIA-00d8200.png/:/rs=w:300,h:150,cg:true,m/cr=w:300,h:150/qt=q:95"
            alt="Logo Grupo BIA"
            style={{ height: '58px', objectFit: 'contain' }}
          />
        </Link>

        {/* Navegación */}
        <nav className="d-none d-md-flex align-items-center gap-4">
          {logged ? (
            <>
              <Link className="text-decoration-none text-dark" to="/">
                Home
              </Link>

              <Link className="text-decoration-none text-dark" to="/certificado">
                Generar Certificado
              </Link>

              {/* Dropdown Datos */}
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
                    <Link className="dropdown-item" to="/mostrar-datos">
                      Modificar
                    </Link>
                  </li>
                  <li>
                    <Link className="dropdown-item" to="/carga-datos/upload">
                      Cargar Excel
                    </Link>
                  </li>
                </ul>
              </div>

              <Link className="text-decoration-none text-dark" to="/profile">
                Perfil
              </Link>

              <button
                className="btn btn-outline-danger btn-sm"
                onClick={handleLogout}
              >
                Salir
              </button>
            </>
          ) : (
            <>
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
