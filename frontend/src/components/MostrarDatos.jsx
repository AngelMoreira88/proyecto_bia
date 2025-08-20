// frontend/src/components/Mostrar.jsx
import React, { useMemo, useState } from 'react';
import api from '../services/api';

export default function Mostrar() {
  const [query, setQuery] = useState('');
  const [datos, setDatos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData]   = useState({});

  // columnas: unión de claves de todas las filas (id primero si existe)
  const columnas = useMemo(() => {
    const s = new Set();
    for (const row of datos) Object.keys(row || {}).forEach(k => s.add(k));
    const arr = Array.from(s);
    return arr.includes('id') ? ['id', ...arr.filter(c => c !== 'id')] : arr;
  }, [datos]);

  const NO_EDITABLES = new Set(['id']);

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

  // Buscar por DNI o id_pago_unico
  const handleBuscar = async (e) => {
    e.preventDefault();
    setError('');
    setDatos([]);
    setEditingId(null);
    setFormData({});
    if (!query.trim()) {
      setError('Ingresá un DNI o ID válido');
      return;
    }
    setLoading(true);
    try {
      const res = await api.get('/api/mostrar-datos-bia/', {
        params: { dni: query, id_pago_unico: query },
      });
      const data = Array.isArray(res.data) ? res.data : [];
      setDatos(data);
      if (data.length === 0) setError('No se encontraron registros');
    } catch {
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

  const handleSave = async (id) => {
    setError('');
    setSaving(true);
    try {
      await api.put(`/api/mostrar-datos-bia/${id}/`, formData);
      setDatos(prev => prev.map(d => (d.id === id ? { ...formData } : d)));
      setEditingId(null);
      setFormData({});
    } catch {
      setError('Error al guardar los cambios');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container" style={{ marginTop: '100px', paddingBottom: '24px' }}>
      {/* Encabezado */}
      <div className="mb-3">
        <h2 className="text-bia fw-bold mb-1">Listar por DNI</h2>
        <small className="text-secondary">
          Consultá por DNI o ID de pago único y, si corresponde, editá campos puntuales.
        </small>
      </div>

      {/* Card principal */}
      <div className="card shadow-sm border-0 rounded-4">
        <div className="card-header bg-bia-subtle border-bia rounded-top-4">
          <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between">
            <strong className="text-bia m-0">Búsqueda</strong>

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
