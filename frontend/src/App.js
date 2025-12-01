// src/App.jsx
import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import Header             from './components/Header';
import Footer             from './components/Footer';
import Home               from './components/Home';
import HomePortalBIA      from './components/HomePortalBIA';
import Login              from './components/Login';
import Logout             from './components/Logout';
import GenerarCertificado from './components/GenerarCertificado';
import ConfirmarCarga     from './components/ConfirmarCarga';
import ErroresValidacion  from './components/ErroresValidacion';
import UploadForm         from './components/UploadForm';
import PrivateRoute       from './components/PrivateRoute';
import MostrarDatos       from './components/MostrarDatos';
import Perfil             from './components/Perfil';

// ✅ Import correcto: dashboard (form + listado)
import EntidadDashboard   from './components/EntidadDashboard/EntidadDashboard';

// Modificación masiva
import ModificarMasivo    from './components/ModificarMasivo';

// 🔹 Nuevo: Centro de Descargas
import Descargas          from './components/Descargas';

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
      <div className="d-flex flex-column min-vh-100 app-shell">
        <Header />
        <div className={`flex-grow-1 ${logged ? 'bg-app' : ''}`}>
          <Routes>
            <Route path="/" element={<Home />} />

            <Route
              path="/portal"
              element={
                <PrivateRoute>
                  <HomePortalBIA />
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

            {/* Carga de datos (altas) */}
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

            {/* Mostrar datos */}
            <Route
              path="/datos/mostrar"
              element={
                <PrivateRoute>
                  <MostrarDatos />
                </PrivateRoute>
              }
            />

            {/* ✅ Entidades → apunta al dashboard correcto */}
            <Route
              path="/entidades"
              element={
                <PrivateRoute>
                  <EntidadDashboard />
                </PrivateRoute>
              }
            />

            {/* Modificación masiva */}
            <Route
              path="/modificar-masivo"
              element={
                <PrivateRoute>
                  <ModificarMasivo />
                </PrivateRoute>
              }
            />

            {/* 🔹 Nuevo: Centro de Descargas */}
            <Route
              path="/descargas"
              element={
                <PrivateRoute>
                  <Descargas />
                </PrivateRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        {!logged && <Footer />}
      </div>
    </BrowserRouter>
  );
}
