// src/components/Header.jsx
import React from 'react';
import { Link } from 'react-router-dom';

export default function Header() {
  return (
    <header
      className="bg-white shadow-sm"
      style={{ height: '123px' }}
    >
      <div
        className="d-flex justify-content-between align-items-center"
        style={{ height: '100%', paddingLeft: '40px', paddingRight: '24px' }}
      >
        {/* Logo a la izquierda */}
        <Link to="/">
          <img
            src="https://img1.wsimg.com/isteam/ip/11dbfe7c-906d-4e0a-a18f-617be49fc6cd/LOGO%20BIA-00d8200.png/:/rs=w:300,h:150,cg:true,m/cr=w:300,h:150/qt=q:95"
            alt="Logo Grupo BIA"
            style={{ height: '75px', objectFit: 'contain' }}
          />
        </Link>

        {/* Menú a la derecha */}
        <nav className="d-none d-md-flex gap-3">
          <Link className="text-decoration-none text-dark" to="/certificado">Certificado</Link>
          <Link className="text-decoration-none text-dark" to="/carga-datos/upload">Panel Interno</Link>
        </nav>
      </div>
    </header>

  );
}
