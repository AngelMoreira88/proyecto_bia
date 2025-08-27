import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { isLoggedIn } from "../services/auth";

const POST_ENDPOINTS = [
  "/api/certificado/generar/",
  "/api/certificado/generar-certificado/",
  "/api/generar-certificado/",
];

const GET_ENDPOINT = "/api/certificado/generar/"; // para descarga directa por id

export default function GenerarCertificado() {
  const logged = isLoggedIn();

  const [dni, setDni] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null); // {type:'success'|'info'|'warning'|'danger', text:string}
  const [deudas, setDeudas] = useState([]);
  const [varios, setVarios] = useState([]); // [{id_pago_unico, propietario, entidadinterna}]

  // ---------- helpers ----------
  const toBlobText = async (maybeBlob) => {
    if (!maybeBlob) return "";
    try {
      return await maybeBlob.text();
    } catch {
      return "";
    }
  };

  // Intenta POST en múltiples endpoints por compat
  const postConFallback = async (payload) => {
    let lastErr = null;
    for (const url of POST_ENDPOINTS) {
      try {
        // MUY IMPORTANTE: header AJAX para activar el "blindaje" del backend
        const res = await api.post(url, payload, {
          responseType: "blob",
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        return res;
      } catch (err) {
        lastErr = err;
        // si no existe, probamos el siguiente
        if (err?.response?.status !== 404) throw err;
      }
    }
    throw lastErr;
  };

  const descargarPorId = async (idp, dniTrim) => {
    try {
      const res = await api.get(GET_ENDPOINT, {
        responseType: "blob",
        headers: { "X-Requested-With": "XMLHttpRequest" },
        params: { id_pago_unico: idp, dni: dniTrim || undefined },
      });

      const ct = (res.headers?.["content-type"] || "").toLowerCase();
      if (!ct.includes("application/pdf")) {
        // si no es PDF, intentamos mostrar mensaje
        const text = await toBlobText(res.data);
        try {
          const j = JSON.parse(text);
          alert(j.mensaje || j.error || "No se pudo generar el certificado.");
        } catch {
          alert(text || "No se pudo generar el certificado.");
        }
        return;
      }

      // Descargar PDF
      const cd = res.headers?.["content-disposition"] || "";
      let filename = "certificado.pdf";
      const m = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(cd);
      if (m && m[1]) filename = decodeURIComponent(m[1]);

      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const text = await toBlobText(err?.response?.data);
      try {
        const j = JSON.parse(text || "{}");
        alert(j.error || j.mensaje || "No se pudo descargar el certificado.");
      } catch {
        alert(text || "No se pudo descargar el certificado.");
      }
    }
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

      // Caso PDF directo (exactamente 1 cancelado)
      if (ct.includes("application/pdf")) {
        const pdfBlob = new Blob([res.data], { type: "application/pdf" });
        const url = window.URL.createObjectURL(pdfBlob);
        // lo abrimos en nueva pestaña (si preferís descargar directa, usá la misma lógica de descargarPorId)
        window.open(url, "_blank", "noopener");
        setMsg({
          type: "success",
          text:
            "El certificado se abrió en una nueva pestaña. Si no lo ves, revisá el bloqueador de ventanas emergentes.",
        });
        setTimeout(() => window.URL.revokeObjectURL(url), 60000);
        return;
      }

      // Aunque pedimos blob, si viene JSON lo convertimos
      const text = await toBlobText(res.data);
      const payload = JSON.parse(text || "{}");

      if (payload.error) {
        setMsg({ type: "danger", text: payload.error });
        return;
      }

      switch (payload.estado) {
        case "pendiente":
          setMsg({
            type: "warning",
            text: payload.mensaje || "Existen deudas pendientes. No se puede emitir el/los certificado(s).",
          });
          setDeudas(Array.isArray(payload.deudas) ? payload.deudas : []);
          break;

        case "varios_cancelados":
          // En camino "no-AJAX" del backend vendría 'certificados' y/o 'seleccionar_url'.
          // PERO con nuestro header AJAX, el backend devuelve 400 con 'opciones' (lo manejamos abajo en el catch).
          setMsg({
            type: "info",
            text: payload.mensaje || "Tenés varias entidades sin deuda. Podés descargar cada certificado.",
          });
          setVarios(Array.isArray(payload.certificados) ? payload.certificados : []);
          break;

        default:
          setMsg({ type: "info", text: payload.mensaje || "Respuesta recibida." });
          break;
      }
    } catch (err) {
      // Acá cae, por ejemplo, cuando el backend devuelve 400 con { estado: "varios_cancelados", opciones: [...] }
      const status = err?.response?.status;
      const text = await toBlobText(err?.response?.data);

      try {
        const payload = JSON.parse(text || "{}");

        // Caso blindaje AJAX: múltiples cancelados → 400 con "opciones"
        if (status === 400 && payload?.estado === "varios_cancelados" && Array.isArray(payload.opciones)) {
          setMsg({
            type: "info",
            text: payload.mensaje || "Tenés varias entidades sin deuda. Descargá el que corresponda.",
          });
          setVarios(payload.opciones); // [{id_pago_unico, propietario, entidadinterna}]
          return;
        }

        // Otros errores con JSON claro
        if (payload.error || payload.detail || payload.mensaje) {
          setMsg({
            type: "danger",
            text: payload.error || payload.detail || payload.mensaje || "No se pudo procesar la solicitud.",
          });
          // Si manda deudas
          if (Array.isArray(payload.deudas)) setDeudas(payload.deudas);
          return;
        }
      } catch {
        // no-json
      }

      if (status === 404) {
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
    } finally {
      setLoading(false);
    }
  };

  // ---------- UI fragmento reutilizable ----------
  const Formulario = () => {
    const dniTrim = (dni || "").replace(/\D/g, "").trim();

    return (
      <>
        <h2 className="text-bia fw-bold mb-3 text-center">
          Generar Certificado Libre de Deuda
        </h2>
        <p className="text-muted text-center mb-4">
          Ingresá tu DNI a continuación:
        </p>

        <form onSubmit={handleSubmit} className="mx-auto" style={{ maxWidth: 420 }}>
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

        {/* Tabla de deudas */}
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

        {/* Certificados descargables (múltiples cancelados) */}
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
                      <button
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => descargarPorId(c.id_pago_unico, dniTrim)}
                      >
                        Certificado LDD
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="small text-muted mt-2">
              * Los archivos se descargan individualmente sin salir de esta página.
            </div>
          </div>
        )}
      </>
    );
  };

  // ---------- Layout condicional ----------
  if (!logged) {
    return (
      <div className="page-fill position-relative overflow-hidden d-flex align-items-center">
        <div className="pm-hero-bg" aria-hidden>{/* fondo decorativo */}</div>
        <div className="pm-hero-vignette" aria-hidden></div>
        <div className="container position-relative" style={{ zIndex: 2 }}>
          <div className="row justify-content-center">
            <div className="col-12 col-md-10 col-lg-8 col-xl-7">
              <div className="glass-card glass-card--ultra rounded-4 shadow-lg p-4 p-md-5">
                <Formulario />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Versión habitual para usuarios logueados (card blanca sobre bg-app global)
  return (
    <div className="container page-fill d-flex align-items-center">
      <div className="w-100">
        <div className="card border-0 shadow-sm rounded-4 w-100 mx-auto" style={{ maxWidth: 760 }}>
          <div className="card-body p-4 p-md-5">
            <Formulario />
          </div>
        </div>
      </div>
    </div>
  );
}
