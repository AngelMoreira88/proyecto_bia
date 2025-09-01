// frontend/src/components/EntidadDashboard/EntidadForm.jsx
import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import { readImageDimensions, resizeImage, bytesToKB } from '../../utils/imageTools';

const ENTIDADES_BASE = '/api/certificado/entidades/';

// Límites recomendados para PDF y pantalla
const LIMITS = {
  logo:  { maxW: 600, maxH: 200, maxKB: 300, label: 'Logo'  },
  firma: { maxW: 600, maxH: 180, maxKB: 200, label: 'Firma' },
};

const ACCEPTED_TYPES = /image\/(png|jpeg|jpg|webp|svg\+xml|svg)/i;

export default function EntidadForm({ selectedEntidad, onSave, onCancel }) {
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

  // Previews + errores por campo
  const [preview, setPreview] = useState({ logo: null, firma: null });
  const [fieldError, setFieldError] = useState({ logo: '', firma: '' });
  const [autoAdjusted, setAutoAdjusted] = useState({ logo: false, firma: false });
  const [metaInfo, setMetaInfo] = useState({ logo: null, firma: null }); // {w,h,kb}

  // Refs para limpiar inputs de archivo al resetear
  const logoRef = useRef(null);
  const firmaRef = useRef(null);

  useEffect(() => {
    if (selectedEntidad) {
      setFormData({
        nombre: selectedEntidad.nombre || '',
        responsable: selectedEntidad.responsable || '',
        cargo: selectedEntidad.cargo || '',
        razon_social: selectedEntidad.razon_social || '',
        logo: null,
        firma: null,
      });
      setPreview({ logo: null, firma: null });
      setFieldError({ logo: '', firma: '' });
      setAutoAdjusted({ logo: false, firma: false });
      setMetaInfo({ logo: null, firma: null });
      if (logoRef.current) logoRef.current.value = '';
      if (firmaRef.current) firmaRef.current.value = '';
    } else {
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntidad]);

  const resetForm = () => {
    setFormData({
      nombre: '',
      responsable: '',
      cargo: '',
      razon_social: '',
      logo: null,
      firma: null,
    });
    setServerError('');
    setPreview({ logo: null, firma: null });
    setFieldError({ logo: '', firma: '' });
    setAutoAdjusted({ logo: false, firma: false });
    setMetaInfo({ logo: null, firma: null });
    if (logoRef.current) logoRef.current.value = '';
    if (firmaRef.current) firmaRef.current.value = '';
  };

  // Maneja texto y archivos (con validación + auto-resize para imágenes)
  const handleChange = async (e) => {
    const { name, value, files } = e.target;
    setServerError('');
    if (!files) {
      setFormData((prev) => ({ ...prev, [name]: value }));
      return;
    }

    const file = files[0] ?? null;
    if (!file) {
      // limpiar si se sacó el archivo
      setFormData((prev) => ({ ...prev, [name]: null }));
      setPreview((p) => ({ ...p, [name]: null }));
      setFieldError((p) => ({ ...p, [name]: '' }));
      setAutoAdjusted((p) => ({ ...p, [name]: false }));
      setMetaInfo((p) => ({ ...p, [name]: null }));
      return;
    }

    const tipo = name; // 'logo' o 'firma'
    const limits = LIMITS[tipo];
    if (!limits) return;

    // Validar tipo
    if (!ACCEPTED_TYPES.test(file.type)) {
      setFieldError((p) => ({ ...p, [tipo]: 'Formato no soportado. Usá PNG o JPG.' }));
      return;
    }

    // Intentar leer dimensiones (si el navegador permite)
    let width = null, height = null;
    try {
      const dim = await readImageDimensions(file);
      width = dim.width;
      height = dim.height;
    } catch {
      // si falla, continuamos (se validará/normalizará en backend)
    }

    // Resolver si necesitamos redimensionar/pasar a PNG
    let finalFile = file;
    let adjusted = false;

    const needResize = (width && height) ? (width > limits.maxW || height > limits.maxH) : false;
    const tooHeavy = bytesToKB(file.size) > limits.maxKB;
    const notPng = !/image\/png/i.test(file.type);

    if (needResize || tooHeavy || notPng) {
      // Convertimos a PNG y limitamos caja (no agrandar)
      finalFile = await resizeImage(file, limits.maxW, limits.maxH, 'image/png');
      adjusted = true;
    }

    // Validar peso final
    if (bytesToKB(finalFile.size) > limits.maxKB) {
      setFieldError((p) => ({
        ...p,
        [tipo]: `La imagen excede ${limits.maxKB} KB incluso después de optimizar.`,
      }));
      return;
    }

    // Info para el usuario
    try {
      const dim2 = await readImageDimensions(finalFile);
      setMetaInfo((p) => ({ ...p, [tipo]: { w: dim2.width, h: dim2.height, kb: bytesToKB(finalFile.size) } }));
    } catch {
      setMetaInfo((p) => ({ ...p, [tipo]: { w: null, h: null, kb: bytesToKB(finalFile.size) } }));
    }

    // Guardar y mostrar preview
    setFieldError((p) => ({ ...p, [tipo]: '' }));
    setAutoAdjusted((p) => ({ ...p, [tipo]: adjusted }));
    const url = URL.createObjectURL(finalFile);
    setPreview((p) => ({ ...p, [tipo]: url }));

    setFormData((prev) => ({
      ...prev,
      [tipo]: finalFile,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    // Construimos FormData
    const data = new FormData();
    Object.entries(formData).forEach(([k, v]) => {
      if (v !== null && v !== undefined) data.append(k, v);
    });

    const isEdit = Boolean(selectedEntidad?.id);
    const url = isEdit ? `${ENTIDADES_BASE}${selectedEntidad.id}/` : ENTIDADES_BASE;
    const method = isEdit ? 'patch' : 'post';

    try {
      setSubmitting(true);
      setServerError('');
      const resp = await api({
        method,
        url,
        data,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (!isEdit) resetForm();
      if (onSave) onSave(resp.data);
    } catch (error) {
      console.error('Error al guardar la entidad:', error);
      const data = error?.response?.data;
      if (data && typeof data === 'object') {
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

  return (
    <form onSubmit={handleSubmit} encType="multipart/form-data" className="row g-3">
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

      {/* LOGO */}
      <div className="col-md-6">
        <label className="form-label">
          Logo <small className="text-muted">(PNG/JPG, máx. 600×200 px y 300 KB)</small>
        </label>
        <input
          ref={logoRef}
          type="file"
          className="form-control"
          name="logo"
          accept="image/*"
          onChange={handleChange}
        />
        {(preview.logo || fieldError.logo || metaInfo.logo) && (
          <div className="mt-2 d-flex align-items-center gap-3">
            {preview.logo && (
              <img
                src={preview.logo}
                alt="Preview logo"
                style={{ height: 48, width: 'auto', objectFit: 'contain', border: '1px dashed #ccc', padding: 4, background: '#fff' }}
              />
            )}
            <div className="small">
              {autoAdjusted.logo && (
                <div className="text-success">✔ Ajustado automáticamente para encajar en el PDF.</div>
              )}
              {metaInfo.logo && (
                <div className="text-muted">
                  {metaInfo.logo.w && metaInfo.logo.h ? `${metaInfo.logo.w}×${metaInfo.logo.h}px` : ''} {metaInfo.logo.kb ? `· ${metaInfo.logo.kb} KB` : ''}
                </div>
              )}
              {fieldError.logo && <div className="text-danger">{fieldError.logo}</div>}
            </div>
          </div>
        )}
      </div>

      {/* FIRMA */}
      <div className="col-md-6">
        <label className="form-label">
          Firma <small className="text-muted">(PNG/JPG, máx. 600×180 px y 200 KB)</small>
        </label>
        <input
          ref={firmaRef}
          type="file"
          className="form-control"
          name="firma"
          accept="image/*"
          onChange={handleChange}
        />
        {(preview.firma || fieldError.firma || metaInfo.firma) && (
          <div className="mt-2 d-flex align-items-center gap-3">
            {preview.firma && (
              <img
                src={preview.firma}
                alt="Preview firma"
                style={{ height: 48, width: 'auto', objectFit: 'contain', border: '1px dashed #ccc', padding: 4, background: '#fff' }}
              />
            )}
            <div className="small">
              {autoAdjusted.firma && (
                <div className="text-success">✔ Ajustada automáticamente para encajar en el PDF.</div>
              )}
              {metaInfo.firma && (
                <div className="text-muted">
                  {metaInfo.firma.w && metaInfo.firma.h ? `${metaInfo.firma.w}×${metaInfo.firma.h}px` : ''} {metaInfo.firma.kb ? `· ${metaInfo.firma.kb} KB` : ''}
                </div>
              )}
              {fieldError.firma && <div className="text-danger">{fieldError.firma}</div>}
            </div>
          </div>
        )}
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
            : selectedEntidad?.id
            ? 'Actualizar entidad'
            : 'Guardar entidad'}
        </button>
        <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
