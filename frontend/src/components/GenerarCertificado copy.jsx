// frontend/src/components/GenerarCertificado.jsx
import { useState } from "react";
import axios from "axios";

export default function GenerarCertificado() {
  const [dni, setDni] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");  // aquí guardamos el mensaje

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData();
    formData.append("dni", dni);

    try {
      const res = await axios.post(
        "/api/certificado/generar/",
        formData,
        { responseType: "blob" }
      );

      // Si vino PDF, lo abrimos:
      const pdfBlob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(pdfBlob);
      window.open(url);

    } catch (err) {
      // Tratamos la respuesta de error JSON
      if (err.response && err.response.data) {
        try {
          // axios con responseType blob nos da un blob, lo convertimos a texto
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
    <div style={{ maxWidth: 400, margin: "0 auto" }}>
      <h2>Generar Certificado Libre de Deuda</h2>
      <form onSubmit={handleSubmit}>
        <label>
          DNI:
          <input
            type="text"
            value={dni}
            onChange={(e) => setDni(e.target.value)}
            required
            style={{ display: "block", width: "100%", marginTop: 4 }}
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: 8, padding: "8px 16px" }}
        >
          {loading ? "Generando..." : "Generar"}
        </button>
      </form>

      {/* aquí mostramos el mensaje de error en rojo */}
      {error && (
        <p style={{ color: "red", marginTop: "1em" }}>
          {error}
        </p>
      )}
    </div>
  );
}

