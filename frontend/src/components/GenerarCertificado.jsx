// frontend/src/components/GenerarCertificado.jsx
import React, { useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import bienvenidaImg from "../images/ImagenBienvenida.jpg";
import Header from './Header';

export default function GenerarCertificado() {
  const [dni, setDni] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData();
    formData.append("dni", dni);

    try {
      const res = await axios.post("/api/certificado/generar/", formData, {
        responseType: "blob",
      });

      const pdfBlob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(pdfBlob);
      window.open(url);
    } catch (err) {
      if (err.response && err.response.data) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          setError(json.error || json.detail || "Error inesperado");
        } catch {
          setError("Error inesperado");
        }
      } else {
        setError("No se pudo conectar con el servidor.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header />
      <div className="container py-5">
        <div className="row align-items-center">
          {/* Columna del formulario */}
          <div className="col-md-6 mb-4">
            <h2 className="mb-4 text-primary fw-bold">Generar Certificado Libre de Deuda</h2>
            <p className="mb-4 text-muted">
              Ingresá tu DNI.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label htmlFor="dni" className="form-label">
                  DNI
                </label>
                <input
                  type="text"
                  id="dni"
                  className="form-control"
                  value={dni}
                  onChange={(e) => setDni(e.target.value)}
                  required
                />
              </div>

              <div className="d-flex gap-2 mt-3">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? "Generando..." : "Generar"}
                </button>

                <Link to="/" className="btn btn-secondary">
                  Volver atrás
                </Link>
              </div>

              {error && (
                <div className="alert alert-danger mt-3" role="alert">
                  {error}
                </div>
              )}
            </form>
          </div>

          {/* Columna de imagen */}
          <div className="col-md-6 text-center">
            <img
              src={bienvenidaImg}
              alt="Certificado"
              className="img-fluid rounded shadow"
              style={{ maxHeight: "400px", objectFit: "cover" }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
