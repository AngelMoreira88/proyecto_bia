// frontend/src/components/GenerarCertificado.jsx
import { useState } from "react";
import { Link } from "react-router-dom";
import Header from "./Header";
import api from "../services/api";

export default function GenerarCertificado() {
  const [dni, setDni] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const dniTrim = (dni || "").trim();
    if (!dniTrim) {
      setError("Ingresá un DNI válido.");
      setLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append("dni", dniTrim);

    try {
      const res = await api.post("/api/generar/", formData, {
        responseType: "blob",
      });

      const dispo = res.headers?.["content-disposition"] || "";
      const matchName = dispo.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
      const filename = matchName ? decodeURIComponent(matchName[1]) : "certificado.pdf";

      const pdfBlob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(pdfBlob);

      // Abrir en nueva pestaña
      window.open(url);

      // (Opcional) descarga automática
      // const a = document.createElement("a");
      // a.href = url;
      // a.download = filename;
      // document.body.appendChild(a);
      // a.click();
      // a.remove();

      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (err) {
      try {
        const data = err?.response?.data;
        if (data && data instanceof Blob) {
          const text = await data.text();
          try {
            const json = JSON.parse(text);
            setError(json.error || json.detail || "Error inesperado al generar el certificado.");
          } catch {
            setError(text || "Error inesperado al generar el certificado.");
          }
        } else if (err?.response?.data?.detail) {
          setError(err.response.data.detail);
        } else if (err?.response?.status === 404) {
          setError("Endpoint no encontrado. Verificá que la ruta sea /api/generar/ en el backend.");
        } else {
          setError("No se pudo generar el certificado. Verificá el DNI e intentá nuevamente.");
        }
      } catch {
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
          {/* Columna izquierda con formulario */}
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
                  <label htmlFor="dni" className="form-label"></label>
                  <input
                    type="text"
                    id="dni"
                    className="form-control"
                    value={dni}
                    onChange={(e) => setDni(e.target.value)}
                    required
                    inputMode="numeric"
                    autoComplete="off"
                  />
                </div>

                <div className="d-flex justify-content-center gap-2 mt-3">
                  <button type="submit" className="btn btn-bia" disabled={loading}>
                    {loading ? "Generando..." : "Generar"}
                  </button>

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
