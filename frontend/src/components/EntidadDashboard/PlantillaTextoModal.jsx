import { useEffect, useState } from 'react';
import { listarPlantillas, crearPlantilla, eliminarPlantilla } from '../../services/api';

const MODELOS = [
  { value: 'GENERICO',       label: 'Genérico con nombre de entidad' },
  { value: 'BIA',            label: 'Genérico BIA' },
  { value: 'WENANCE_TRUSTS', label: 'Wenance con fideicomisos' },
  { value: 'AZUR',           label: 'Azur Investment' },
  { value: 'EMPRESA',        label: 'Empresa' },
];

// Textos por defecto espejados del código hardcodeado del backend.
// Variables disponibles en parrafo1: {nombre} {dni} {razon_social} {entidad_original} {id}
// Variables disponibles en asterisco: {razon_social} {fecha_carga}
const DEFAULTS_POR_MODELO = {
  GENERICO: {
    parrafo1: 'Por medio de la presente se deja constancia que el Sr/a <b>{nombre}</b>, con DNI: <b>{dni}</b> ha cancelado la deuda que mantenía con <b>{razon_social}</b>, respecto al/los crédito/s comprendidos bajo el N° de ID <b>{id}</b>, originado en <b>{entidad_original}</b>.',
    asterisco: '*Este documento se refiere única y exclusivamente sobre los créditos que fueron originados y cedidos a {razon_social}, por la entidad expresamente mencionada, de fecha anterior al {fecha_carga}.',
    fiduciarios: '',
  },
  BIA: {
    parrafo1: 'Por medio de la presente se deja constancia que el Sr/a <b>{nombre}</b>, con DNI: <b>{dni}</b> ha cancelado la deuda que mantenía con <b>{razon_social}</b>, respecto al/los crédito/s comprendidos bajo el N° de ID <b>{id}</b>, originado en <b>{entidad_original}</b>.',
    asterisco: '*Este documento se refiere única y exclusivamente sobre los créditos que fueron originados y cedidos a {razon_social}, por la entidad expresamente mencionada, de fecha anterior al {fecha_carga}.',
    fiduciarios: '',
  },
  WENANCE_TRUSTS: {
    parrafo1: 'Por medio de la presente se deja constancia que el Sr/a <b>{nombre}</b>, con DNI: <b>{dni}</b> ha cancelado la deuda que mantenía con <b>{razon_social}</b>, en su carácter de fiduciaria de los Fideicomisos Financieros Privados: \u201cMERCHANT\u201d, \u201cCILSA\u201d, \u201cFINTOP\u201d y/o \u201cFINUP\u201d, respecto al/los crédito/s comprendidos bajo el N° de ID <b>{id}</b>, originado en <b>{entidad_original}</b>.',
    asterisco: '*Este documento se refiere única y exclusivamente sobre los créditos que fueran originados y cedidos a BIA SRL, por la entidad expresamente mencionada, de fecha anterior al {fecha_carga}.',
    fiduciarios: 'MERCHANT, CILSA, FINTOP y/o FINUP',
  },
  AZUR: {
    parrafo1: 'Se deja constancia de que el/la Sr./a <b>{nombre}</b>, con DNI <b>{dni}</b>, ha cancelado la deuda correspondiente a <b>{razon_social}</b>, administrado por BIA S.R.L respecto al/los crédito/s comprendidos bajo el N° de ID <b>{id}</b>, originado/s en <b>{entidad_original}</b>.',
    asterisco: '*Este documento se refiere única y exclusivamente sobre los créditos que fueron originados y cedidos a {razon_social}, por la entidad expresamente mencionada, de fecha anterior al {fecha_carga}.',
    fiduciarios: '',
  },
  EMPRESA: {
    parrafo1: 'Por medio de la presente se deja constancia que el Sr/a <b>{nombre}</b>, con DNI: <b>{dni}</b>, ha cancelado la deuda que mantenía con la empresa <b>{razon_social}</b>, respecto al/los crédito/s comprendidos bajo el N° de ID <b>{id}</b>, originado en <b>{entidad_original}</b>.',
    asterisco: '*Este documento se refiere única y exclusivamente sobre los créditos que fueron originados y cedidos a {razon_social}, por la entidad expresamente mencionada, de fecha anterior al {fecha_carga}.',
    fiduciarios: '',
  },
};

const EMPTY_FORM = {
  modelo_base: 'GENERICO',
  parrafo1: '',
  asterisco: '',
  fiduciarios: '',
};

export default function PlantillaTextoModal({ entidad, onClose }) {
  const [plantillas, setPlantillas] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState('');
  const [form, setForm]             = useState(EMPTY_FORM);
  const [showForm, setShowForm]     = useState(false);

  useEffect(() => {
    if (entidad?.id) fetchPlantillas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidad?.id]);

  async function fetchPlantillas() {
    try {
      setLoading(true);
      setErr('');
      const { data } = await listarPlantillas({ entidad: entidad.id, page_size: 100 });
      const rows = Array.isArray(data) ? data : (data?.results ?? []);
      setPlantillas(rows.sort((a, b) => b.version - a.version));
    } catch {
      setErr('No se pudieron cargar las plantillas.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.parrafo1.trim()) { setErr('El párrafo principal es obligatorio.'); return; }
    try {
      setSaving(true);
      setErr('');
      await crearPlantilla({ ...form, entidad: entidad.id, activa: true });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await fetchPlantillas();
    } catch (ex) {
      const detail = ex?.response?.data;
      setErr(typeof detail === 'string' ? detail : JSON.stringify(detail) || 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(plantilla) {
    const activas = plantillas.filter(p => p.activa);
    if (plantilla.activa && activas.length === 1) {
      alert('No podés eliminar la única plantilla activa. Creá una nueva versión primero.');
      return;
    }
    const ok = window.confirm(
      `¿Eliminar la plantilla v${plantilla.version}?\n\nSolo se puede eliminar si ningún certificado fue generado con esta versión. De lo contrario el sistema lo bloqueará para preservar el historial.`
    );
    if (!ok) return;
    try {
      await eliminarPlantilla(plantilla.id);
      await fetchPlantillas();
    } catch (ex) {
      const detail = ex?.response?.data?.detail || ex?.response?.data || 'No se pudo eliminar.';
      alert(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  }

  function handleModeloChange(e) {
    const modelo = e.target.value;
    const defaults = DEFAULTS_POR_MODELO[modelo];
    const camposVacios = !form.parrafo1.trim() && !form.asterisco.trim();

    if (camposVacios) {
      // Si el formulario está vacío, auto-rellenar sin preguntar
      setForm(f => ({ ...f, modelo_base: modelo, ...defaults }));
    } else {
      // Si ya tiene contenido, preguntar antes de pisar
      const ok = window.confirm(
        `¿Reemplazar el texto actual con el texto por defecto del modelo "${MODELOS.find(m => m.value === modelo)?.label}"?`
      );
      if (ok) {
        setForm(f => ({ ...f, modelo_base: modelo, ...defaults }));
      } else {
        setForm(f => ({ ...f, modelo_base: modelo }));
      }
    }
  }

  function handleCargarDefecto() {
    const defaults = DEFAULTS_POR_MODELO[form.modelo_base];
    if (!defaults) return;
    setForm(f => ({ ...f, ...defaults }));
  }

  const tieneContenido = form.parrafo1.trim() || form.asterisco.trim();

  return (
    <div
      className="modal d-block"
      tabIndex="-1"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-dialog modal-xl modal-dialog-scrollable">
        <div className="modal-content">

          <div className="modal-header">
            <h5 className="modal-title">
              Plantillas de texto — <span className="text-primary">{entidad?.nombre}</span>
            </h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            {err && <div className="alert alert-danger py-2">{err}</div>}

            {/* Lista de versiones */}
            <div className="mb-4">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="mb-0">Versiones guardadas</h6>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => { setShowForm(v => !v); setErr(''); setForm(EMPTY_FORM); }}
                >
                  {showForm ? 'Cancelar' : '+ Nueva versión'}
                </button>
              </div>

              {loading ? (
                <p className="text-muted">Cargando…</p>
              ) : plantillas.length === 0 ? (
                <p className="text-muted fst-italic">
                  Sin plantillas aún. Creá la primera versión con el botón de arriba.
                </p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-bordered table-sm align-middle">
                    <thead className="table-light">
                      <tr>
                        <th style={{ width: 60 }}>Versión</th>
                        <th style={{ width: 200 }}>Modelo</th>
                        <th>Párrafo principal</th>
                        <th style={{ width: 80 }}>Estado</th>
                        <th style={{ width: 110 }}>Creada</th>
                        <th style={{ width: 80 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {plantillas.map(p => (
                        <tr key={p.id} className={p.activa ? 'table-success' : ''}>
                          <td className="text-center fw-semibold">v{p.version}</td>
                          <td>{p.modelo_base_display ?? p.modelo_base}</td>
                          <td>
                            <div
                              style={{ maxHeight: 72, overflow: 'hidden', fontSize: 13, whiteSpace: 'pre-wrap' }}
                              title={p.parrafo1}
                            >
                              {p.parrafo1}
                            </div>
                            {p.asterisco && (
                              <div className="text-muted" style={{ fontSize: 11 }}>
                                * {p.asterisco}
                              </div>
                            )}
                          </td>
                          <td className="text-center">
                            {p.activa
                              ? <span className="badge bg-success">Activa</span>
                              : <span className="badge bg-secondary">Inactiva</span>}
                          </td>
                          <td className="small text-muted">
                            {p.creada_en ? new Date(p.creada_en).toLocaleDateString('es-AR') : '—'}
                          </td>
                          <td className="text-center">
                            <button
                              className="btn btn-outline-danger btn-sm"
                              onClick={() => handleDelete(p)}
                              title="Eliminar versión"
                            >
                              Eliminar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Formulario nueva versión */}
            {showForm && (
              <form onSubmit={handleSubmit} className="border rounded p-3 bg-light">
                <h6 className="mb-3">Nueva versión de plantilla</h6>

                <div className="mb-3">
                  <label className="form-label fw-semibold">Modelo base</label>
                  <select
                    className="form-select"
                    name="modelo_base"
                    value={form.modelo_base}
                    onChange={handleModeloChange}
                  >
                    {MODELOS.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  <div className="form-text d-flex justify-content-between align-items-center">
                    <span>
                      Al cambiar el modelo se pre-cargan los textos por defecto.
                      Variables disponibles en el texto:{' '}
                      <code>{'{nombre}'}</code> <code>{'{dni}'}</code> <code>{'{razon_social}'}</code>{' '}
                      <code>{'{entidad_original}'}</code> <code>{'{id}'}</code>
                    </span>
                    {tieneContenido && (
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm ms-2 text-nowrap"
                        onClick={handleCargarDefecto}
                        title="Reemplaza el texto actual con el texto original del modelo seleccionado"
                      >
                        Restaurar texto original
                      </button>
                    )}
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-semibold">
                    Párrafo principal <span className="text-danger">*</span>
                  </label>
                  <textarea
                    className="form-control font-monospace"
                    name="parrafo1"
                    rows={6}
                    value={form.parrafo1}
                    onChange={handleChange}
                    placeholder="Texto principal del certificado…"
                    required
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label fw-semibold">
                    Pie / asterisco
                    <span className="text-muted fw-normal ms-2" style={{ fontSize: 12 }}>
                      Variables: <code>{'{razon_social}'}</code> <code>{'{fecha_carga}'}</code>
                    </span>
                  </label>
                  <textarea
                    className="form-control"
                    name="asterisco"
                    rows={2}
                    value={form.asterisco}
                    onChange={handleChange}
                    placeholder="Texto de aclaración al pie del certificado (opcional)"
                  />
                </div>

                {form.modelo_base === 'WENANCE_TRUSTS' && (
                  <div className="mb-3">
                    <label className="form-label fw-semibold">Fiduciarios</label>
                    <input
                      className="form-control"
                      name="fiduciarios"
                      value={form.fiduciarios}
                      onChange={handleChange}
                      placeholder='Ej: "MERCHANT", "CILSA", "FINTOP" y/o "FINUP"'
                    />
                    <div className="form-text">
                      Se inserta automáticamente donde el párrafo contenga <code>{'{fiduciarios}'}</code>.
                    </div>
                  </div>
                )}

                <div className="d-flex gap-2 justify-content-end">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => { setShowForm(false); setErr(''); setForm(EMPTY_FORM); }}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? 'Guardando…' : 'Guardar nueva versión'}
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="modal-footer">
            <small className="text-muted me-auto">
              Las versiones ya usadas en certificados no se modifican.
            </small>
            <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
          </div>

        </div>
      </div>
    </div>
  );
}
