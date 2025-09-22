// frontend/src/components/Home.jsx
import React from "react";
import { Link } from "react-router-dom";

export default function Home() {
  return (
    // Flex en el wrapper para centrar verticalmente (respeta .app-shell)
    <div className="page-fill position-relative overflow-hidden d-flex align-items-center">
      {/* Fondo full-bleed */}
      <div className="pm-hero-bg" aria-hidden="true" />
      <div className="pm-hero-vignette" aria-hidden="true" />

      {/* Contenido superpuesto */}
      <div className="container position-relative" style={{ zIndex: 2 }}>
        <div className="row justify-content-center">
          <div className="col-12 col-md-10 col-lg-8 col-xl-6">
            {/* Versión más transparente + blur más fuerte */}
            <div className="glass-card glass-card--lite rounded-4 shadow-lg p-4 p-md-5 text-center mx-auto">
              <h2 className="fw-bold mb-2">Bienvenido al sistema de Grupo BIA</h2>
              <p className="text-secondary mb-4">
                Consultá el estado actual de tu deuda de manera rápida y segura.
              </p>

              <div className="d-flex justify-content-center gap-2 flex-wrap">
                <Link to="/certificado" className="btn btn-bia">
                  Portal de Consultas y Descargas
                </Link>
                <Link to="/login" className="btn btn-outline-bia">
                  Iniciar sesión
                </Link>
              </div>

              <div className="mt-4 small text-secondary">
                ¿Sos parte del equipo? Ingresá al{" "}
                <Link to="/portal" className="link-bia">Portal</Link>.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
