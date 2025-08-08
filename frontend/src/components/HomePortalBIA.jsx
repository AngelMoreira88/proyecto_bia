// frontend/src/components/HomePortalBia.jsx
import React from 'react';
import { Link } from 'react-router-dom';
//import bienvenidaImg from '../images/ImagenBienvenida.jpg';
import Header from './Header';

export default function HomePortalBia() {
  return (
    <>
      <Header />

      {/* Empujamos todo hacia abajo 100px */}
      <div
        className="container-fluid p-0"
        style={{
          marginTop: '100px',
          height: 'calc(100vh - 100px)',
          overflow: 'hidden',
        }}
      >
        <div className="row h-100 m-0">
          {/* Columna de texto centrado */}
          <div className="col-md-6 d-flex justify-content-center align-items-center">
            <div className="text-center px-4" style={{ maxWidth: '500px' }}>
              <h2 className="text-primary fw-bold mb-3">
                Bienvenido al Portal de Grupo BIA
              </h2>
              <p className="text-muted mb-4">
                Desde aquí podés acceder a todas las funcionalidades internas.
              </p>
              <Link to="/carga-datos/upload" className="btn btn-primary px-4">
                Ir al Panel Interno
              </Link>
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
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}