// frontend/src/components/EntidadDashboard/EntidadDashboard.jsx
import { useState } from 'react';
import { isLoggedIn } from '../../services/auth';
import api from '../../services/api';
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

  // --- Estado para "Punto 3: sugerencias" ---
  const [sugLoading, setSugLoading] = useState(false);
  const [sugErr, setSugErr] = useState(null);
  const [sugItems, setSugItems] = useState([]); // [{nombre, fuente?, usos?}]
  const [sugSelected, setSugSelected] = useState({}); // { nombre: true/false }
  const [creatingBatch, setCreatingBatch] = useState(false);

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

    await api({
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

  // ============== SUGERENCIAS (Punto 3) ==============
  const fetchSugerencias = async () => {
    setSugLoading(true);
    setSugErr(null);
    setSugItems([]);
    setSugSelected({});
    try {
      const res = await api.get('/api/entidades/sugerencias/');
      let arr = [];

      // Admite varios formatos de respuesta:
      // 1) { missing: [ {nombre, fuente?, usos?}, ... ] }
      // 2) [ {nombre, fuente?, usos?}, ... ]
      // 3) [ "NOMBRE1", "NOMBRE2", ... ]
      const data = res.data;
      if (Array.isArray(data)) {
        arr = data.map((x) =>
          typeof x === 'string' ? { nombre: x } : { ...x }
        );
      } else if (data && Array.isArray(data.missing)) {
        arr = data.missing.map((x) =>
          typeof x === 'string' ? { nombre: x } : { ...x }
        );
      }

      // ordenar por usos desc si existe
      arr.sort((a, b) => (b.usos || 0) - (a.usos || 0));
      setSugItems(arr);
    } catch (e) {
      setSugErr('No se pudieron cargar las sugerencias.');
    } finally {
      setSugLoading(false);
    }
  };

  const toggleSug = (nombre) => {
    setSugSelected((prev) => ({ ...prev, [nombre]: !prev[nombre] }));
  };

  const selectAllSug = () => {
    const all = {};
    sugItems.forEach((it) => (all[it.nombre] = true));
    setSugSelected(all);
  };

  const clearSelection = () => setSugSelected({});

  const createSelected = async () => {
    const toCreate = sugItems.filter((it) => sugSelected[it.nombre]);
    if (toCreate.length === 0) return;

    setCreatingBatch(true);
    try {
      // Crear en serie para simplificar (podrías paralelizar)
      for (const it of toCreate) {
        const fd = new FormData();
        fd.append('nombre', it.nombre);
        fd.append('responsable', ''); // ajustá si querés defaults
        fd.append('cargo', '');
        await api.post('/api/entidades/', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      // Refrescar lista y limpiar selección
      setListKey((n) => n + 1);
      fetchSugerencias();
      clearSelection();
    } catch (e) {
      alert('Error creando algunas entidades. Revisá la consola.');
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setCreatingBatch(false);
    }
  };

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

      {/* PANEL SUGERENCIAS (Punto 3) */}
      {isLoggedIn() && (
        <div className="card mb-4 shadow-sm">
          <div className="card-header d-flex flex-wrap gap-2 align-items-center justify-content-between">
            <strong className="m-0">Sugerencias desde datos (propietario / entidad interna)</strong>
            <div className="d-flex gap-2">
              <button className="btn btn-sm btn-outline-secondary" onClick={fetchSugerencias} disabled={sugLoading}>
                {sugLoading ? 'Buscando…' : 'Detectar nombres sin Entidad'}
              </button>
              {sugItems.length > 0 && (
                <>
                  <button className="btn btn-sm btn-outline-primary" onClick={selectAllSug}>
                    Seleccionar todo
                  </button>
                  <button className="btn btn-sm btn-outline-secondary" onClick={clearSelection}>
                    Limpiar selección
                  </button>
                  <button
                    className="btn btn-sm btn-success"
                    onClick={createSelected}
                    disabled={creatingBatch || Object.values(sugSelected).every((v) => !v)}
                  >
                    {creatingBatch ? 'Creando…' : 'Crear seleccionadas'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="card-body p-0">
            {sugErr ? (
              <div className="p-3 text-danger">{sugErr}</div>
            ) : sugLoading ? (
              <div className="p-3 text-muted">Cargando…</div>
            ) : sugItems.length === 0 ? (
              <div className="p-3 text-muted">No hay sugerencias para crear (o aún no buscaste).</div>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: 1 }}></th>
                      <th>Nombre detectado</th>
                      <th>Fuente</th>
                      <th>Usos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sugItems.map((it) => (
                      <tr key={it.nombre}>
                        <td>
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={!!sugSelected[it.nombre]}
                            onChange={() => toggleSug(it.nombre)}
                          />
                        </td>
                        <td>{it.nombre}</td>
                        <td><span className="text-muted">{it.fuente || '—'}</span></td>
                        <td><span className="text-muted">{it.usos ?? '—'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LISTA: usa EntidadList y permite editar filas → rellena el form de arriba */}
      <EntidadList key={listKey} onEdit={handleEdit} />
    </div>
  );
}
