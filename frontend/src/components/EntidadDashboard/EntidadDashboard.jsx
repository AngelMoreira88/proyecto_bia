// frontend/src/components/EntidadDashboard/EntidadDashboard.jsx
import { useState } from 'react';
import { isLoggedIn } from '../../services/auth';
import api from '../../services/api';
import EntidadList from './EntidadList';

const ENTIDADES_BASE = '/api/certificado/entidades/';

export default function EntidadDashboard() {
  const [editingId, setEditingId] = useState(null);
  const [listKey, setListKey] = useState(0); // fuerza refresco de EntidadList tras guardar
  const [formData, setFormData] = useState({
    nombre: '',
    responsable: '',
    cargo: '',
    razon_social: '',
    logo: null,
    firma: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    setServerError('');
    setFormData((prev) => ({
      ...prev,
      [name]: files ? (files.length ? files[0] : null) : value,
    }));
  };

  const resetForm = () => {
    setFormData({
      nombre: '',
      responsable: '',
      cargo: '',
      razon_social: '',
      logo: null,
      firma: null,
    });
    setEditingId(null);
    setServerError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    // Construir FormData. Omitimos solo null/undefined (DRF trata '' como string vacío)
    const payload = new FormData();
    Object.entries(formData).forEach(([k, v]) => {
      if (v !== null && v !== undefined) payload.append(k, v);
    });

    const url = editingId ? `${ENTIDADES_BASE}${editingId}/` : ENTIDADES_BASE;
    const method = editingId ? 'patch' : 'post'; // PATCH parcial

    try {
      setSubmitting(true);
      setServerError('');
      await api({
        method,
        url,
        data: payload,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      resetForm();
      setListKey((n) => n + 1); // re-monta EntidadList → vuelve a hacer fetch
    } catch (err) {
      console.error(err);
      // Mostrar detalle de validación si viene de DRF
      const data = err?.response?.data;
      if (data && typeof data === 'object') {
        // convierte {campo: ["err1","err2"]} en texto legible
        const msg = Object.entries(data)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : String(v)}`)
          .join(' | ');
        setServerError(msg || 'No se pudo guardar la entidad.');
      } else {
        setServerError('No se pudo guardar la entidad.');
      }
      alert('No se pudo guardar la entidad.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (ent) => {
    setFormData({
      nombre: ent.nombre || '',
      responsable: ent.responsable || '',
      cargo: ent.cargo || '',
      razon_social: ent.razon_social || '',
      logo: null,  // no pre-cargamos archivos; si el user no toca, no se envía
      firma: null,
    });
    setEditingId(ent.id);
    const formEl = document.getElementById('entidad-form');
    if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleCancelEdit = () => resetForm();

  return (
    <div className="container py-3">
      {/* FORM: visible solo si el usuario está logueado */}
      {isLoggedIn() && (
        <div className="card mb-4 shadow-sm border-0 rounded-4" id="entidad-form">
          <div className="card-header d-flex justify-content-between align-items-center">
            <strong>{editingId ? 'Editar entidad' : 'Registrar nueva entidad'}</strong>
            {editingId && (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={handleCancelEdit}
              >
                Cancelar edición
              </button>
            )}
          </div>

          <div className="card-body">
            <form onSubmit={handleSubmit} className="row g-3" encType="multipart/form-data">
              <div className="col-md-6">
                <label className="form-label">Nombre</label>
                <input
                  className="form-control"
                  name="nombre"
                  value={formData.nombre}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="col-md-6">
                <label className="form-label">Responsable</label>
                <input
                  className="form-control"
                  name="responsable"
                  value={formData.responsable}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="col-md-6">
                <label className="form-label">Cargo</label>
                <input
                  className="form-control"
                  name="cargo"
                  value={formData.cargo}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="col-md-6">
                <label className="form-label">Razón social</label>
                <input
                  className="form-control"
                  name="razon_social"
                  value={formData.razon_social}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-6">
                <label className="form-label">Logo</label>
                <input
                  type="file"
                  className="form-control"
                  name="logo"
                  accept="image/*"
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-6">
                <label className="form-label">Firma</label>
                <input
                  type="file"
                  className="form-control"
                  name="firma"
                  accept="image/*"
                  onChange={handleChange}
                />
              </div>

              {serverError && (
                <div className="col-12">
                  <div className="alert alert-danger" role="alert">
                    {serverError}
                  </div>
                </div>
              )}

              <div className="col-12 d-flex gap-2">
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting
                    ? 'Guardando…'
                    : editingId
                    ? 'Actualizar entidad'
                    : 'Guardar entidad'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={handleCancelEdit}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LISTA: usa EntidadList y permite editar filas → rellena el form de arriba */}
      <EntidadList key={listKey} onEdit={handleEdit} />
    </div>
  );
}
