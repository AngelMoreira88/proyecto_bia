// src/components/MostrarDatosPro.jsx
import React, { useMemo, useState } from 'react';
import {
  listarDatosBia,
  actualizarDatoBia,
  exportarDatosBiaCSV,
  eliminarDatoBia,
} from '../services/api';
import { getUserRole } from '../services/auth';
import BackToHomeButton from './BackToHomeButton';

export default function MostrarDatosPro() {
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
  const isAdmin = getUserRole() === 'admin';

  // Columnas visibles en la tabla (y orden de lectura)
  const VISIBLE_COLUMNS = [
    'id_pago_unico', 'dni', 'nombre_apellido', 'estado',
    'entidadinterna', 'creditos', 'fecl', 'total_plan'
  ];

  // Esquema base + extras para Drawer/Export DNI
  const MASTER_COLUMNS = [
    ...VISIBLE_COLUMNS,
    'propietario', 'entidadoriginal', 'grupo', 'tramo',
    'comision', 'interes_total', 'fecha_apertura', 'cuit'
  ];

  const LABELS = {
    id: 'ID',
    id_pago_unico: 'ID pago único',
    dni: 'DNI',
    nombre_apellido: 'Nombre y apellido',
    estado: 'Estado',
    entidadinterna: 'Entidad interna',
    propietario: 'Propietario',
    entidadoriginal: 'Entidad original',
    grupo: 'Grupo',
    tramo: 'Tramo',
    creditos: 'Créditos',
    comision: 'Comisión',
    total_plan: 'Total plan',
    saldo_capital: 'Saldo capital',
    interes_total: 'Interés total',
    fecl: 'FECL',
    fecha_apertura: 'Fecha apertura',
    cuit: 'CUIT',
  };
  const pretty = (k) => LABELS[k] || k;

  // --- helpers de estado ---
  const isCancelado = (v) => String(v || '').trim().toLowerCase() === 'cancelado';
  const estadoBucket = (v) => (isCancelado(v) ? 'cancelado' : 'no_cancelado');

  // Columnas reales + extras detectadas en resultados
  const columnas = useMemo(() => {
    const seen = new Set();
    for (const row of datos) Object.keys(row || {}).forEach(k => seen.add(k));
    const extras = Array.from(seen).filter(k => !MASTER_COLUMNS.includes(k));
    return MASTER_COLUMNS.concat(extras);
  }, [datos]);

  // Pill de estado: verde si cancelado, rojo si no
  const EstadoPill = ({ value }) => {
    const cls = isCancelado(value) ? 'success' : 'danger';
    const text = value ?? '—';
    return <span className={`badge rounded-pill bg-${cls}`}>{text}</span>;
  };

  const Cell = ({ k, v }) => {
    if (k === 'estado') return <EstadoPill value={v} />;
    const val = v ?? '—';
    return <span className="truncate-200" title={String(val)}>{String(val)}</span>;
  };

  const normalizeResults = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.results)) return payload.results;
    if (payload && Array.isArray(payload.items)) return payload.items;
    return [];
  };

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
      const res = await listarDatosBia({ dni: q, id_pago_unico: q, page: 1 });
      const payload = res.data || {};
      const results = normalizeResults(payload);
      const data = results.map(r => ({ id: r.id ?? r.id_pago_unico, ...r }));
      setDatos(data);
      if ((payload.count ?? data.length) === 0) setError('No se encontraron registros');
    } catch (e) {
      console.error(e);
      setError('Error al consultar la base de datos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => { e.preventDefault(); doSearch(); };

  const openRow = (row) => { setActiveRow(row); setFormData({ ...row }); setDrawerOpen(true); };
  const closeDrawer = () => { setDrawerOpen(false); setActiveRow(null); setFormData({}); };
  const onChangeForm = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  const hasChanges = useMemo(() => {
    if (!activeRow) return false;
    return Object.keys(formData).some(k => (formData[k] ?? '') !== (activeRow[k] ?? ''));
  }, [formData, activeRow]);

  const saveRow = async () => {
    if (!activeRow) return;
    const changes = {};
    Object.keys(formData).forEach((k) => {
      if ((formData[k] ?? '') !== (activeRow[k] ?? '')) changes[k] = formData[k];
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

  const handleDelete = async (id) => {
    if (!isAdmin) return;
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

  // ====== FILTRO + ORDEN ======
  // 1) filtro por pestaña (todos | cancelado | no_cancelado)
  const filtered = useMemo(() => {
    if (estadoTab === 'todos') return datos;
    return datos.filter(d => estadoBucket(d.estado) === estadoTab);
  }, [datos, estadoTab]);

  // 2) orden: primero "no_cancelado", luego "cancelado" (estable)
  const rows = useMemo(() => {
    const arr = filtered.map((r, idx) => ({ r, idx }));
    const weight = (x) => (estadoBucket(x.r.estado) === 'no_cancelado' ? 0 : 1);
    arr.sort((a, b) => {
      const w = weight(a) - weight(b);
      if (w !== 0) return w;
      const na = String(a.r.nombre_apellido ?? '').localeCompare(String(b.r.nombre_apellido ?? ''), 'es', { sensitivity: 'base' });
      if (na !== 0) return na;
      return a.idx - b.idx;
    });
    return arr.map(x => x.r);
  }, [filtered]);

  // ====== EXPORTES ======
  const toCsvValue = (val) => {
    const s = val == null ? '' : String(val);
    const needs = /[",\n\r]/.test(s);
    const esc = s.replace(/"/g, '""');
    return needs ? `"${esc}"` : esc;
  };

  // Exporta TODO (API completa)
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

  // Exporta TODO del DNI/ID actual (todas las filas y columnas disponibles del resultado)
  const handleExportTodoDNI = () => {
    if (!datos.length) { alert('Realizá una búsqueda primero.'); return; }
    const cols = columnas; // todas las columnas detectadas para este resultado
    const headers = cols.map(pretty).join(',');
    const lines = datos.map(r => cols.map(c => toCsvValue(r[c])).join(','));
    const csv = '\uFEFF' + [headers, ...lines].join('\r\n'); // BOM para Excel
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

  // UI – pestañas de estado
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

  return (
    <div className="container pb-3 page-fill bg-app">
      {/* Toolbar */}
      <div className="card shadow-sm border-0 rounded-4 mb-3 gradient-toolbar">
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
                title="Exportar todo del DNI/ID actual (todas las columnas)"
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
            {/* Input más corto con botón pegado */}
            <div className="input-group" style={{ maxWidth: 460 }}>
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

            {/* Botones de vista más pequeños */}
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
          <EstadoTabs />
        </div>
      </div>

      {/* Mensajes */}
      {error && hasSearched && <div className="alert alert-danger">{error}</div>}
      {!loading && !error && hasSearched && rows.length === 0 && (
        <div className="alert alert-light border d-flex align-items-center gap-2">
          <span>😕</span> No hay resultados para “{query}”.
        </div>
      )}

      {/* Resultados – Tarjetas */}
      {!loading && rows.length > 0 && view === 'cards' && (
        <div className="row g-3">
          {rows.map(row => {
            const ok = isCancelado(row.estado);
            return (
              <div key={row.id} className="col-12 col-md-6 col-xl-4">
                <div className={`card shadow-sm border-0 rounded-4 h-100 card-hover ${ok ? 'card-accent-ok' : 'card-accent-bad'}`}>
                  <div className="card-body d-flex flex-column gap-2">
                    <div className="d-flex align-items-start justify-content-between gap-2">
                      <div>
                        <div className="fw-semibold">{row.nombre_apellido ?? '—'}</div>
                        <div className="text-secondary small">DNI: {row.dni ?? '—'}</div>
                      </div>
                      <EstadoPill value={row.estado} />
                    </div>

                    <div className="row g-2 small mt-1">
                      <div className="col-6">
                        <div className="text-secondary">ID pago único</div>
                        <div className="fw-medium">{row.id_pago_unico ?? '—'}</div>
                      </div>
                      <div className="col-6">
                        <div className="text-secondary">Entidad</div>
                        <div className="fw-medium">{row.entidadinterna ?? '—'}</div>
                      </div>
                      <div className="col-6">
                        <div className="text-secondary">Créditos</div>
                        <div className="fw-medium">{row.creditos ?? '—'}</div>
                      </div>
                      <div className="col-6">
                        <div className="text-secondary">FECL</div>
                        <div className="fw-medium">{row.fecl ?? '—'}</div>
                      </div>
                    </div>

                    <div className="mt-2 d-flex justify-content-between gap-2">
                      <button className="btn btn-sm btn-outline-bia" onClick={() => openRow(row)}>Ver detalle</button>
                      {isAdmin && (
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
                    {VISIBLE_COLUMNS.map((k, idx) => (
                      <th key={k} className={idx === 0 ? 'sticky-first' : ''}>{pretty(k)}</th>
                    ))}
                    <th className="text-end sticky-actions">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const ok = isCancelado(row.estado);
                    return (
                      <tr key={row.id} className={`row-hover-actions ${ok ? 'row-ok' : 'row-bad'}`}>
                        {VISIBLE_COLUMNS.map((k, idx) => (
                          <td key={k} className={idx === 0 ? 'sticky-first bg-white' : ''}>
                            <Cell k={k} v={row[k]} />
                          </td>
                        ))}
                        <td className="text-end sticky-actions bg-white">
                          <div className="d-flex gap-2 justify-content-end">
                            <button className="btn btn-sm btn-outline-bia" onClick={() => openRow(row)}>Detalle</button>
                            {isAdmin && (
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

      {/* Drawer lateral */}
      <div className={`side-drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="side-drawer-header">
          <div className="d-flex align-items-center justify-content-between">
            <div className="d-flex flex-column">
              <strong>{activeRow?.nombre_apellido ?? 'Detalle'}</strong>
              <small className="text-secondary">DNI: {activeRow?.dni ?? '—'} • ID: {activeRow?.id_pago_unico ?? '—'}</small>
            </div>
            <button className="btn btn-sm btn-outline-secondary" onClick={closeDrawer}>Cerrar</button>
          </div>
        </div>
        <div className="side-drawer-body">
          {activeRow && (
            <div className="row g-3">
              {columnas.map((k) => (
                <div key={k} className="col-12 col-md-6">
                  <label className="form-label small text-secondary mb-1">{pretty(k)}</label>
                  {k === 'estado' ? (
                    <select
                      className="form-select"
                      value={formData[k] ?? ''}
                      onChange={e => onChangeForm(k, e.target.value)}
                    >
                      <option value="">—</option>
                      <option value="cancelado">cancelado</option>
                      <option value="pendiente">pendiente</option>
                      <option value="correcto">correcto</option>
                      <option value="incompleto">incompleto</option>
                      <option value="rechazado">rechazado</option>
                      <option value="error">error</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="form-control"
                      value={formData[k] ?? ''}
                      onChange={e => onChangeForm(k, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="side-drawer-footer">
          <div className="d-flex justify-content-between w-100">
            {isAdmin ? (
              <>
                <button className="btn btn-outline-bia" onClick={closeDrawer} disabled={saving}>Cancelar</button>
                <button className="btn btn-bia" onClick={saveRow} disabled={saving || !hasChanges}>
                  {saving && <span className="spinner-border spinner-border-sm me-2" />}
                  Guardar cambios
                </button>
              </>
            ) : (
              <div className="text-secondary small">No tenés permisos para editar.</div>
            )}
          </div>
        </div>
      </div>
      {drawerOpen && <div className="backdrop" onClick={closeDrawer} />}
    </div>
  );
}
