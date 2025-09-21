// frontend/src/components/GenerarCertificado.jsx
import { useState } from "react";
import api, { listarDatosBia } from "../services/api";
import { isLoggedIn } from "../services/auth";
import BackHomeLink from "./BackHomeLink";

/* ========= WhatsApp config ========= */
const WA_PHONE = (process.env.REACT_APP_WA_PHONE || "5491100000000")
  .toString()
  .replace(/[^\d]/g, "");
const WA_MSG_DEFAULT =
  process.env.REACT_APP_WA_MSG ||
  "Hola, tengo una deuda para cancelar y necesito asesoramiento";

/* ========= Endpoints (públicos para certificado) ========= */
const POST_ENDPOINTS = [
  "/api/certificado/generar/",
  "/api/certificado/generar-certificado/",
  "/api/generar-certificado/",
];
const GET_ENDPOINT = "/api/certificado/generar/"; // descarga directa por id

/* ========= Preferencias de respuesta ========= */
const ACCEPT_PREF = "application/pdf, application/json, */*";

const toBlobText = async (maybeBlob) => {
  if (!maybeBlob) return "";
  try {
    return await maybeBlob.text();
  } catch {
    return "";
  }
};

// Detecta si la respuesta parece una página HTML (login/error)
const isLikelyHtml = (text = "") => {
  const t = String(text).trim().toLowerCase();
  return t.startsWith("<!doctype html") || t.startsWith("<html");
};

const buildWAUrl = (phone, text) =>
  `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`;

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const readEstado = (obj) => {
  if (!obj || typeof obj !== "object") return "";
  for (const k of Object.keys(obj)) {
    if (/estado|status|situaci[oó]n/i.test(k)) return String(obj[k]);
  }
  for (const k of ["estado", "Estado", "ESTADO", "status", "Status"]) {
    if (obj[k] != null) return String(obj[k]);
  }
  return "";
};

const isCanceladoValue = (val) => {
  const v = norm(val);
  return (
    v === "cancelado" ||
    v === "cancelada" ||
    v.startsWith("cancelado") ||
    v.startsWith("cancelada")
  );
};

const readIdPagoUnico = (obj) => {
  if (!obj || typeof obj !== "object") return "";
  const candidates = ["id_pago_unico", "idPagoUnico", "id_pago", "id", "ID"];
  for (const k of candidates) {
    if (obj[k] != null && String(obj[k]).trim() !== "") {
      return String(obj[k]).trim();
    }
  }
  return "";
};

const looksLikeDeuda = (x) => {
  if (!x || typeof x !== "object") return false;
  const est = readEstado(x);
  return (
    "id_pago_unico" in x ||
    "idPagoUnico" in x ||
    "propietario" in x ||
    "entidadinterna" in x ||
    "grupo" in x ||
    est !== ""
  );
};

const collectArrays = (payload) => {
  const arrays = [];
  const candidateKeys = [
    "deudas",
    "pendientes",
    "items",
    "results",
    "registros",
    "detalle",
    "detalles",
    "pagos",
    "rows",
    "data",
    "certificados",
    "cancelados",
    "opciones",
  ];
  for (const k of candidateKeys) {
    const v = payload?.[k];
    if (Array.isArray(v)) arrays.push(v);
  }
  for (const v of Object.values(payload || {})) {
    if (Array.isArray(v) && v.length && v.every((x) => typeof x === "object")) {
      if (v.some(looksLikeDeuda)) arrays.push(v);
    }
  }
  return arrays;
};

/** Dedupe SOLO por ID. Si no hay ID, solo quita duplicados idénticos (JSON igual). */
const dedupeRows = (arr) => {
  const seenIds = new Set();
  const seenExact = new Set();
  const out = [];
  for (const x of arr) {
    const id = readIdPagoUnico(x);
    if (id) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      out.push(x);
    } else {
      const sig = JSON.stringify(x);
      if (seenExact.has(sig)) continue;
      seenExact.add(sig);
      out.push(x);
    }
  }
  return out;
};

// Clasifica robusto: NO cancelados
const pickNoCancelados = (payload) => {
  const pools = collectArrays(payload);
  const merged = pools.flat();
  return dedupeRows(merged.filter((x) => !isCanceladoValue(readEstado(x))));
};

// Clasifica robusto: SOLO cancelados
const pickSoloCancelados = (payload) => {
  if (Array.isArray(payload?.certificados)) return dedupeRows(payload.certificados);
  if (Array.isArray(payload?.cancelados)) return dedupeRows(payload.cancelados);
  const pools = collectArrays(payload);
  const merged = pools.flat();
  const only = merged.filter((x) => isCanceladoValue(readEstado(x)));
  return dedupeRows(only);
};

/** Merge para la tabla */
const mergeRowsForTable = (noCancelados, cancelados) => {
  const out = [];
  const byIdIndex = new Map();

  const push = (x, hintedCat) => {
    const id = readIdPagoUnico(x);
    const raw = (readEstado(x) || "").trim();
    const isCanc = raw ? isCanceladoValue(raw) : hintedCat === "cancelado";
    const display = raw || (isCanc ? "cancelado" : "pendiente");
    const row = { ...x, _id: id, _cat: isCanc ? "cancelado" : "no_cancelado", _estado: display };

    if (id) {
      if (byIdIndex.has(id)) {
        const idx = byIdIndex.get(id);
        if (row._cat === "cancelado" && out[idx]._cat !== "cancelado") out[idx] = row;
        return;
      }
      byIdIndex.set(id, out.length);
    }
    out.push(row);
  };

  noCancelados.forEach((x) => push(x, "no_cancelado"));
  cancelados.forEach((x) => push(x, "cancelado"));
  return out;
};

// Extrae un id posible del Content-Disposition
const idFromContentDisposition = (cd = "") => {
  const m = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(cd);
  const fn = m && m[1] ? decodeURIComponent(m[1]) : "";
  const d = /(\d{3,})/.exec(fn);
  return d ? d[1] : "";
};

// Normaliza distintas formas de payload->array
const normalizeResults = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (payload?.results && Array.isArray(payload.results)) return payload.results;
  if (payload?.items && Array.isArray(payload.items)) return payload.items;
  if (payload?.data && Array.isArray(payload.data)) return payload.data;
  if (payload?.registros && Array.isArray(payload.registros)) return payload.registros;
  return [];
};

// Busca meta por DNI + ID (solo si hay sesión)
const fetchMetaById = async (dniTrim, idp) => {
  if (!isLoggedIn()) return { propietario: "—", entidadinterna: "—" };
  try {
    const res = await listarDatosBia({ dni: dniTrim, id_pago_unico: idp, page: 1 });
    const arr = normalizeResults(res?.data || {});
    const r = arr[0] || {};
    return {
      propietario: r.propietario || r.nombre_apellido || "—",
      entidadinterna: r.entidadinterna || r.entidad || "—",
    };
  } catch {
    return { propietario: "—", entidadinterna: "—" };
  }
};

/** Fallback por DNI (solo si hay sesión) */
const fetchAllByDni = async (dniTrim) => {
  if (!isLoggedIn()) return { nc: [], ok: [] };
  try {
    const res = await listarDatosBia({ dni: dniTrim, page: 1 });
    const all = normalizeResults(res?.data || {});
    const nc = dedupeRows(all.filter((x) => !isCanceladoValue(readEstado(x))));
    const ok = dedupeRows(all.filter((x) => isCanceladoValue(readEstado(x))));
    return { nc, ok };
  } catch {
    return { nc: [], ok: [] };
  }
};

/* ========= UI ========= */
function CertificadoForm({
  dni,
  setDni,
  loading,
  msg,
  setMsg,
  deudas, // NO cancelados
  setDeudas,
  varios, // SOLO cancelados
  setVarios,
  onSubmit,
  onDescargarPorId,
}) {
  const dniTrim = (dni || "").replace(/\D/g, "").trim();
  const filas = mergeRowsForTable(deudas, varios);
  const hasResultados = filas.length > 0;

  return (
    <>
      <h2 className="text-bia fw-bold mb-3 text-center">Portal de Consultas y Descargas</h2>
      <p className="text-muted text-center mb-4">Ingresá tu DNI a continuación</p>

      <form onSubmit={onSubmit} className="mx-auto" style={{ maxWidth: 420 }}>
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
            autoFocus
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
          <BackHomeLink>Volver al home</BackHomeLink>
        </div>
      </form>

      {hasResultados && (
        <div className="table-responsive mt-3">
          <table className="table table-sm align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Propietario</th>
                <th>Entidad actual</th>
                <th>Estado de la deuda</th>
                <th className="text-end">¿Desea descargar su PDF?</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((r, i) => {
                const idp = r._id || readIdPagoUnico(r);
                const estado = r._estado || readEstado(r) || "—";
                const showWA = r._cat === "no_cancelado";

                const waText =
                  `${WA_MSG_DEFAULT} DNI: ${dniTrim}` + (idp ? ` • ID pago único: ${idp}` : "");
                const waHref = buildWAUrl(WA_PHONE, waText);
                const key = `row-${idp || ""}-${r.propietario || ""}-${r.entidadinterna || ""}-${estado}-${i}`;

                return (
                  <tr key={key}>
                    <td>{r.propietario ?? "—"}</td>
                    <td>{r.entidadinterna ?? "—"}</td>
                    <td>{estado}</td>
                    <td className="text-end">
                      {showWA ? (
                        <a
                          className="btn btn-sm btn-success"
                          href={waHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Contactar por WhatsApp"
                        >
                          Contactános a traves de WhatsApp
                        </a>
                      ) : (
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => onDescargarPorId(idp, dniTrim)}
                          disabled={!idp}
                          title={idp ? "Descargar certificado" : "Falta ID para descargar"}
                        >
                          Descarga tu libre de deuda en PDF
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ========= Contenedor ========= */
export default function GenerarCertificado() {
  const logged = isLoggedIn();

  const [dni, setDni] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [deudas, setDeudas] = useState([]); // NO cancelados
  const [varios, setVarios] = useState([]); // SOLO cancelados

  // POST con fallback entre endpoints públicos
  const postConFallback = async (payload) => {
    let lastErr = null;
    for (const url of POST_ENDPOINTS) {
      try {
        const res = await api.post(url, payload, {
          responseType: "blob",
          headers: {
            "X-Requested-With": "XMLHttpRequest",
            Accept: ACCEPT_PREF,
          },
        });
        return res;
      } catch (err) {
        lastErr = err;
        if (err?.response?.status !== 404) throw err;
      }
    }
    throw lastErr;
  };

  const descargarPorId = async (idp, dniTrim) => {
    try {
      const res = await api.get(GET_ENDPOINT, {
        responseType: "blob",
        headers: { "X-Requested-With": "XMLHttpRequest", Accept: ACCEPT_PREF },
        params: { id_pago_unico: idp, dni: dniTrim || undefined },
      });

      const ct = (res.headers?.["content-type"] || "").toLowerCase();
      if (!ct.includes("application/pdf")) {
        const text = await toBlobText(res.data);
        if (isLikelyHtml(text)) {
          alert("No se pudo generar el certificado en este momento.");
          return;
        }
        try {
          const j = JSON.parse(text);
          alert(j.mensaje || j.error || "No se pudo generar el certificado.");
        } catch {
          alert("No se pudo generar el certificado.");
        }
        return;
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
    } catch (err) {
      const text = await toBlobText(err?.response?.data);
      if (isLikelyHtml(text)) {
        alert("No se pudo descargar el certificado (respuesta no válida).");
        return;
      }
      try {
        const j = JSON.parse(text || "{}");
        alert(j.error || j.mensaje || "No se pudo descargar el certificado.");
      } catch {
        alert("No se pudo descargar el certificado.");
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

      // Caso: backend devuelve PDF directo (un único cancelado).
      if (ct.includes("application/pdf")) {
        const cd = res.headers?.["content-disposition"] || "";
        const idp = idFromContentDisposition(cd);
        const meta = await fetchMetaById(dniTrim, idp); // solo consulta DB si hay sesión
        setVarios([
          {
            id_pago_unico: idp || "",
            propietario: meta.propietario,
            entidadinterna: meta.entidadinterna,
            estado: "Cancelado",
          },
        ]);
        setMsg({ type: "success", text: "Podés emitir el/los certificado(s)." });

        // Si hay sesión, enriquecemos con la DB
        const fb = await fetchAllByDni(dniTrim);
        setVarios((prev) => dedupeRows([...prev, ...fb.ok]));
        setDeudas((prev) => dedupeRows([...prev, ...fb.nc]));
        return;
      }

      // Si viene JSON
      const text = await toBlobText(res.data);
      if (isLikelyHtml(text)) {
        setMsg({ type: "danger", text: "No se pudo procesar la solicitud en este momento." });
        return;
      }
      const payload = JSON.parse(text || "{}");

      let detOK = pickSoloCancelados(payload);
      let detNC = pickNoCancelados(payload);

      // Enriquecer con DB solo si hay sesión
      const fb = await fetchAllByDni(dniTrim);
      detOK = dedupeRows([...detOK, ...fb.ok]);
      detNC = dedupeRows([...detNC, ...fb.nc]);

      if (detOK.length) setVarios(detOK);
      if (detNC.length) setDeudas(detNC);

      const estadoGlobal = norm(payload.estado);
      if (estadoGlobal === "pendiente") {
        setMsg({
          type: "warning",
          text:
            payload.mensaje ||
            "Existen deudas pendientes. No se puede emitir el/los certificado(s).",
        });
      } else if (estadoGlobal === "varios_cancelados") {
        setMsg({
          type: "info",
          text:
            payload.mensaje ||
            "Tenés varias entidades sin deuda. Podés descargar cada certificado.",
        });
      } else if (payload.mensaje) {
        setMsg({ type: "info", text: payload.mensaje });
      }

      if (!estadoGlobal && !payload.mensaje && !detOK.length && !detNC.length) {
        setMsg({ type: "info", text: "Respuesta recibida." });
      }
    } catch (err) {
      const status = err?.response?.status;
      const text = await toBlobText(err?.response?.data);

      if (isLikelyHtml(text)) {
        setMsg({ type: "danger", text: "No se pudo generar el certificado. Intentá más tarde." });
        setLoading(false);
        return;
      }

      try {
        const payload = JSON.parse(text || "{}");

        // Compat: algún backend viejo manda 400 con varios_cancelados
        if (
          status === 400 &&
          /varios_cancelados/i.test(String(payload?.estado || "")) &&
          Array.isArray(payload.opciones)
        ) {
          setMsg({
            type: "info",
            text:
              payload.mensaje ||
              "Tenés varias entidades sin deuda. Descargá el que corresponda.",
          });
          const fb = await fetchAllByDni(dniTrim);
          setVarios(dedupeRows([...(payload.opciones || []), ...fb.ok]));
          setDeudas(dedupeRows([...fb.nc]));
          return;
        }

        let detOK = pickSoloCancelados(payload);
        let detNC = pickNoCancelados(payload);

        const fb = await fetchAllByDni(dniTrim);
        detOK = dedupeRows([...detOK, ...fb.ok]);
        detNC = dedupeRows([...detNC, ...fb.nc]);

        if (detOK.length) setVarios(detOK);
        if (detNC.length) setDeudas(detNC);

        if (payload.error || payload.detail || payload.mensaje) {
          setMsg({
            type: "danger",
            text:
              payload.error ||
              payload.detail ||
              payload.mensaje ||
              "No se pudo procesar la solicitud.",
          });
          return;
        }
      } catch {
        // respuesta no JSON
      }

      if (status === 404) {
        setMsg({
          type: "danger",
          text:
            "Endpoint no encontrado. Verificá que exista /api/certificado/generar/ (o los aliases de compat).",
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

  // === Layout ===
  if (!logged) {
    // 🔙 RESTAURADO: fondo/hero original para público
    return (
      <div className="page-fill position-relative overflow-hidden d-flex align-items-center">
        <div className="pm-hero-bg" aria-hidden></div>
        <div className="pm-hero-vignette" aria-hidden></div>
        <div className="container position-relative" style={{ zIndex: 2 }}>
          <div className="row justify-content-center">
            <div className="col-12 col-md-10 col-lg-8 col-xl-7">
              <div className="glass-card glass-card--ultra rounded-4 shadow-lg p-4 p-md-5">
                <CertificadoForm
                  dni={dni}
                  setDni={setDni}
                  loading={loading}
                  msg={msg}
                  setMsg={setMsg}
                  deudas={deudas}
                  setDeudas={setDeudas}
                  varios={varios}
                  setVarios={setVarios}
                  onSubmit={handleSubmit}
                  onDescargarPorId={descargarPorId}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Con sesión (podés dejar sin hero si querés)
  return (
    <div className="container page-fill d-flex align-items-center">
      <div className="w-100">
        <div className="card border-0 shadow-sm rounded-4 w-100 mx-auto" style={{ maxWidth: 760 }}>
          <div className="card-body p-4 p-md-5">
            <CertificadoForm
              dni={dni}
              setDni={setDni}
              loading={loading}
              msg={msg}
              setMsg={setMsg}
              deudas={deudas}
              setDeudas={setDeudas}
              varios={varios}
              setVarios={setVarios}
              onSubmit={handleSubmit}
              onDescargarPorId={descargarPorId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
