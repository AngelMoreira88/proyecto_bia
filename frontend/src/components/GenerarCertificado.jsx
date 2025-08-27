// frontend/src/components/GenerarCertificado.jsx
import { useState } from "react";
import { Link } from "react-router-dom";
import Header from "./Header";
import api from "../services/api";

const ENDPOINTS = [
  "/api/certificado/generar/",
  "/api/certificado/generar-certificado/",
  "/api/generar-certificado/",
];

export default function GenerarCertificado() {
  const [dni, setDni] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [deudas, setDeudas] = useState([]);
  const [varios, setVarios] = useState([]);

  const postConFallback = async (payload) => {
    let lastErr = null;
    for (const url of ENDPOINTS) {
      try {
        const res = await api.post(url, payload, { responseType: "blob" });
        return res;
      } catch (err) {
        lastErr = err;
        if (err?.response?.status !== 404) throw err;
      }
    }
    throw lastErr;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg(null);
    setDeudas([]);
    setVarios([]);

    const dniTrim = (dni || "").replace(/\D/g, "").trim();
    if (!dniTrim) {
      setMsg({ type: "warning", text: "Ingresá un DNI válido (solo números)." });
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("dni", dniTrim);

      const res = await postConFallback(formData);
      const ct = (res.headers?.["content-type"] || "").toLowerCase();

      if (ct.includes("application/pdf")) {
        const pdfBlob = new Blob([res.data], { type: "application/pdf" });
        const url = window.URL.createObjectURL(pdfBlob);
        window.open(url, "_blank", "noopener");
        setMsg({
          type: "success",
          text:
            "El certificado se abrió en una nueva pestaña. Si no lo ves, revisá el bloqueador de ventanas emergentes.",
        });
        setTimeout(() => window.URL.revokeObjectURL(url), 60000);
        return;
      }

      if (ct.includes("application/json")) {
        const text = await res.data.text();
        const payload = JSON.parse(text);

        if (payload.error) {
          setMsg({ type: "danger", text: payload.error });
          return;
        }

        switch (payload.estado) {
          case "sin_canceladas":
            setMsg({
              type: "info",
              text:
                "No se registran deudas canceladas asociadas al DNI indicado. No es posible emitir certificados.",
            });
            setDeudas(Array.isArray(payload.deudas) ? payload.deudas : []);
            break;
          case "pendiente":
            setMsg({
              type: "warning",
              text: "Existen deudas pendientes. No se puede emitir el/los certificado(s).",
            });
            setDeudas(Array.isArray(payload.deudas) ? payload.deudas : []);
            break;
          case "parcial":
            setMsg({
              type: "info",
              text:
                payload.mensaje ||
                "Se emitieron certificados para entidades sin deuda. Aún registrás deudas en otras entidades.",
            });
            setVarios(Array.isArray(payload.certificados) ? payload.certificados : []);
            setDeudas(Array.isArray(payload.deudas) ? payload.deudas : []);
            break;
          case "varios_cancelados":
            setMsg({
              type: "info",
              text:
                payload.mensaje ||
                "Tenés varias entidades sin deuda. Podés descargar cada certificado.",
            });
            setVarios(Array.isArray(payload.certificados) ? payload.certificados : []);
            break;
          default:
            setMsg({ type: "info", text: payload.mensaje || "Respuesta recibida." });
            break;
        }
        return;
      }

      setMsg({ type: "danger", text: "Respuesta desconocida del servidor." });
    } catch (err) {
      try {
        const data = err?.response?.data;
        if (data && data instanceof Blob) {
          const text = await data.text();
          try {
            const json = JSON.parse(text);
            setMsg({
              type: "danger",
              text: json.error || json.detail || "No se pudo procesar la solicitud.",
            });
          } catch {
            setMsg({ type: "danger", text: text || "No se pudo procesar la solicitud." });
          }
        } else if (err?.response?.status === 404) {
          setMsg({
            type: "danger",
            text:
              "Endpoint no encontrado. Verificá que exista /api/certificado/generar/ (o activá los aliases de compat).",
          });
        } else {
          setMsg({
            type: "danger",
            text: "No se pudo generar el certificado. Verificá el DNI e intentá nuevamente.",
          });
        }
      } catch {
        setMsg({ type: "danger", text: "No se pudo conectar con el servidor." });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header />
      <div
        className="container d-flex justify-content-center align-items-center"
        style={{ marginTop: "88px", minHeight: "calc(100vh - 88px)" }}
      >
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
            <div className="mb-2 text-start">
              <label htmlFor="dni" className="form-label visually-hidden">
                DNI
              </label>
              <input
                type="text"
                id="dni"
                className="form-control"
                value={dni}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  setDni(val);
                  if (msg) setMsg(null);
                  setDeudas([]);
                  setVarios([]);
                }}
                inputMode="numeric"
                autoComplete="off"
                placeholder="DNI (solo números)"
                required
              />
            </div>

            {msg && (
              <div className={`alert alert-${msg.type} mt-2 mb-0`} role="alert">
                {msg.text}
              </div>
            )}

            <div className="d-flex justify-content-center gap-2 mt-3">
              <button type="submit" className="btn btn-bia" disabled={loading}>
                {loading ? "Consultando..." : "Consultar / Generar"}
              </button>

              <Link to="/" className="btn btn-outline-bia">
                Volver al Menú
              </Link>
            </div>
          </form>

          {deudas.length > 0 && (
            <div className="table-responsive mt-3">
              <table className="table table-sm align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>ID pago único</th>
                    <th>Propietario</th>
                    <th>Entidad interna</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {deudas.map((d, i) => (
                    <tr key={`${d.id_pago_unico}-${i}`}>
                      <td>{d.id_pago_unico}</td>
                      <td>{d.propietario}</td>
                      <td>{d.entidadinterna}</td>
                      <td>{d.estado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {varios.length > 0 && (
            <div className="table-responsive mt-3">
              <table className="table table-sm align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>ID pago único</th>
                    <th>Propietario</th>
                    <th>Entidad interna</th>
                    <th>Descarga</th>
                  </tr>
                </thead>
                <tbody>
                  {varios.map((c, i) => (
                    <tr key={`${c.id_pago_unico}-${i}`}>
                      <td>{c.id_pago_unico}</td>
                      <td>{c.propietario}</td>
                      <td>{c.entidadinterna}</td>
                      <td>
                        <a
                          className="btn btn-sm btn-outline-primary"
                          href={c.url_pdf}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Certificado LDD
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
