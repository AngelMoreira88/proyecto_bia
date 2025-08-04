import React from "react";
import { Link } from "react-router-dom";
import Header from "./Header";
import bienvenidaImg from "../images/ImagenBienvenida.jpg";

export default function Home() {
  return (
    <>
      <Header />
      <div className="container py-5">
        <div className="row align-items-center">
          <div className="col-md-6">
            <h2 className="mb-4">Bienvenido al sistema de Grupo BIA</h2>
            <p className="mb-4">Desde aquí podés generar tu certificado libre de deuda.</p>
            <Link to="/certificado" className="btn btn-primary">
              Generar certificado
            </Link>
          </div>
          <div className="col-md-6 d-none d-md-block">
            <img src={bienvenidaImg} alt="Bienvenida" className="img-fluid rounded shadow" />
          </div>
        </div>
      </div>
    </>
  );
}
