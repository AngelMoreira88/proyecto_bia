// frontend/src/components/HomePortalBia.jsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Header from './Header';
import { isLoggedIn } from '../services/auth';
import EntidadDashboard from './EntidadDashboard/EntidadDashboard';

export default function HomePortalBia() {
  const [showEntidades, setShowEntidades] = useState(false);
  const logged = isLoggedIn();

  return (
    <>
      <Header />

      {/* Contenido principal */}
      <div
        className="container-fluid p-0"
        style={{
          marginTop: '100px', // separa del header fijo
        }}
      >
        {/* Sección de bienvenida (hero) */}
        <div className="row m-0" style={{ minHeight: '60vh' }}>
          {/* Columna de texto centrado */}
          <div className="col-md-6 d-flex justify-content-center align-items-center">
            <div className="text-center px-4" style={{ maxWidth: '520px' }}>
              <h2 className="text-primary fw-bold mb-3">
                Bienvenido al Portal de Grupo BIA
              </h2>
              <p className="text-muted mb-4">
                Desde aquí podés acceder a todas las funcionalidades internas.
              </p>

              {logged ? (
                <div className="d-flex flex-wrap gap-2 justify-content-center">
                  {/* Toggle del panel de Entidades */}
                  <button
                    className="btn btn-outline-primary"
                    onClick={() => setShowEntidades((v) => !v)}
                    aria-expanded={showEntidades}
                    aria-controls="panel-entidades"
                  >
                    {showEntidades ? 'Ocultar Entidades' : 'Gestionar Entidades'}
                  </button>

                  {/* Otras acciones internas */}
                  <Link to="/carga-datos/upload" className="btn btn-primary">
                    Cargar Excel
                  </Link>
                  <Link to="/datos/mostrar" className="btn btn-outline-secondary">
                    Mostrar Datos
                  </Link>
                  <Link to="/certificado" className="btn btn-outline-secondary">
                    Generar Certificado
                  </Link>
                </div>
              ) : (
                <Link to="/login" className="btn btn-primary px-4">
                  Iniciar sesión
                </Link>
              )}
            </div>
          </div>

          {/* Columna de imagen */}
          <div className="col-md-6 p-0">
            <img
              src="/images/PuertoMadero.png"
              alt="Bienvenida Portal"
              className="img-fluid"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                minHeight: '320px',
              }}
            />
          </div>
        </div>

        {/* Panel de Entidades (solo si está logeado y activado el toggle) */}
        {logged && showEntidades && (
          <section id="panel-entidades" className="container my-4">
            <div className="card shadow-sm">
              <div className="card-header d-flex justify-content-between align-items-center">
                <h5 className="m-0">Gestión de Entidades</h5>
                <button
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setShowEntidades(false)}
                >
                  Cerrar
                </button>
              </div>
              <div className="card-body">
                <EntidadDashboard />
              </div>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
