// src/components/Entidades.jsx
import React from "react";
import Header from "./Header";
import EntidadDashboard from "./EntidadDashboard/EntidadDashboard";

export default function Entidades() {
  return (
    <>
      <Header />

      <div
        className="container-fluid p-0"
        style={{ marginTop: "100px", height: "calc(100vh - 100px)", overflow: "hidden" }}
      >
        <div className="row h-100 g-0 m-0">
          {/* Columna izquierda: contenido con scroll propio */}
          <div
            className="col-md-6 d-flex flex-column"
            style={{ overflowY: "auto" }}
          >
            {/* Encabezado de página (opcional) */}
            <div className="px-4 pt-4">
              <h2 className="text-bia fw-bold mb-1">Gestión de Entidades</h2>
              <small className="text-secondary">
                Registrá, editá y administrá las entidades para los certificados.
              </small>
              <hr className="mt-3 mb-0" />
            </div>

            {/* Dashboard (form + listado) */}
            <div className="px-2 px-md-4 pb-4">
              <EntidadDashboard />
            </div>
          </div>

          {/* Columna derecha: imagen full-bleed, fija al alto */}
          <div className="col-md-6 d-none d-md-block">
            <div
              className="w-100 h-100"
              style={{
                backgroundImage: "url(/images/PuertoMadero.png)",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
