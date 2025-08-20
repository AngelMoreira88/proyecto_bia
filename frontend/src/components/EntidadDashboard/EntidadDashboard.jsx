// src/components/EntidadDashboard/EntidadDashboard.jsx
import { useState } from 'react';
import axios from 'axios';
import { isLoggedIn } from '../../services/auth';
import EntidadList from './EntidadList';

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

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: files ? files[0] : value,
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
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = new FormData();
    Object.entries(formData).forEach(([k, v]) => {
      if (v) payload.append(k, v);
    });

    const url = editingId ? `/api/entidades/${editingId}/` : `/api/entidades/`;
    const method = editingId ? 'put' : 'post';

    await axios({
      method,
      url,
      data: payload,
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    resetForm();
    setListKey((n) => n + 1); // re-monta EntidadList → vuelve a hacer fetch
  };

  const handleEdit = (ent) => {
    setFormData({
      nombre: ent.nombre || '',
      responsable: ent.responsable || '',
      cargo: ent.cargo || '',
      razon_social: ent.razon_social || '',
      logo: null,
      firma: null,
    });
    setEditingId(ent.id);
    // scroll suave al formulario
    const formEl = document.getElementById('entidad-form');
    if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleCancelEdit = () => resetForm();

  return (
    <div className="container py-3">
      {/* FORM: visible solo si el usuario está logeado */}
      {isLoggedIn() && (
        <div className="card mb-4 shadow-sm border-0 rounded-4" id="entidad-form">
          <div className="card-header bg-bia-subtle border-bia rounded-top-4 d-flex justify-content-between align-items-center">
            <strong className="text-bia">
              {editingId ? 'Editar entidad' : 'Registrar nueva entidad'}
            </strong>
            {editingId && (
              <button
                type="button"
                className="btn btn-sm btn-outline-bia"
                onClick={handleCancelEdit}
              >
                Cancelar edición
              </button>
            )}
          </div>

          <div className="card-body">
            <form onSubmit={handleSubmit} className="row g-3">
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
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-6">
                <label className="form-label">Firma</label>
                <input
                  type="file"
                  className="form-control"
                  name="firma"
                  onChange={handleChange}
                />
              </div>

              <div className="col-12 d-flex gap-2">
                <button type="submit" className="btn btn-bia">
                  {editingId ? 'Actualizar entidad' : 'Guardar entidad'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    className="btn btn-outline-bia"
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
