import { useState } from "react";
import axios from "axios";

export default function GenerarCertificado() {
  const [dni, setDni] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendientes, setPendientes] = useState([]);
  const [certificados, setCertificados] = useState([]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setPendientes([]);
    setCertificados([]);

    const formData = new FormData();
    formData.append("dni", dni);

    try {
      const res = await axios.post(
        "/api/certificado/generar/",
        formData,
        { responseType: "blob" }
      );

      const contentType = res.headers["content-type"];

      if (contentType && contentType.includes("application/json")) {
        // Respuesta JSON (deudas pendientes o múltiples certificados)
        const text = await res.data.text();
        const json = JSON.parse(text);

        if (json.estado === "pendiente") {
          setPendientes(json.deudas);
          setError("Existen deudas pendientes.");
        } else if (json.estado === "varios_cancelados") {
          setCertificados(json.certificados);
          setError("Tiene varias deudas canceladas. Puede elegir cuál certificado descargar.");
        } else {
          setError(json.error || json.detail || "Respuesta inesperada.");
        }

        return;
      }

      // Respuesta PDF (solo una deuda cancelada)
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
    <div style={{ maxWidth: 500, margin: "0 auto", padding: "1rem" }}>
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
          {loading ? "Consultando..." : "Generar"}
        </button>
      </form>

      {/* Mensaje de error o información */}
      {error && (
        <p style={{ color: "red", marginTop: "1em" }}>
          {error}
        </p>
      )}

      {/* Mostrar deudas pendientes si hay */}
      {pendientes.length > 0 && (
        <div style={{ marginTop: "1em" }}>
          <h4>Deudas pendientes:</h4>
          <ul>
            {pendientes.map((deuda, idx) => (
              <li key={idx}>
                {deuda.entidadinterna} (ID: {deuda.id_pago_unico}) - Estado: {deuda.estado}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Mostrar certificados disponibles si hay */}
      {certificados.length > 0 && (
        <div style={{ marginTop: "1em" }}>
          <h4>Certificados disponibles:</h4>
          <ul>
            {certificados.map((cert, idx) => (
              <li key={idx}>
                {cert.entidadinterna} (ID: {cert.id_pago_unico}) -{" "}
                <a
                  href={cert.url_pdf}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#007bff", textDecoration: "underline" }}
                >
                  Descargar PDF
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
