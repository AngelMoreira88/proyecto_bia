// frontend/src/components/HomePortalBia.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import Header from './Header';
import { isLoggedIn } from '../services/auth';

export default function HomePortalBia() {
  const logged = isLoggedIn();

  return (
    <>
      <Header />

      {/* Igual que Home: alto fijo y sin gutter para que la imagen no “corte” */}
      <div
        className="container-fluid p-0"
        style={{ marginTop: '100px', height: 'calc(100vh - 100px)', overflow: 'hidden' }}
      >
        <div className="row h-100 g-0 m-0">
          {/* Columna izquierda (hero/card) */}
          <div className="col-md-6 d-flex align-items-center justify-content-center p-4">
            <div className="card border-0 shadow-sm rounded-4 w-100" style={{ maxWidth: 560 }}>
              <div className="card-body p-4 p-md-5">
                <div className="text-center mb-3">
                  <img src="/images/LogoBIA.png" alt="Grupo BIA" height="40" className="mb-2" />
                  <h2 className="fw-bold text-bia mb-1">Portal de Grupo BIA</h2>
                  <small className="text-secondary">
                    Accedé a las funcionalidades internas y herramientas de gestión
                  </small>
                </div>

                <hr className="mt-3 mb-4" />
                <p className="text-muted text-center mb-4">Elegí una acción para comenzar:</p>

                {logged ? (
                  <div className="d-grid gap-2 gap-md-3">
                    <div className="d-flex flex-wrap justify-content-center gap-2 gap-md-3">
                      {/* 👉 ahora es un Link a la nueva página */}
                      <Link to="/entidades" className="btn btn-outline-bia px-4">
                        Gestionar Entidades
                      </Link>
                      <Link to="/carga-datos/upload" className="btn btn-bia px-4">
                        Cargar Excel
                      </Link>
                    </div>
                    <div className="d-flex flex-wrap justify-content-center gap-2 gap-md-3">
                      <Link to="/datos/mostrar" className="btn btn-outline-bia px-4">
                        Mostrar Datos
                      </Link>
                      <Link to="/certificado" className="btn btn-bia px-4">
                        Generar Certificado
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="d-grid">
                    <Link to="/login" className="btn btn-bia btn-lg">Iniciar sesión</Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Columna derecha FULL-BLEED con imagen de fondo */}
          <div className="col-md-6 d-none d-md-block">
            <div
              className="w-100 h-100"
              style={{
                backgroundImage: 'url(/images/PuertoMadero.png)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
