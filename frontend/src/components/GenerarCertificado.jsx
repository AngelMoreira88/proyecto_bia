import { useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import Header from "./Header";

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
      <div
        className="container-fluid p-0"
        style={{ marginTop: "88px", height: "calc(100vh - 88px)", overflow: "hidden" }}
      >
        <div className="row h-100 m-0">
          {/* Columna izquierda con formulario dentro de un recuadro */}
          <div className="col-md-6 d-flex justify-content-center align-items-center">
            <div
              className="w-100 px-4 px-md-5 py-4 border rounded shadow-sm bg-white"
              style={{ maxWidth: "700px" }}
            >
              <h2
                className="text-bia fw-bold mb-3 text-center"
                style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              >
                Generar Certificado Libre de Deuda
              </h2>

              <p className="text-muted text-center mb-4">Ingresá tu DNI a continuación:</p>

              <form onSubmit={handleSubmit} className="mx-auto" style={{ maxWidth: "400px" }}>
                <div className="mb-3 text-start">
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
                  <button type="submit" className="btn btn-bia" disabled={loading}>
                    {loading ? "Generando..." : "Generar"}
                  </button>

                  {/* Si preferís que NO sea azul, dejá btn-secondary como estaba */}
                  <Link to="/" className="btn btn-outline-bia">
                    Volver al Menú
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
