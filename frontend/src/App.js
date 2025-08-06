import React from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';

import Home               from './components/Home';
import HomePortalBia      from './components/HomePortalBIA';  // <-- nuevo import
import Login              from './components/Login';
import Logout             from './components/Logout';
import GenerarCertificado from './components/GenerarCertificado';
import ConfirmarCarga     from './components/ConfirmarCarga';
import ErroresValidacion  from './components/ErroresValidacion';
import UploadForm         from './components/UploadForm';
import PrivateRoute       from './components/PrivateRoute';
import MostrarDatos       from './components/MostrarDatos';

import 'bootstrap/dist/css/bootstrap.min.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Página pública “Home normal” */}
        <Route path="/" element={<Home />} />

        {/* La que verá el usuario después del login */}
        <Route
          path="/portal"
          element={
            <PrivateRoute>
              <HomePortalBia />
            </PrivateRoute>
          }
        />

        {/* Auth */}
        <Route path="/login"  element={<Login />} />
        <Route path="/logout" element={<Logout />} />

        {/* Certificado */}
        <Route path="/certificado" element={<GenerarCertificado />} />

        {/* Carga de datos (privadas) */}
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

        {/* MostrarDatos */}
        <Route
          path="/datos/mostrar"
          element={
            <PrivateRoute>
              <MostrarDatos />
            </PrivateRoute>
          }
        />

        {/* Cualquier otra ruta redirige a la Home pública */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
