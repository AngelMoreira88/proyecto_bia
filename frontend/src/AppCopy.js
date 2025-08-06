// frontend/src/App.js
import React from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';

import Home               from './components/Home';
import Login              from './components/Login';
import Logout             from './components/Logout';
import GenerarCertificado from './components/GenerarCertificado';
import ConfirmarCarga     from './components/ConfirmarCarga';
import ErroresValidacion  from './components/ErroresValidacion';
import UploadForm         from './components/UploadForm';
import Header from './components/Header';
import 'bootstrap/dist/css/bootstrap.min.css';

import { isLoggedIn }     from './services/auth';

// Wrapper para rutas privadas
function PrivateRoute({ children }) {
  return isLoggedIn() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>


      <Routes>
        {/* Rutas públicas */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/logout" element={<Logout />} />
        <Route path="/certificado" element={<GenerarCertificado />} />

        {/* Rutas de carga de datos (privadas) */}
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

        {/* Cualquier otra ruta redirige a Home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
