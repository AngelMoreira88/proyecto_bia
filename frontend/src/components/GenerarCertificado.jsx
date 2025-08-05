
// frontend/src/components/GenerarCertificado.jsx
import { useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import bienvenidaImg from "../images/ImagenBienvenida.jpg";
import Header from "./Header";

export default function GenerarCertificado() {
  const [dni, setDni] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");  // aquí guardamos el mensaje

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setPendientes([]);
    setCertificados([]);

    const formData = new FormData();
    formData.append("dni", dni);

    try {
      const res = await axios.post("/api/certificado/generar/", formData, {
        responseType: "blob",
      });

      // Si vino PDF, lo abrimos:
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
      <div className="container-fluid" style={{ height: "calc(100vh - 88px)" }}>
        <div className="row h-100">
          {/* Columna izquierda centrada */}
          <div className="col-md-6 d-flex justify-content-center align-items-center">
            <div className="w-100 text-center px-4 px-md-5">
              <h2 className="text-primary fw-bold mb-3">
                Generar Certificado Libre de Deuda
              </h2>
              <p className="text-muted mb-4">Ingresá tu DNI.</p>

              <form
                onSubmit={handleSubmit}
                className="mx-auto"
                style={{ maxWidth: "400px" }}
              >
                <div className="mb-3 text-start">
                  <label htmlFor="dni" className="form-label">
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

                <div className="d-flex justify-content-center gap-2 mt-3">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading}
                  >
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
          </div>

          {/* Columna derecha imagen */}
          <div className="col-md-6 d-none d-md-block p-0">
            <img
              src={bienvenidaImg}
              alt="Certificado"
              className="img-fluid w-100 h-100"
              style={{ objectFit: "cover" }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
