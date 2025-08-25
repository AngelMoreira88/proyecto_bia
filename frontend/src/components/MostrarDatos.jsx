// frontend/src/components/MostrarDatos.jsx
import React, { useMemo, useState } from 'react';
import {
  listarDatosBia,
  actualizarDatoBia,
  exportarDatosBiaCSV,
} from '../services/api';

export default function Mostrar() {
  const [query, setQuery] = useState('');
  const [datos, setDatos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});

  // columnas: unión de claves de todas las filas (id primero si existe)
  const columnas = useMemo(() => {
    const s = new Set();
    for (const row of datos) Object.keys(row || {}).forEach(k => s.add(k));
    const arr = Array.from(s);
    return arr.includes('id') ? ['id', ...arr.filter(c => c !== 'id')] : arr;
  }, [datos]);

  const NO_EDITABLES = new Set(['id']); // agregá más si hace falta, ej. 'id_pago_unico'

  // Fila original que se está editando (si existe)
  const originalRow = useMemo(
    () => datos.find(d => d.id === editingId) || null,
    [datos, editingId]
  );

  // Detectar cambios reales vs original
  const hasChanges = useMemo(() => {
    if (!originalRow) return false;
    for (const k of Object.keys(formData)) {
      if ((formData[k] ?? '') !== (originalRow[k] ?? '')) return true;
    }
    return false;
  }, [formData, originalRow]);

  // Mostrar botón cabecera solo si el query coincide con el DNI de la fila editada
  const dniCoincide = useMemo(() => {
    if (!originalRow) return false;
    const q = String(query).trim();
    const dni = String(originalRow?.dni ?? '').trim();
    return q.length > 0 && dni.length > 0 && q === dni;
  }, [query, originalRow]);

  // Normaliza payload a array de filas
  const normalizeResults = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.results)) return payload.results;
    if (payload && Array.isArray(payload.items)) return payload.items;
    return [];
  };

  // Buscar por DNI o id_pago_unico
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

      // Garantiza un 'id' siempre presente (usa id_pago_unico si no hay id)
      const data = results.map(r => ({ id: r.id ?? r.id_pago_unico, ...r }));

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

  // Exporta TODOS los datos (sin filtros) como CSV
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

  return (
    <div className="container" style={{ marginTop: '100px', paddingBottom: '24px' }}>
      {/* Encabezado */}
      <div className="mb-3">
        <h2 className="text-bia fw-bold mb-1">Listar por DNI</h2>
        <small className="text-secondary">
          Consultá por DNI o ID de pago único.
        </small>
      </div>

      {/* Card principal */}
      <div className="card shadow-sm border-0 rounded-4">
        <div className="card-header bg-bia-subtle border-bia rounded-top-4">
          <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between">
            <strong className="text-bia m-0">Búsqueda</strong>

            {/* Acciones de cabecera (derecha) */}
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={handleExportCsv}
                title="Descargar todos los registros en CSV"
              >
                Exportar CSV
              </button>

              {/* Botón global de Guardar (solo si: editando + hay cambios + DNI coincide con el query) */}
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
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1 }} className="table-light">
                      <tr>
                        {columnas.map(col => (
                          <th key={col} className="text-nowrap">{col}</th>
                        ))}
                        <th className="text-end">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.map(row => (
                        <tr key={row.id ?? JSON.stringify(row)}>
                          {columnas.map((field) => (
                            <td key={field} className="text-nowrap">
                              {editingId === row.id && !NO_EDITABLES.has(field) ? (
                                <input
                                  type="text"
                                  className="form-control form-control-sm"
                                  value={formData[field] ?? ''}
                                  onChange={e => handleChange(field, e.target.value)}
                                />
                              ) : (
                                String(row[field] ?? '—')
                              )}
                            </td>
                          ))}
                          <td className="text-end">
                            {editingId === row.id ? (
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
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button
                                className="btn btn-sm btn-outline-bia"
                                onClick={() => handleEdit(row)}
                              >
                                Editar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
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
