// frontend/src/App.js
import React from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  Navigate,
  useLocation
} from 'react-router-dom';

import Home               from './components/Home';
import Login              from './components/Login';
import Logout             from './components/Logout';
import GenerarCertificado from './components/GenerarCertificado';
import TestPage           from './components/TestPage';
import CargaDatos         from './components/CargaDatos';
import ConfirmarCarga     from './components/ConfirmarCarga';
import ErroresValidacion  from './components/ErroresValidacion';
import UploadForm         from './components/UploadForm';
import { isLoggedIn }     from './services/auth';

// Wrapper para rutas privadas
function PrivateRoute({ children }) {
  return isLoggedIn() ? children : <Navigate to="/login" replace />;
}

// Barra de navegación
function NavBar() {
  const location = useLocation();
  return (
    <nav style={{ padding: '1rem', textAlign: 'center' }}>
      <Link to="/">Home</Link> |{' '}
      <Link to="/certificado">Generar Certificado</Link> |{' '}
      <Link to="/test-page">Test Page</Link> |{' '}
      <Link to="/carga-datos/upload">Panel interno</Link>
      {location.pathname.startsWith('/carga-datos') && (
        <> | <Link to="/logout">Cerrar Sesión</Link></>
      )}
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <NavBar />

      <Routes>
        {/* Rutas públicas */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/logout" element={<Logout />} />
        <Route path="/certificado" element={<GenerarCertificado />} />
        <Route path="/test-page" element={<TestPage />} />

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
