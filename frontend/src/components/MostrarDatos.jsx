// frontend/src/components/Mostrar.jsx
import React, { useState } from 'react';
import api from '../services/api';
import Header from './Header';

export default function Mostrar() {
  const [query, setQuery] = useState('');
  const [datos, setDatos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});

  // Busca datos por DNI o id_pago_unico
  const handleBuscar = async (e) => {
    e.preventDefault();
    setError('');
    setDatos([]);
    if (!query.trim()) {
      setError('Ingresá un DNI o ID válido');
      return;
    }
    setLoading(true);
    try {
      const res = await api.get('/api/mostrar-datos-bia/', {
        params: { dni: query, id_pago_unico: query }
      });
      setDatos(res.data);
      if (res.data.length === 0) {
        setError('No se encontraron registros');
      }
    } catch {
      setError('Error al consultar la base de datos');
    } finally {
      setLoading(false);
    }
  };

  // Pone la fila en modo edición
  const handleEdit = (row) => {
    setEditingId(row.id);
    setFormData({ ...row });
    setError('');
  };

  // Actualiza campo en edición
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Guarda cambios vía PUT
  const handleSave = async (id) => {
    setError('');
    try {
      await api.put(`/api/mostrar-datos-bia/${id}/`, formData);
      setDatos(datos.map(d => (d.id === id ? formData : d)));
      setEditingId(null);
    } catch {
      setError('Error al guardar los cambios');
    }
  };

  return (
    <>
      <Header />

      <div
        className="container d-flex flex-column align-items-center justify-content-center"
        style={{
          marginTop: '100px',
          height: 'calc(100vh - 100px)'
        }}
      >
        <div className="card shadow-sm w-100" style={{ maxWidth: 800 }}>
          <div className="card-body">
            <h3 className="card-title text-center text-primary mb-4">
              Mostrar / Editar Datos
            </h3>

            <form onSubmit={handleBuscar} className="d-flex gap-2 mb-4">
              <input
                type="text"
                className="form-control"
                placeholder="DNI o id_pago_unico"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              <button className="btn btn-primary" disabled={loading}>
                {loading ? 'Buscando...' : 'Buscar'}
              </button>
            </form>

            {error && (
              <div className="alert alert-danger w-100" role="alert">
                {error}
              </div>
            )}

            {datos.length > 0 && (
              <div className="table-responsive mt-3">
                <table className="table table-striped">
                  <thead>
                    <tr>
                      {Object.keys(datos[0]).map(col => (
                        <th key={col}>{col}</th>
                      ))}
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.map(row => (
                      <tr key={row.id}>
                        {Object.entries(row).map(([field, val]) => (
                          <td key={field}>
                            {editingId === row.id ? (
                              <input
                                type="text"
                                className="form-control form-control-sm"
                                value={formData[field] ?? ''}
                                onChange={e => handleChange(field, e.target.value)}
                              />
                            ) : (
                              val
                            )}
                          </td>
                        ))}
                        <td>
                          {editingId === row.id ? (
                            <>
                              <button
                                className="btn btn-sm btn-success me-2"
                                onClick={() => handleSave(row.id)}
                              >
                                Guardar
                              </button>
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => setEditingId(null)}
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn btn-sm btn-outline-primary"
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
            )}
          </div>
        </div>
      </div>
    </>
  );
}
