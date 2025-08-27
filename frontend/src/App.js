// src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import Header             from './components/Header';           
import Footer             from './components/Footer';   // 👈 nuevo
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
import Entidades from "./components/Entidades";

import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/theme-bia.css';

export default function App() {
  return (
    <BrowserRouter>
      <div className="d-flex flex-column min-vh-100">
        {/* Header fijo arriba */}
        <Header />

        {/* Contenido de rutas */}
        <div className="flex-grow-1">
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

        {/* Footer fijo abajo */}
        <Footer />
      </div>
    </BrowserRouter>
  );
}
