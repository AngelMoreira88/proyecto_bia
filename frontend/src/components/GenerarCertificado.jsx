// frontend/src/components/GenerarCertificado.jsx
import { useState } from "react";
import api, { consultarPorDni } from "../services/api";
import { isLoggedIn } from "../services/auth";
import BackHomeLink from "./BackHomeLink";
import WhatsAppButton from "./WhatsAppButton";

/* ========= WhatsApp config ========= */
const WA_PHONE = (process.env.REACT_APP_WA_PHONE || "5491100000000")
  .toString()
  .replace(/[^\d]/g, "");
const WA_MSG_DEFAULT =
  process.env.REACT_APP_WA_MSG ||
  "Hola, tengo una deuda para cancelar y necesito asesoramiento";

/* Mensaje específico para la burbuja pública (distinto al de deuda) */
const WA_MSG_PUBLIC =
  process.env.REACT_APP_WA_MSG_PUBLIC ||
  "Hola, necesito ayuda con el Portal de Consultas y Descargas";

/* ========= Preferencias de respuesta ========= */
const ACCEPT_PREF = "application/pdf, application/json, */*";
const GET_PDF_ENDPOINT = "/api/certificado/generar/"; // tu endpoint actual de descarga

/* ========= Helpers ========= */
const fmtMoney = (v) => {
  if (v == null || v === "") return "—";
  const n = Number(String(v).toString().replace(/[^\d.-]/g, ""));
  if (Number.isNaN(n)) return String(v);
  try {
    return n.toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return n.toFixed(2);
  }
};

const buildWAUrl = (phone, text) =>
  `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`;

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const isRowCancelado = (row) =>
  row?.cancelado === true || norm(row?.estado).startsWith("cancelado");

async function descargarPDF(id_pago_unico, dni) {
  const res = await api.get(GET_PDF_ENDPOINT, {
    responseType: "blob",
    headers: { "X-Requested-With": "XMLHttpRequest", Accept: ACCEPT_PREF },
    params: { id_pago_unico, dni: dni || undefined },
  });

  const ct = (res.headers?.["content-type"] || "").toLowerCase();
  if (!ct.includes("application/pdf")) {
    throw new Error("Respuesta no es PDF");
  }
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
}

/* ========= UI ========= */
export default function GenerarCertificado() {
  const logged = isLoggedIn();

  const [dni, setDni] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [rows, setRows] = useState([]); // todas las deudas (canceladas y no)

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg(null);
    setRows([]);
    const dniTrim = (dni || "").replace(/\D/g, "").trim();
    if (!dniTrim) {
      setMsg({ type: "warning", text: "Ingresá un DNI válido (solo números)." });
      return;
    }

    setLoading(true);
    try {
      const { data } = await consultarPorDni(dniTrim);
      const arr = Array.isArray(data?.deudas) ? data.deudas : [];
      setRows(arr);

      if (!arr.length) {
        setMsg({ type: "info", text: "No se encontraron deudas para este DNI." });
      } else {
        const canceladas = arr.filter((r) => isRowCancelado(r)).length;
        const noCancel = arr.length - canceladas;
        setMsg({
          type: "light",
          text: `Encontramos ${arr.length} deuda(s). Canceladas: ${canceladas} • Con deuda: ${noCancel}`,
        });
      }
    } catch (err) {
      console.error(err);
      setMsg({ type: "danger", text: "No se pudo consultar. Intentá más tarde." });
    } finally {
      setLoading(false);
    }
  };

  const handleDescarga = async (r) => {
    try {
      await descargarPDF(r.id_pago_unico, r.dni);
    } catch (err) {
      console.error(err);
      alert("No se pudo descargar el certificado.");
    }
  };

  const dniTrim = (dni || "").replace(/\D/g, "").trim();

  // =======================
  //      TABLA CENTRADA  
  // =======================
  const Table = () => (
    <div
      className="table-responsive mt-3 mx-auto"
      style={{ maxWidth: 900 }}
    >
      <table className="table table-sm align-middle mb-0">
        <thead className="table-light">
          <tr>
            <th>Entidad actual</th>
            <th>Entidad original</th>
            <th className="fit-col">Estado de la deuda</th>
            <th className="text-end fit-col">Saldo actualizado</th>
            <th className="text-end fit-col">Cancel Min</th>
            <th className="text-end fit-col">Acción</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isCanc = isRowCancelado(r);
            const estadoSimple = isCanc ? "Cancelado" : "Con Deuda";
            const estadoClass = isCanc ? "text-success fw-semibold" : "text-danger fw-semibold";
            const saldoAct = fmtMoney(r.saldo_actualizado);
            const cancelMin = fmtMoney(r.cancel_min);
            const entidad = r.entidadinterna || "—";
            const entidadOrig = r.entidadoriginal || "—";
            const showWA = !isCanc;
            const waText = `${WA_MSG_DEFAULT} DNI: ${dniTrim} • ID pago único: ${r.id_pago_unico || "—"}`;
            const waHref = buildWAUrl(WA_PHONE, waText);

            return (
              <tr key={`row-${r.id_pago_unico || r.id || i}`}>
                <td>{entidad}</td>
                <td>{entidadOrig}</td>
                <td className={`fit-col ${estadoClass}`}>{estadoSimple}</td>
                <td className="text-end fit-col">{saldoAct}</td>
                <td className="text-end fit-col">{cancelMin}</td>
                <td className="text-end fit-col">
                  {showWA ? (
                    <a
                      className="btn btn-sm btn-success"
                      href={waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Contactar por WhatsApp"
                    >
                      Contactanos por WhatsApp
                    </a>
                  ) : (
                    <button
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => handleDescarga(r)}
                      disabled={!r.id_pago_unico}
                      title={r.id_pago_unico ? "Descargar certificado" : "Falta ID para descargar"}
                    >
                      Descargar Libre de Deuda
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const Form = () => (
    <form onSubmit={onSubmit} className="mx-auto" style={{ maxWidth: 420 }}>
      <div className="text-start">
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
            setRows([]);
          }}
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          placeholder="DNI (solo números)"
          required
        />
      </div>

      {msg && <div className={`alert alert-${msg.type} mt-2 mb-0`}>{msg.text}</div>}

      <div className="d-flex justify-content-center gap-2 mt-2">
        <button type="submit" className="btn btn-bia btn-sm" disabled={loading}>
          {loading ? "Consultando..." : "Consultar"}
        </button>
        <BackHomeLink>
          <span className="small">Volver al home.</span>
        </BackHomeLink>
      </div>
    </form>
  );

  // ======== RENDER ========
  if (!logged) {
    const waTextPublic = WA_MSG_PUBLIC;

    return (
      <>
        <div className="page-fill position-relative overflow-hidden d-flex align-items-center">
          <div className="pm-hero-bg" aria-hidden></div>
          <div className="pm-hero-vignette" aria-hidden></div>
          <div className="container position-relative" style={{ zIndex: 2 }}>
            <div className="row justify-content-center">
              <div className="col-12 col-lg-11 col-xl-10">
                <div
                  className="glass-card glass-card--ultra rounded-4 shadow-lg p-4 p-md-5"
                  style={{ maxWidth: 1100, margin: "0 auto" }}
                >
                  <h2 className="text-bia fw-bold text-center">Portal de Consultas y Descargas</h2>
                  <p className="text-muted text-center mb-2">Ingresá tu DNI</p>
                  <Form />
                  {rows.length > 0 && <Table />}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Burbuja flotante: SOLO en público */}
        <WhatsAppButton phone={WA_PHONE} text={waTextPublic} show={true} />
      </>
    );
  }

  // Página privada (logueado)
  return (
    <>
      <div className="container page-fill d-flex align-items-center">
        <div className="w-100">
          <div className="card border-0 shadow-sm rounded-4 w-100 mx-auto" style={{ maxWidth: 1100 }}>
            <div className="card-body p-4 p-md-5">
              <h2 className="text-bia fw-bold text-center">Portal de Consultas y Descargas</h2>
              <p className="text-muted text-center mb-2">Ingresá tu DNI</p>
              <Form />
              {rows.length > 0 && <Table />}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
