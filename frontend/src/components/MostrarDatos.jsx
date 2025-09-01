import React, { useMemo, useState } from 'react';
import {
  listarDatosBia,
  actualizarDatoBia,
  exportarDatosBiaCSV,
  eliminarDatoBia,
} from '../services/api';
import { getUserRole } from '../services/auth';
import { useNavigate } from 'react-router-dom';

export default function Mostrar() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [datos, setDatos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});

  const isAdmin = getUserRole() === 'admin';

  // Etiquetas más humanas
  const LABELS = {
    id: 'ID',
    id_pago_unico: 'ID pago único',
    propietario: 'Propietario',
    entidadinterna: 'Entidad interna',
    estado: 'Estado',
    dni: 'DNI',
  };

  // Columnas (id primero si existe)
  const columnas = useMemo(() => {
    const s = new Set();
    for (const row of datos) Object.keys(row || {}).forEach(k => s.add(k));
    const arr = Array.from(s);
    return arr.includes('id') ? ['id', ...arr.filter(c => c !== 'id')] : arr;
  }, [datos]);

  const NO_EDITABLES = new Set(['id']);

  const originalRow = useMemo(
    () => datos.find(d => d.id === editingId) || null,
    [datos, editingId]
  );

  const hasChanges = useMemo(() => {
    if (!originalRow) return false;
    for (const k of Object.keys(formData)) {
      if ((formData[k] ?? '') !== (originalRow[k] ?? '')) return true;
    }
    return false;
  }, [formData, originalRow]);

  const dniCoincide = useMemo(() => {
    if (!originalRow) return false;
    const q = String(query).trim();
    const dni = String(originalRow?.dni ?? '').trim();
    return q.length > 0 && dni.length > 0 && q === dni;
  }, [query, originalRow]);

  const normalizeResults = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.results)) return payload.results;
    if (payload && Array.isArray(payload.items)) return payload.items;
    return [];
  };

  const handleBuscar = async (e) => {
    e.preventDefault();
    setError('');
    setDatos([]);
    setEditingId(null);
    setFormData({});

    const q = String(query).trim();
    if (!q) {
      setError('Ingresá un DNI o ID válido');
      return;
    }

    setLoading(true);
    try {
      const res = await listarDatosBia({ dni: q, id_pago_unico: q, page: 1 });
      const payload = res.data || {};
      const results = normalizeResults(payload);
      const data = results.map(r => ({ id: r.id ?? r.id_pago_unico, ...r })); // aseguro 'id'

      setDatos(data);
      if ((payload.count ?? data.length) === 0) setError('No se encontraron registros');
    } catch (err) {
      console.error(err);
      setError('Error al consultar la base de datos');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (row) => {
    setEditingId(row.id);
    setFormData({ ...row });
    setError('');
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData({});
  };

  const getChangedFields = () => {
    if (!originalRow) return {};
    const changed = {};
    Object.keys(formData).forEach((k) => {
      if ((formData[k] ?? '') !== (originalRow[k] ?? '') && !NO_EDITABLES.has(k)) {
        changed[k] = formData[k];
      }
    });
    return changed;
  };

  const handleSave = async (id) => {
    setError('');
    const changes = getChangedFields();
    if (!Object.keys(changes).length) {
      setEditingId(null);
      return;
    }
    setSaving(true);
    try {
      await actualizarDatoBia(id, changes); // PATCH
      setDatos(prev => prev.map(d => (d.id === id ? { ...d, ...changes } : d)));
      setEditingId(null);
      setFormData({});
    } catch (err) {
      console.error(err);
      setError('Error al guardar los cambios');
    } finally {
      setSaving(false);
    }
  };

  // Exportar CSV
  const handleExportCsv = async () => {
    try {
      const res = await exportarDatosBiaCSV(); // GET blob
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `db_bia_${new Date().toISOString().replace(/[-:T.Z]/g,'').slice(0,14)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setError('No se pudo exportar el CSV');
    }
  };

  // Eliminar (solo admins)
  const handleDelete = async (id) => {
    if (!isAdmin) return;
    const row = datos.find(d => d.id === id);
    const refText = row?.id_pago_unico || id;
    if (!window.confirm(`¿Eliminar el registro ${refText}? Esta acción no se puede deshacer.`)) return;

    setError('');
    setDeletingId(id);
    try {
      await eliminarDatoBia(id);   // DELETE /api/db_bia/:id/
      setDatos(prev => prev.filter(d => d.id !== id));
      if (editingId === id) {
        setEditingId(null);
        setFormData({});
      }
    } catch (err) {
      console.error(err);
      setError('No se pudo eliminar el registro');
    } finally {
      setDeletingId(null);
    }
  };

  // ---------- UI helpers ----------
  const prettyLabel = (col) => LABELS[col] || col;

  const EstadoPill = ({ value }) => {
    const v = String(value || '').trim().toLowerCase();
    const map = {
      cancelado: 'success',
      pendiente: 'warning',
      error: 'danger',
      rechazado: 'danger',
      correcto: 'success',
      incompleto: 'secondary',
    };
    const cls = map[v] || 'secondary';
    const text = value ?? '—';
    return <span className={`badge rounded-pill bg-${cls}`}>{text}</span>;
  };

  const CellValue = ({ field, value }) => {
    if (field === 'estado') return <EstadoPill value={value} />;
    const val = value ?? '—';
    return (
      <span className="truncate-200" title={String(val)}>
        {String(val)}
      </span>
    );
  };

  return (
    <div className="container pb-3 page-fill bg-app">
      {/* Encabezado */}
      <div className="mb-3 d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2">
        <div>
          <h2 className="text-bia fw-bold mb-1">Listar por DNI</h2>
          <small className="text-secondary">
            Consultá por DNI o ID de pago único.
          </small>
        </div>
        {datos.length > 0 && (
          <div className="text-secondary small">
            {datos.length} resultado{datos.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Card principal — crece según contenido */}
      <div className="card shadow-sm border-0 rounded-4">
        <div className="card-header bg-bia-subtle border-bia rounded-top-4">
          <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between">
            <strong className="text-bia m-0">Búsqueda</strong>
            <div className="d-flex gap-2">
              {/* Exportar CSV */}
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={handleExportCsv}
                title="Descargar todos los registros en CSV"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" className="me-1" aria-hidden="true">
                  <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Exportar CSV
              </button>

              {/* Volver (al lado de Exportar CSV) */}
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => navigate(-1)}
                title="Volver a la página anterior"
              >
                ◀ Volver
              </button>

              {editingId !== null && hasChanges && dniCoincide && (
                <button
                  className="btn btn-sm btn-bia"
                  onClick={() => handleSave(editingId)}
                  disabled={saving}
                  title="Guardar cambios de la fila editada"
                >
                  {saving && <span className="spinner-border spinner-border-sm me-2" />}
                  Guardar cambios
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="card-body">
          {/* Buscador */}
          <form onSubmit={handleBuscar} className="row g-2">
            <div className="col-12 col-sm-8">
              <div className="form-floating">
                <input
                  id="query"
                  type="text"
                  className="form-control"
                  placeholder="DNI o id_pago_unico"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
                <label htmlFor="query">DNI o id_pago_unico</label>
              </div>
            </div>
            <div className="col-12 col-sm-4 d-grid">
              <button className="btn btn-bia" disabled={loading}>
                {loading && <span className="spinner-border spinner-border-sm me-2" />}
                {loading ? 'Buscando…' : 'Buscar'}
              </button>
            </div>
          </form>

          {/* Error */}
          {error && (
            <div className="alert alert-danger mt-3 mb-0" role="alert">
              {error}
            </div>
          )}

          {/* Resultados */}
          {datos.length > 0 && (
            <div className="card mt-4 border-0">
              <div className="card-body p-0">
                <div className="table-responsive">
                  <table className="table table-sm table-hover align-middle mb-0">
                    <thead className="table-light thead-sticky">
                      <tr>
                        {columnas.map(col => (
                          <th key={col} className="text-nowrap">{prettyLabel(col)}</th>
                        ))}
                        <th className="text-end sticky-actions">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.map(row => {
                        const isEditing = editingId === row.id;
                        const isDeleting = deletingId === row.id;
                        return (
                          <tr key={row.id ?? JSON.stringify(row)} className={isEditing ? 'table-active' : ''}>
                            {columnas.map((field) => (
                              <td key={field} className="text-nowrap">
                                {isEditing && !NO_EDITABLES.has(field) ? (
                                  <input
                                    type="text"
                                    className="form-control form-control-sm"
                                    value={formData[field] ?? ''}
                                    onChange={e => handleChange(field, e.target.value)}
                                  />
                                ) : (
                                  <CellValue field={field} value={row[field]} />
                                )}
                              </td>
                            ))}
                            <td className="text-end sticky-actions bg-white">
                              {isEditing ? (
                                <div className="d-flex gap-2 justify-content-end">
                                  <button
                                    className="btn btn-sm btn-bia"
                                    onClick={() => handleSave(row.id)}
                                    disabled={saving || !hasChanges}
                                    title={!hasChanges ? 'No hay cambios para guardar' : 'Guardar'}
                                  >
                                    {saving && <span className="spinner-border spinner-border-sm me-2" />}
                                    Guardar
                                  </button>
                                  <button
                                    className="btn btn-sm btn-outline-bia"
                                    onClick={handleCancel}
                                    disabled={saving}
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              ) : (
                                <div className="d-flex gap-2 justify-content-end">
                                  <button
                                    className="btn btn-sm btn-outline-bia"
                                    onClick={() => handleEdit(row)}
                                    disabled={isDeleting}
                                  >
                                    Editar
                                  </button>
                                  {isAdmin && (
                                    <button
                                      className="btn btn-sm btn-outline-danger"
                                      onClick={() => handleDelete(row.id)}
                                      disabled={isDeleting}
                                      title="Eliminar registro"
                                    >
                                      {isDeleting ? (
                                        <>
                                          <span className="spinner-border spinner-border-sm me-2" />
                                          Eliminando…
                                        </>
                                      ) : (
                                        'Eliminar'
                                      )}
                                    </button>
                                  )}
                                </div>
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
          )}

          {/* Sin resultados */}
          {!loading && !error && query && datos.length === 0 && (
            <div className="text-secondary small mt-3">
              No hay resultados para “{query}”.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
