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

const WA_MSG_PUBLIC =
  process.env.REACT_APP_WA_MSG_PUBLIC ||
  "Hola, necesito ayuda con el Portal de Consultas y Descargas";

/* ========= Preferencias ========= */
const ACCEPT_PREF = "application/pdf, application/json, */*";
const GET_PDF_ENDPOINT = "/api/certificado/generar/";

/* ========= Helpers ========= */
const fmtMoney = (v) => {
  if (v == null || v === "") return "—";
  const str = String(v);

  // si ya parece texto “bonito”, lo mostramos como está
  if (/[,$]/.test(str) && !/^\d+(\.\d+)?$/.test(str)) {
    return str;
  }

  const n = Number(str.replace(/[^\d.-]/g, ""));
  if (Number.isNaN(n)) return str;

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

/**
 * Devuelve el primer valor "real" (no null / no string vacía)
 * de una lista de posibles claves del objeto.
 *
 * 1) Intenta coincidencia EXACTA (obj[k])
 * 2) Si no encuentra, intenta coincidencia normalizada:
 *    - pasa a lower case
 *    - elimina espacios y guiones bajos
 *    Ej: "saldoActualizado", "SALDO_ACTUALIZADO", "saldo_actualizado"
 *    todos se consideran iguales.
 */
const pickFirstValue = (obj, keys) => {
  if (!obj || typeof obj !== "object") return null;

  // --- 1) Coincidencia exacta (como antes) ---
  for (const k of keys) {
    if (!(k in obj)) continue;
    const v = obj[k];
    if (v == null) continue;
    const s = String(v);
    if (s.trim() === "") continue;
    return v;
  }

  // --- 2) Coincidencia "normalizada" ---
  const normKey = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[\s_]/g, ""); // quita espacios y underscores

  // armamos un mapa de claves normalizadas -> clave real
  const keyMap = {};
  for (const actualKey of Object.keys(obj)) {
    const nk = normKey(actualKey);
    if (!keyMap[nk]) {
      keyMap[nk] = actualKey;
    }
  }

  // buscamos cada candidato por su versión normalizada
  for (const candidate of keys) {
    const nk = normKey(candidate);
    const realKey = keyMap[nk];
    if (!realKey) continue;
    const v = obj[realKey];
    if (v == null) continue;
    const s = String(v);
    if (s.trim() === "") continue;
    return v;
  }

  return null;
};

const buildWAUrl = (phone, text) =>
  `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`;

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/**
 * Consideramos "cancelado" por:
 * - flag booleano row.cancelado (si viene)
 * - o texto del estado que empiece con "cancelado"
 */
const isRowCancelado = (row) => {
  if (!row) return false;
  if (typeof row.cancelado === "boolean") return row.cancelado;
  return norm(row.estado).startsWith("cancelado");
};

async function descargarPDF(id_pago_unico, dni) {
  const res = await api.get(GET_PDF_ENDPOINT, {
    responseType: "blob",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      Accept: ACCEPT_PREF,
    },
    params: { id_pago_unico, dni: dni || undefined },
  });

  const ct = (res.headers?.["content-type"] || "").toLowerCase();
  if (!ct.includes("application/pdf")) throw new Error("Respuesta no es PDF");

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
  const [rows, setRows] = useState([]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg(null);
    setRows([]);

    const dniTrim = dni.replace(/\D/g, "").trim();
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
        const noCanc = arr.length - canceladas;

        if (noCanc === 0) {
          // TODAS las deudas están canceladas → no se muestra ningún monto
          setMsg({
            type: "success",
            text:
              `Encontramos ${arr.length} registro(s) y todos figuran como CANCELADO. ` +
              `No se muestra ningún monto de deuda; solo el estado y la opción de descargar tu Libre de Deuda.`,
          });
        } else {
          setMsg({
            type: "light",
            text: `Encontramos ${arr.length} deuda(s). Canceladas: ${canceladas} • Con deuda vigente: ${noCanc}`,
          });
        }
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

  const dniTrim = dni.replace(/\D/g, "").trim();

  // 👉 Hay al menos una deuda vigente (no cancelada)?
  const hasDeudaVigente = rows.some((r) => !isRowCancelado(r));

  /* ========= TABLA (moderna, sin scroll interno) ========= */
  const Table = () => (
    <div className="mt-4 d-flex justify-content-center">
      <div
        className="card border-0 shadow-sm rounded-4 w-100"
        style={{ maxWidth: 1400 }}
      >
        {/* Encabezado del bloque de resultados */}
        <div className="px-4 pt-3 pb-2 border-bottom bg-light bg-opacity-50">
          <div className="d-flex justify-content-between align-items-baseline flex-wrap gap-2">
            <h6 className="mb-0 text-muted text-uppercase small fw-semibold">
              Detalle de deudas
            </h6>
            {dniTrim && (
              <span className="small text-muted">
                DNI consultado: <span className="fw-semibold">{dniTrim}</span>
              </span>
            )}
          </div>
        </div>

        <div className="card-body p-0">
          {/* SIN table-responsive → sin barra interna */}
          <table className="table table-hover table-borderless align-middle mb-0 text-center">
            <thead className="table-light">
              <tr>
                <th className="text-center text-nowrap">Entidad actual</th>
                <th className="text-center text-nowrap">Entidad original</th>
                <th className="text-center text-nowrap">Estado de la deuda</th>
                {/* 👉 Solo mostramos columnas de montos si hay al menos una deuda vigente */}
                {hasDeudaVigente && (
                  <>
                    <th className="text-center text-nowrap">Saldo actualizado</th>
                    <th className="text-center text-nowrap">Cancelación mínima</th>
                  </>
                )}
                <th className="text-center text-nowrap">Acción</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r, i) => {
                const isCanc = isRowCancelado(r);

                const estadoSimple = isCanc ? "Cancelado" : "Con Deuda";
                const estadoBadgeClass = isCanc
                  ? "bg-success bg-opacity-10 text-success"
                  : "bg-danger bg-opacity-10 text-danger";

                // Entidades (limpiamos espacios múltiples)
                const entidadRaw = r.entidadinterna || r.entidad_interna || "—";
                const entidad = entidadRaw.replace(/\s+/g, " ").trim();

                const entidadOrigRaw = r.entidadoriginal || r.entidad_original || "—";
                const entidadOrig = entidadOrigRaw.replace(/\s+/g, " ").trim();

                // Mapeo de posibles nombres de saldo
                const rawSaldo = pickFirstValue(r, [
                  "saldo_actualizado",
                  "saldoactualizado",
                  "saldo_actual",
                  "saldoactual",
                  "saldo_capital",
                  "saldocapital",
                  "saldo",
                  "saldoTotal",
                  "saldo_total",
                ]);

                // Mapeo de posibles campos de cancelación mínima
                const rawCancelMin = pickFirstValue(r, [
                  "cancel_min",
                  "cancelmin",
                  "cancel_minimo",
                  "cancelminimo",
                  "cancel_minima",
                  "cancelacion_minima",
                  "cancelacionMinima",
                  "cancel_minimo_requerido",
                ]);

                // 👉 Para filas canceladas, NO mostrar ningún valor de montos
                const showMontos = hasDeudaVigente && !isCanc;

                const showWA = !isCanc;
                const waText = `${WA_MSG_DEFAULT} DNI: ${dniTrim} • ID pago único: ${
                  r.id_pago_unico || "—"
                }`;
                const waHref = buildWAUrl(WA_PHONE, waText);

                // (Opcional) log por si sigue sin matchear
                if (!isCanc && showMontos && (rawSaldo == null || rawCancelMin == null)) {
                  console.debug("Fila sin montos detectada:", r);
                }

                return (
                  <tr key={`row-${r.id_pago_unico || r.id || i}`}>
                    <td className="text-nowrap">{entidad}</td>
                    <td className="text-nowrap">{entidadOrig}</td>
                    <td className="text-nowrap">
                      <span
                        className={`badge rounded-pill px-3 py-2 fw-semibold ${estadoBadgeClass}`}
                      >
                        {estadoSimple}
                      </span>
                    </td>

                    {/* 👉 Solo renderizamos estas celdas si hay alguna deuda vigente */}
                    {hasDeudaVigente && (
                      <>
                        <td className="fw-semibold text-nowrap">
                          {showMontos ? fmtMoney(rawSaldo) : ""}
                        </td>
                        <td className="fw-semibold text-nowrap">
                          {showMontos ? fmtMoney(rawCancelMin) : ""}
                        </td>
                      </>
                    )}

                    <td className="text-nowrap">
                      {showWA ? (
                        <a
                          className="btn btn-sm btn-success rounded-pill px-3"
                          href={waHref}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Contactanos por WhatsApp
                        </a>
                      ) : (
                        <button
                          className="btn btn-sm btn-outline-primary rounded-pill px-3"
                          onClick={() => handleDescarga(r)}
                          disabled={!r.id_pago_unico}
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
      </div>
    </div>
  );

  /* ========= FORM ========= */
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

      <div className="d-flex justify-content-center gap-2 mt-3">
        <button type="submit" className="btn btn-bia btn-sm px-4" disabled={loading}>
          {loading ? "Consultando..." : "Consultar"}
        </button>
        <BackHomeLink>
          <span className="small">Volver al home.</span>
        </BackHomeLink>
      </div>
    </form>
  );

  /* ========= PUBLIC RENDER ========= */
  if (!logged) {
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
                  style={{ maxWidth: 1400, margin: "0 auto" }}
                >
                  <h2 className="text-bia fw-bold text-center">
                    Portal de Consultas y Descargas
                  </h2>
                  <p className="text-muted text-center mb-3">Ingresá tu DNI</p>

                  <Form />
                  {rows.length > 0 && <Table />}
                </div>
              </div>
            </div>
          </div>
        </div>

        <WhatsAppButton phone={WA_PHONE} text={WA_MSG_PUBLIC} show={true} />
      </>
    );
  }

  /* ========= PRIVATE RENDER ========= */
  return (
    <div className="container page-fill d-flex align-items-center">
      <div className="w-100">
        <div
          className="card border-0 shadow-sm rounded-4 w-100 mx-auto"
          style={{ maxWidth: 1400 }}
        >
          <div className="card-body p-4 p-md-5">
            <h2 className="text-bia fw-bold text-center">
              Portal de Consultas y Descargas
            </h2>
            <p className="text-muted text-center mb-3">Ingresá tu DNI</p>

            <Form />
            {rows.length > 0 && <Table />}
          </div>
        </div>
      </div>
    </div>
  );
}
