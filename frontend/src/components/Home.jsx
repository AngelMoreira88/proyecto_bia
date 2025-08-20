// frontend/src/components/Home.jsx
import React from "react";
import { Link } from "react-router-dom";
import Header from "./Header";

export default function Home() {
  return (
    <>
      <Header />

      <div
        className="container-fluid p-0"
        style={{ marginTop: "88px", height: "calc(100vh - 88px)", overflow: "hidden" }}
      >
        <div className="row h-100 m-0">
          {/* Columna izquierda centrada */}
          <div className="col-md-6 d-flex justify-content-center align-items-center">
            <div className="text-center px-4" style={{ maxWidth: 500, width: "100%" }}>
              {/* Antes: text-primary → ahora: text-bia */}
              <h2 className="text-bia fw-bold mb-3">
                Bienvenido al sistema de Grupo BIA
              </h2>

              <p className="text-muted mb-4">
                Desde aquí podés generar tu certificado libre de deuda de manera rápida y segura.
              </p>

              <div className="d-flex justify-content-center gap-2">
                {/* Botón corporativo sin afectar btn-primary global */}
                <Link to="/certificado" className="btn btn-bia">
                  Generar certificado
                </Link>

                {/* Ejemplos: otros colores de Bootstrap conviven normal */}
                {/* <button className="btn btn-success">Confirmar</button>
                <button className="btn btn-danger">Eliminar</button> */}
              </div>
            </div>
          </div>

          {/* Columna derecha con imagen */}
          <div className="col-md-6 p-0">
            <img
              src="/images/PuertoMadero.png"
              alt="Bienvenida"
              className="img-fluid"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
