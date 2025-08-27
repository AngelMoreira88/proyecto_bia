// src/App.jsx
import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import Header             from './components/Header';
import Footer             from './components/Footer';
import Home               from './components/Home';
import HomePortalBia      from './components/HomePortalBIA';
import Login              from './components/Login';
import Logout             from './components/Logout';
import GenerarCertificado from './components/GenerarCertificado';
import ConfirmarCarga     from './components/ConfirmarCarga';
import ErroresValidacion  from './components/ErroresValidacion';
import UploadForm         from './components/UploadForm';
import PrivateRoute       from './components/PrivateRoute';
import MostrarDatos       from './components/MostrarDatos';
import Entidades          from './components/Entidades';
import Perfil             from './components/Perfil';

import { isLoggedIn } from './services/auth';

import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/theme-bia.css';

export default function App() {
  const [logged, setLogged] = useState(isLoggedIn());

  useEffect(() => {
    const sync = () => setLogged(isLoggedIn());
    window.addEventListener('storage',      sync);
    window.addEventListener('auth-changed', sync);
    return () => {
      window.removeEventListener('storage',      sync);
      window.removeEventListener('auth-changed', sync);
    };
  }, []);

  return (
    <BrowserRouter>
      {/* app-shell aplica el padding-top global según la altura del header */}
      <div className="d-flex flex-column min-vh-100 app-shell">
        <Header />

        {/* Fondo gris claro solo cuando hay login */}
        <div className={`flex-grow-1 ${logged ? 'bg-app' : ''}`}>
          <Routes>
            <Route path="/" element={<Home />} />

            <Route
              path="/portal"
              element={
                <PrivateRoute>
                  <HomePortalBia />
                </PrivateRoute>
              }
            />

            <Route
              path="/perfil"
              element={
                <PrivateRoute>
                  <Perfil />
                </PrivateRoute>
              }
            />

            <Route path="/login"  element={<Login />} />
            <Route path="/logout" element={<Logout />} />
            <Route path="/certificado" element={<GenerarCertificado />} />

            <Route
              path="/carga-datos/upload"
              element={
                <PrivateRoute>
                  <UploadForm />
                </PrivateRoute>
              }
            />
            <Route
              path="/carga-datos/confirmar"
              element={
                <PrivateRoute>
                  <ConfirmarCarga />
                </PrivateRoute>
              }
            />
            <Route
              path="/carga-datos/errores"
              element={
                <PrivateRoute>
                  <ErroresValidacion />
                </PrivateRoute>
              }
            />
            <Route
              path="/datos/mostrar"
              element={
                <PrivateRoute>
                  <MostrarDatos />
                </PrivateRoute>
              }
            />
            <Route
              path="/entidades"
              element={
                <PrivateRoute>
                  <Entidades />
                </PrivateRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>

        {/* El footer solo para no logueados */}
        {!logged && <Footer />}
      </div>
    </BrowserRouter>
  );
}
