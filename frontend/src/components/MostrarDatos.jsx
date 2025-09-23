// src/components/MostrarDatos.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import api, {
  listarDatosBia,
  actualizarDatoBia,
  exportarDatosBiaCSV,
  eliminarDatoBia,
  consultarPorDni, // ⬅️ NUEVO
} from '../services/api';
import { getUserRole } from '../services/auth';
import BackToHomeButton from './BackToHomeButton';

/* ============================
   Etiquetas (incluye alias comunes)
   ============================ */
const LABELS = {
  id: 'ID',
  id_pago_unico: 'ID pago único',
  idpago_unico: 'ID pago único',
  dni: 'DNI',
  nombre_apellido: 'Nombre y apellido',
  nombre_y_apellido: 'Nombre y apellido',
  estado: 'Estado',
  entidadinterna: 'Entidad interna',
  entidad_interna: 'Entidad interna',
  propietario: 'Propietario',
  entidadoriginal: 'Entidad original',
  entidad_original: 'Entidad original',
  grupo: 'Grupo',
  tramo: 'Tramo',
  creditos: 'Créditos',
  comision: 'Comisión',
  total_plan: 'Total plan',
  totalplan: 'Total plan',
  saldo_capital: 'Saldo capital',
  interes_total: 'Interés total',
  fecl: 'FECL',
  fecha_apertura: 'Fecha apertura',
  fecha_de_apertura: 'Fecha apertura',
  cuit: 'CUIT',
};

const pretty = (k) => LABELS[k] || k;

/* ============================
   Orden preferido de columnas
   ============================ */
const PREFERRED_ORDER = [
  'id_pago_unico',
  'dni',
  'nombre_apellido',
  'estado',
  'propietario',
  'entidadoriginal',
  'entidadinterna',
  'grupo',
  'tramo',
  'creditos',
  'comision',
  'saldo_capital',
  'interes_total',
  'fecl',
  'fecha_apertura',
  'total_plan',
  'cuit',
];

/* ============================
   Helpers
   ============================ */
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const isCanceladoFlag = (v) => {
  const x = norm(v);
  return x === 'cancelado' || x.startsWith('cancelado');
};
const isCancelado = (v) => isCanceladoFlag(v);
const estadoBucket = (v) => (isCancelado(v) ? 'cancelado' : 'no_cancelado');
const readIdPagoUnico = (r) => String(r.id_pago_unico ?? r.idpago_unico ?? '').trim();

const scoreRow = (r) => {
  // prioriza cancelado y luego recencia si hubiera fechas
  const cancelScore = isCanceladoFlag(r.estado) ? 1 : 0;
  const ts = new Date(r.ultima_fecha_pago || r.fecha_plan || r.fecha_apertura || 0).getTime() || 0;
  return cancelScore * 1e15 + ts;
};

const dedupeByIdPagoUnico = (arr) => {
  const best = new Map();
  for (const r of arr) {
    const idp = readIdPagoUnico(r) || `__noid__-${JSON.stringify(r)}`;
    const prev = best.get(idp);
    if (!prev || scoreRow(r) > scoreRow(prev)) best.set(idp, r);
  }
  return Array.from(best.values());
};

const classifyQuery = (q) => {
  const s = String(q || '').trim();
  const onlyDigits = /^\d+$/.test(s);
  if (onlyDigits && s.length >= 7 && s.length <= 9) return { kind: 'dni', value: s };
  return { kind: 'id_pago_unico', value: s };
};

const normalizeResults = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.results)) return payload.results;
  if (payload && Array.isArray(payload.items)) return payload.items;
  return [];
};

const ACCEPT_PREF = "application/pdf, application/json, */*";
const GET_PDF_ENDPOINT = "/api/certificado/generar/";
async function descargarPDF(id_pago_unico, dni) {
  const res = await api.get(GET_PDF_ENDPOINT, {
    responseType: "blob",
    headers: { "X-Requested-With": "XMLHttpRequest", Accept: ACCEPT_PREF },
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
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  window.URL.revokeObjectURL(url);
}

/* ============================
   Componente
   ============================ */
export default function MostrarDatos() {
  const [query, setQuery] = useState('');
  const [datos, setDatos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('table'); // 'table' | 'cards'
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeRow, setActiveRow] = useState(null);
  const [formData, setFormData] = useState({});
  const [hasSearched, setHasSearched] = useState(false);
  const [estadoTab, setEstadoTab] = useState('todos'); // 'todos' | 'cancelado' | 'no_cancelado'
  const [device, setDevice] = useState('desktop'); // 'mobile' | 'tablet' | 'desktop'

  // 🔑 foco en campo específico
  const [focusKey, setFocusKey] = useState(null);
  const fieldRefs = useRef({});

  // Roles/permisos
  const roleRaw = getUserRole?.() ?? '';
  const role = String(roleRaw).toLowerCase();
  const isAdmin      = role === 'admin';
  const isSupervisor = role === 'supervisor' || role === 'sup' || role === 'super';
  const canEdit   = isAdmin || isSupervisor || role === 'write';
  const canDelete = isAdmin;
  const canWrite  = canEdit;

  /* ====== Detección simple de dispositivo (bloquea móviles) ====== */
  useEffect(() => {
    const detect = () => {
      const ua = navigator.userAgent.toLowerCase();
      const isMobileUA = /android|iphone|ipod|iemobile|blackberry|opera mini/.test(ua);
      const w = window.innerWidth;
      const isMobileW = w < 576;
      const isTabletW = w >= 576 && w < 992;
      if (isMobileUA || isMobileW) setDevice('mobile');
      else if (isTabletW) setDevice('tablet');
      else setDevice('desktop');
    };
    detect();
    window.addEventListener('resize', detect);
    return () => window.removeEventListener('resize', detect);
  }, []);

  /* ====== Columnas reales detectadas en resultados ====== */
  const columnas = useMemo(() => {
    const seen = new Set();
    for (const row of datos) Object.keys(row || {}).forEach(k => seen.add(k));
    return Array.from(seen);
  }, [datos]);

  /* ====== Columnas visibles (orden preferido + extras) ====== */
  const visibleCols = useMemo(() => {
    if (!columnas.length) return [];
    const setCols = new Set(columnas);
    const ordered = PREFERRED_ORDER.filter(k => setCols.has(k));
    const extras = Array.from(setCols).filter(k => !PREFERRED_ORDER.includes(k));
    return [...ordered, ...extras];
  }, [columnas]);

  /* ====== Celdas y badges ====== */
  const EstadoPill = ({ value }) => {
    const ok = isCancelado(value);
    const cls = ok ? 'success' : 'danger';
    const text = value ?? '—';
    return <span className={`badge rounded-pill bg-${cls}`}>{text}</span>;
  };

  const Cell = ({ k, v }) => {
    if (k === 'estado') return <EstadoPill value={v} />;
    const val = v ?? '—';
    return <span className="truncate-200" title={String(val)}>{String(val)}</span>;
  };

  /* ====== Búsqueda ====== */
  const doSearch = async () => {
    const q = String(query).trim();
    setHasSearched(true);
    if (!q) {
      setError('Ingresá un DNI o ID válido');
      setDatos([]);
      return;
    }
    setLoading(true);
    setError('');
    setDatos([]);

    try {
      const { kind, value } = classifyQuery(q);

      if (kind === 'dni') {
        // ✅ usa el endpoint unificado → mismas filas que el público
        const { data } = await consultarPorDni(value);
        const arr = Array.isArray(data?.deudas) ? data.deudas : [];
        // garantizar id estable
        const mapped = arr.map(r => ({
          id: r.id ?? r.id_pago_unico ?? r.idpago_unico ?? `${r.dni || ''}-${r.id_pago_unico || ''}`,
          ...r,
          // backend ya devuelve cancelado, pero si no, lo derivamos
          cancelado: typeof r.cancelado === 'boolean' ? r.cancelado : isCanceladoFlag(r.estado),
        }));
        setDatos(mapped);
        if (!mapped.length) setError('No se encontraron registros');
      } else {
        // 🔎 búsqueda por ID pago único → listarDatosBia con SOLO id, dedupe y derivar cancelado
        const res = await listarDatosBia({ id_pago_unico: value, page: 1 });
        const payload = res.data || {};
        const results = normalizeResults(payload);
        const raw = results.map(r => ({
          id: r.id ?? r.id_pago_unico ?? r.idpago_unico ?? `${r.dni || ''}-${r.id_pago_unico || ''}`,
          ...r,
        }));
        const deduped = dedupeByIdPagoUnico(raw).map(r => ({
          ...r,
          cancelado: isCanceladoFlag(r.estado),
        }));
        setDatos(deduped);
        if ((payload.count ?? deduped.length) === 0) setError('No se encontraron registros');
      }
    } catch (e) {
      console.error(e);
      setError('Error al consultar la base de datos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => { e.preventDefault(); doSearch(); };

  /* ====== Drawer ====== */
  const openRow  = (row, keyToFocus = null) => {
    const estadoRaw = (row?.estado ?? '').toString();
    setActiveRow(row);
    setFormData({ ...row, estado: estadoRaw });
    setFocusKey(keyToFocus);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setActiveRow(null);
    setFormData({});
    setFocusKey(null);
  };

  const onChangeForm = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  // Campos no editables
  const LOCKED_FIELDS = new Set(['id', 'id_pago_unico', 'idpago_unico']);
  const isFieldEditable = (k) => canWrite && !LOCKED_FIELDS.has(k);

  const hasChanges = useMemo(() => {
    if (!activeRow) return false;
    return Object.keys(formData).some(k => {
      const curr = (formData[k] ?? '').toString().trim();
      const orig = (activeRow[k] ?? '').toString().trim();
      return curr !== orig;
    });
  }, [formData, activeRow]);

  const saveRow = async () => {
    if (!activeRow || !canWrite) return;
    const changes = {};
    Object.keys(formData).forEach((k) => {
      const curr = (formData[k] ?? '').toString();
      const orig = (activeRow[k] ?? '').toString();
      if (curr !== orig && !LOCKED_FIELDS.has(k)) changes[k] = curr;
    });
    if (!Object.keys(changes).length) { closeDrawer(); return; }
    setSaving(true);
    try {
      await actualizarDatoBia(activeRow.id, changes);
      setDatos(prev => prev.map(d => (d.id === activeRow.id ? { ...d, ...changes } : d)));
      closeDrawer();
    } catch (err) {
      console.error(err);
      alert('Error al guardar cambios');
    } finally {
      setSaving(false);
    }
  };

  /* ====== Enfocar campo al abrir ====== */
  useEffect(() => {
    if (drawerOpen && focusKey) {
      const t = setTimeout(() => {
        const el = fieldRefs.current[focusKey];
        if (el?.focus) {
          el.focus();
          try { el.select?.(); } catch {}
          try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
        }
      }, 60);
      return () => clearTimeout(t);
    }
  }, [drawerOpen, focusKey]);

  /* ====== Eliminar (solo admin) ====== */
  const handleDelete = async (id) => {
    if (!canDelete) return;
    const row = datos.find(d => d.id === id);
    const refText = row?.id_pago_unico || id;
    if (!window.confirm(`¿Eliminar el registro ${refText}? Esta acción no se puede deshacer.`)) return;

    setDeletingId(id);
    try {
      await eliminarDatoBia(id);
      setDatos(prev => prev.filter(d => d.id !== id));
      if (activeRow?.id === id) closeDrawer();
    } catch (e) {
      console.error(e);
      alert('No se pudo eliminar el registro');
    } finally {
      setDeletingId(null);
    }
  };

  /* ====== Filtro + orden ====== */
  const filtered = useMemo(() => {
    if (estadoTab === 'todos') return datos;
    return datos.filter(d => estadoBucket(d.estado) === estadoTab);
  }, [datos, estadoTab]);

  const rows = useMemo(() => {
    const arr = filtered.map((r, idx) => ({ r, idx }));
    const weight = (x) => (estadoBucket(x.r.estado) === 'no_cancelado' ? 0 : 1);
    arr.sort((a, b) => {
      const w = weight(a) - weight(b);
      if (w !== 0) return w;
      const na = String(a.r.nombre_apellido ?? a.r.nombre_y_apellido ?? '')
        .localeCompare(String(b.r.nombre_apellido ?? b.r.nombre_y_apellido ?? ''), 'es', { sensitivity: 'base' });
      return na !== 0 ? na : (a.idx - b.idx);
    });
    return arr.map(x => x.r);
  }, [filtered]);

  /* ====== CSV ====== */
  const toCsvValue = (val) => {
    const s = val == null ? '' : String(val);
    const needs = /[",\n\r]/.test(s);
    const esc = s.replace(/"/g, '""');
    return needs ? `"${esc}"` : esc;
  };

  const handleExportTodo = async () => {
    try {
      const res = await exportarDatosBiaCSV();
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bia_todo_${new Date().toISOString().replace(/[-:T.Z]/g,'').slice(0,14)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('No se pudo exportar el CSV');
    }
  };

  const handleExportTodoDNI = () => {
    if (!datos.length) { alert('Realizá una búsqueda primero.'); return; }
    const cols = visibleCols.length ? visibleCols : columnas;
    const headers = cols.map(pretty).join(',');
    const lines = datos.map(r => cols.map(c => toCsvValue(r[c])).join(','));
    const csv = '\uFEFF' + [headers, ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bia_${(query || 'dni')}_${new Date().toISOString().replace(/[-:T.Z]/g,'').slice(0,14)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  /* ====== Bloquea móviles ====== */
  if (device === 'mobile') {
    return (
      <div className="container-fluid mt-4 pb-5 page-fill d-flex align-items-center justify-content-center px-3 px-md-4">
        <div className="alert alert-warning border shadow-sm rounded-4 p-4 text-center" role="alert" style={{ maxWidth: 520 }}>
          <h5 className="mb-2">No disponible en celulares</h5>
          <p className="mb-0 text-secondary">
            Este portal solo puede usarse desde <strong>PC</strong> o <strong>tablet</strong>.
          </p>
        </div>
      </div>
    );
  }

  /* ====== Chips de estado ====== */
  const EstadoTabs = () => (
    <div className="d-flex flex-wrap gap-2">
      <button
        type="button"
        className={`btn btn-chip ${estadoTab === 'todos' ? 'active' : ''}`}
        onClick={() => setEstadoTab('todos')}
        title="Todos"
      >
        Todos
      </button>
      <button
        type="button"
        className={`btn btn-chip chip-cancelado ${estadoTab === 'cancelado' ? 'active' : ''}`}
        onClick={() => setEstadoTab('cancelado')}
        title="Solo cancelados"
      >
        cancelado
      </button>
      <button
        type="button"
        className={`btn btn-chip chip-no-cancelado ${estadoTab === 'no_cancelado' ? 'active' : ''}`}
        onClick={() => setEstadoTab('no_cancelado')}
        title="No cancelados"
      >
        no cancelado
      </button>
    </div>
  );

  const showEstadoTabs = hasSearched && datos.length > 0;

  /* ====== UI ====== */
  return (
    <div
      className="container-fluid mt-4 mt-md-5 pb-3 page-fill bg-app px-3 px-md-4"
      style={{ marginTop: 'clamp(12px, 2vh, 28px)' }}
    >
      {/* Toolbar */}
      <div className="card shadow-sm border-0 rounded-4 mb-3 gradient-toolbar glass-card glass-card--ultra">
        <div className="card-body d-flex flex-column gap-3">
          <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-2">
            <div className="d-flex align-items-center gap-3">
              <h2 className="text-bia fw-bold mb-0 d-flex align-items-center gap-2">
                Mostrar datos
              </h2>
              {rows.length > 0 && (
                <span className="badge text-bg-light border">
                  {rows.length} resultado{rows.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={handleExportTodo}
                title="Exportar todo (toda la base)"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" className="me-1" aria-hidden="true">
                  <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Exportar Todo
              </button>

              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={handleExportTodoDNI}
                disabled={!datos.length}
                title="Exportar lo visible del DNI/ID actual"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" className="me-1" aria-hidden="true">
                  <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Exportar Todo DNI
              </button>

              <BackToHomeButton>Volver a home</BackToHomeButton>
            </div>
          </div>

          {/* Búsqueda + vista */}
          <form onSubmit={handleSubmit} className="d-flex flex-wrap align-items-center justify-content-between gap-2">
            <div
              className="w-100 rounded-4"
              style={{
                maxWidth: 'min(720px, 100%)',
                background: '#fff',
                border: '1px solid rgba(16,24,40,.08)',
                boxShadow: '0 0 0 4px rgba(29,72,166,.10), 0 10px 24px rgba(16,24,40,.10)',
                padding: 8
              }}
            >
              <div className="input-group">
                <input
                  id="busqueda"
                  type="text"
                  className="form-control"
                  placeholder="DNI o ID pago único"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
                <button className="btn btn-bia" type="submit" disabled={loading}>
                  {loading && <span className="spinner-border spinner-border-sm me-2" />}
                  {loading ? 'Buscando…' : 'Buscar'}
                </button>
              </div>
            </div>

            {/* Botones de vista */}
            <div className="btn-group btn-group-sm" role="group" aria-label="Vista">
              <button
                type="button"
                className={`btn ${view === 'table' ? 'btn-bia' : 'btn-outline-bia'}`}
                onClick={() => setView('table')}
                title="Vista tabla"
              >
                Tabla
              </button>
              <button
                type="button"
                className={`btn ${view === 'cards' ? 'btn-bia' : 'btn-outline-bia'}`}
                onClick={() => setView('cards')}
                title="Vista tarjetas"
              >
                Tarjetas
              </button>
            </div>
          </form>

          {/* Pestañas por estado */}
          {showEstadoTabs && <EstadoTabs />}
        </div>
      </div>

      {/* Mensajes */}
      {error && hasSearched && <div className="alert alert-danger">{error}</div>}
      {!loading && !error && hasSearched && rows.length === 0 && (
        <div className="alert alert-light border d-flex align-items-center gap-2">
          <span></span> No hay resultados para “{query}”.
        </div>
      )}

      {/* Resultados – Tarjetas */}
      {!loading && rows.length > 0 && view === 'cards' && (
        <div className="row g-3">
          {rows.map(row => {
            const ok = isCancelado(row.estado);
            return (
              <div key={row.id} className="col-12 col-md-6 col-xl-4">
                <div
                  className={`card shadow-sm border-0 rounded-4 h-100 card-hover ${ok ? 'card-accent-ok' : 'card-accent-bad'}`}
                  onClick={() => openRow(row)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRow(row); }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="card-body d-flex flex-column gap-2">
                    <div className="d-flex align-items-start justify-content-between gap-2">
                      <div>
                        <div className="fw-semibold">{row.nombre_apellido ?? row.nombre_y_apellido ?? '—'}</div>
                        <div className="text-secondary small">DNI: {row.dni ?? '—'}</div>
                      </div>
                      <EstadoPill value={row.estado} />
                    </div>

                    <div className="row g-2 small mt-1">
                      <div className="col-6" onClick={(e) => { e.stopPropagation(); openRow(row, 'id_pago_unico'); }} role="button" tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openRow(row, 'id_pago_unico'); } }}
                        style={{ cursor: 'pointer' }}>
                        <div className="text-secondary">ID pago único</div>
                        <div className="fw-medium">{row.id_pago_unico ?? row.idpago_unico ?? '—'}</div>
                      </div>
                      <div className="col-6" onClick={(e) => { e.stopPropagation(); openRow(row, 'entidadinterna'); }} role="button" tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openRow(row, 'entidadinterna'); } }}
                        style={{ cursor: 'pointer' }}>
                        <div className="text-secondary">Entidad</div>
                        <div className="fw-medium">{row.entidadinterna ?? row.entidad_interna ?? '—'}</div>
                      </div>
                    </div>

                    <div className="mt-2 d-flex justify-content-between gap-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <button className="btn btn-sm btn-outline-bia" onClick={() => openRow(row)}>Editar</button>
                      ) : (
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => openRow(row)}>Ver</button>
                      )}
                      <div className="d-flex gap-2">
                        {row.cancelado && (
                          <button
                            className="btn btn-sm btn-outline-primary"
                            title="Descargar Libre de Deuda (PDF)"
                            onClick={() => descargarPDF(row.id_pago_unico, row.dni)}
                          >
                            PDF
                          </button>
                        )}
                        {canDelete && (
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleDelete(row.id)}
                            disabled={deletingId === row.id}
                          >
                            {deletingId === row.id ? 'Eliminando…' : 'Eliminar'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Resultados – Tabla */}
      {!loading && rows.length > 0 && view === 'table' && (
        <div className="card shadow-sm border-0 rounded-4">
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0 bia-grid table-colored">
                <thead className="thead-sticky">
                  <tr>
                    {visibleCols.map((k, idx) => (
                      <th key={k} className={idx === 0 ? 'sticky-first bg-white' : ''}>{pretty(k)}</th>
                    ))}
                    <th className="text-end sticky-actions bg-white">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const ok = isCancelado(row.estado);
                    return (
                      <tr
                        key={row.id}
                        className={`row-hover-actions row-clickable ${ok ? 'row-ok' : 'row-bad'}`}
                        onClick={() => openRow(row)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRow(row); }
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        {visibleCols.map((k, idx) => (
                          <td
                            key={k}
                            className={idx === 0 ? 'sticky-first bg-white' : ''}
                            onClick={(e) => { e.stopPropagation(); openRow(row, k); }}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openRow(row, k); }
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            <Cell k={k} v={row[k]} />
                          </td>
                        ))}
                        <td className="text-end sticky-actions bg-white" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                          <div className="d-flex gap-2 justify-content-end">
                            {row.cancelado && (
                              <button
                                className="btn btn-sm btn-outline-primary"
                                title="Descargar Libre de Deuda (PDF)"
                                onClick={() => descargarPDF(row.id_pago_unico, row.dni)}
                              >
                                PDF
                              </button>
                            )}
                            {canEdit ? (
                              <button className="btn btn-sm btn-outline-bia" onClick={() => openRow(row)}>
                                Editar
                              </button>
                            ) : (
                              <button className="btn btn-sm btn-outline-secondary" onClick={() => openRow(row)}>
                                Ver
                              </button>
                            )}
                            {canDelete && (
                              <button
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => handleDelete(row.id)}
                                disabled={deletingId === row.id}
                              >
                                {deletingId === row.id ? 'Eliminando…' : 'Eliminar'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Drawer lateral (Detalles) */}
      <div className={`side-drawer ${drawerOpen ? 'open' : ''}`}>
        {/* Header */}
        <div className="side-drawer-header" style={{ background: 'linear-gradient(90deg, rgba(29,72,166,.06), rgba(29,72,166,0))' }}>
          <div className="d-flex align-items-center justify-content-between">
            <div className="d-flex flex-column">
              <strong className="fs-6">{activeRow?.nombre_apellido ?? activeRow?.nombre_y_apellido ?? 'Detalle'}</strong>
              <small className="text-secondary">
                DNI: {activeRow?.dni ?? '—'} • ID: {activeRow?.id_pago_unico ?? activeRow?.idpago_unico ?? '—'}
              </small>
            </div>
            {activeRow && <EstadoPill value={activeRow?.estado} />}
          </div>
        </div>

        {/* Body */}
        <div className="side-drawer-body">
          {activeRow && (
            <div className="row g-3">
              {columnas.map((k) => {
                const editable = isFieldEditable(k);
                const value = (formData[k] ?? '').toString();

                return (
                  <div key={k} className={`col-12 col-md-6`}>
                    <div className={`form-floating ${focusKey === k ? 'flash-highlight' : ''}`}>
                      <input
                        type="text"
                        className="form-control"
                        value={value}
                        onChange={e => onChangeForm(k, e.target.value)}
                        readOnly={!editable}
                        placeholder=" "
                        ref={(el) => { if (el) fieldRefs.current[k] = el; }}
                      />
                      <label className="text-secondary">
                        {pretty(k)}{(!editable && (k === 'id' || k === 'id_pago_unico' || k === 'idpago_unico')) ? ' (no editable)' : ''}
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="side-drawer-footer">
          <div className="d-flex justify-content-between w-100">
            {canWrite ? (
              <>
                <button className="btn btn-outline-bia" onClick={closeDrawer} disabled={saving}>Cancelar</button>
                <button className="btn btn-bia" onClick={saveRow} disabled={saving || !hasChanges}>
                  {saving && <span className="spinner-border spinner-border-sm me-2" />}
                  Guardar cambios
                </button>
              </>
            ) : (
              <div className="text-secondary small">Solo lectura (tu rol no puede editar).</div>
            )}
          </div>
        </div>
      </div>
      {drawerOpen && <div className="backdrop" onClick={closeDrawer} />}
    </div>
  );
}
