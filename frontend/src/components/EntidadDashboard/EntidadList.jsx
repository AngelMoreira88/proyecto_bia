// frontend/src/components/EntidadDashboard/EntidadForm.jsx
import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import { readImageDimensions, resizeImage, bytesToKB } from '../../utils/imageTools';

const ENTIDADES_BASE = '/api/certificado/entidades/';

// Límites recomendados para PDF/pantalla (caja máxima y peso final)
const LIMITS = {
  logo:  { maxW: 600, maxH: 200, maxKB: 300, label: 'Logo'  },
  firma: { maxW: 600, maxH: 180, maxKB: 200, label: 'Firma' },
};

// Tipos aceptados
const ACCEPTED_INPUT = 'image/png,image/jpeg,image/webp,image/svg+xml';

const isSVG = (file) =>
  !!file && (/image\/svg\+xml/i.test(file.type) || /\.svg$/i.test(file.name || ''));

const formatMeta = (m) => {
  if (!m) return '';
  const dim = m.w && m.h ? `${m.w}×${m.h}px` : '';
  const kb  = m.kb != null ? `${m.kb} KB` : '';
  return [dim, kb].filter(Boolean).join(' · ');
};

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

  // Previews (nuevos), meta y errores por campo
  const [preview, setPreview] = useState({ logo: null, firma: null });
  const [metaInfo, setMetaInfo]   = useState({ logo: null, firma: null }); // {w,h,kb}
  const [fieldError, setFieldError] = useState({ logo: '', firma: '' });
  const [autoAdjusted, setAutoAdjusted] = useState({ logo: false, firma: false });

  // URLs existentes (lo que ya tiene cargado la entidad)
  const [existing, setExisting] = useState({ logo: null, firma: null });

  // “Marcar para borrar”
  const [toDelete, setToDelete] = useState({ logo: false, firma: false });

  // Refs para vaciar inputs file
  const logoRef = useRef(null);
  const firmaRef = useRef(null);

  // Cargar datos iniciales o al cambiar la entidad seleccionada
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

      // Detectar posibles URLs existentes (ajustá keys si tu API usa otros nombres)
      setExisting({
        logo:
          selectedEntidad.logo_url ||
          (typeof selectedEntidad.logo === 'string' ? selectedEntidad.logo : null) ||
          null,
        firma:
          selectedEntidad.firma_url ||
          (typeof selectedEntidad.firma === 'string' ? selectedEntidad.firma : null) ||
          null,
      });

      setPreview({ logo: null, firma: null });
      setMetaInfo({ logo: null, firma: null });
      setFieldError({ logo: '', firma: '' });
      setAutoAdjusted({ logo: false, firma: false });
      setToDelete({ logo: false, firma: false });
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
    setExisting({ logo: null, firma: null });
    setPreview({ logo: null, firma: null });
    setMetaInfo({ logo: null, firma: null });
    setFieldError({ logo: '', firma: '' });
    setAutoAdjusted({ logo: false, firma: false });
    setToDelete({ logo: false, firma: false });
    setServerError('');
    if (logoRef.current) logoRef.current.value = '';
    if (firmaRef.current) firmaRef.current.value = '';
  };

  const handleTextChange = (e) => {
    const { name, value } = e.target;
    setServerError('');
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Manejo de archivos: valida, optimiza (raster) y prepara preview
  const handleFileChange = async (e) => {
    const { name, files } = e.target; // name = 'logo' | 'firma'
    setServerError('');
    setFieldError((p) => ({ ...p, [name]: '' }));
    setAutoAdjusted((p) => ({ ...p, [name]: false }));

    const limits = LIMITS[name];
    if (!limits) return;

    const file = files?.[0] ?? null;

    // Si quitaron el archivo del input
    if (!file) {
      setFormData((p) => ({ ...p, [name]: null }));
      setPreview((p) => ({ ...p, [name]: null }));
      setMetaInfo((p) => ({ ...p, [name]: null }));
      return;
    }

    try {
      // SVG: no se redimensiona; solo validamos peso
      if (isSVG(file)) {
        const kb = bytesToKB(file.size);
        if (kb > limits.maxKB) {
          setFieldError((p) => ({
            ...p,
            [name]: `El SVG supera ${limits.maxKB} KB.`,
          }));
          return;
        }
        setFormData((p) => ({ ...p, [name]: file }));
        setPreview((p) => ({ ...p, [name]: URL.createObjectURL(file) }));
        setMetaInfo((p) => ({ ...p, [name]: { w: null, h: null, kb } }));
        return;
      }

      // Raster: intentamos leer dimensiones (si falla, continuamos)
      let w = null,
        h = null;
      try {
        const dim = await readImageDimensions(file);
        w = dim.width;
        h = dim.height;
      } catch {
        /* noop */
      }

      const needResize = w && h ? w > limits.maxW || h > limits.maxH : false;
      const tooHeavy = bytesToKB(file.size) > limits.maxKB;
      const notPNG = !/image\/png/i.test(file.type);

      let finalFile = file;
      let adjusted = false;

      if (needResize || tooHeavy || notPNG) {
        // Convertimos a PNG + limitamos a la caja máxima (sin agrandar)
        finalFile = await resizeImage(file, limits.maxW, limits.maxH, 'image/png');
        adjusted = true;
      }

      const outKB = bytesToKB(finalFile.size);
      if (outKB > limits.maxKB) {
        setFieldError((p) => ({
          ...p,
          [name]: `La imagen supera ${limits.maxKB} KB incluso después de optimizar.`,
        }));
        return;
      }

      // Info final
      let w2 = null,
        h2 = null;
      try {
        const dim2 = await readImageDimensions(finalFile);
        w2 = dim2.width;
        h2 = dim2.height;
      } catch {
        /* noop */
      }

      setFormData((p) => ({ ...p, [name]: finalFile }));
      setPreview((p) => ({ ...p, [name]: URL.createObjectURL(finalFile) }));
      setMetaInfo((p) => ({ ...p, [name]: { w: w2, h: h2, kb: outKB } }));
      setAutoAdjusted((p) => ({ ...p, [name]: adjusted }));
      // Al subir un archivo nuevo, desmarcamos “eliminar”
      setToDelete((p) => ({ ...p, [name]: false }));
    } catch (err) {
      console.error('Error procesando imagen:', err);
      setFieldError((p) => ({ ...p, [name]: 'No se pudo procesar la imagen.' }));
    }
  };

  const markDelete = (field) => {
    // Marca para borrar en backend y limpia selección/preview local
    setToDelete((p) => ({ ...p, [field]: true }));
    setFormData((p) => ({ ...p, [field]: null }));
    setPreview((p) => ({ ...p, [field]: null }));
    setMetaInfo((p) => ({ ...p, [field]: null }));
    setFieldError((p) => ({ ...p, [field]: '' }));
    if (field === 'logo' && logoRef.current) logoRef.current.value = '';
    if (field === 'firma' && firmaRef.current) firmaRef.current.value = '';
  };

  const undoDelete = (field) => {
    setToDelete((p) => ({ ...p, [field]: false }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    // Construimos FormData
    const data = new FormData();
    Object.entries(formData).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') data.append(k, v);
    });
    // Flags de eliminación explícita
    if (toDelete.logo)  data.append('logo_delete', '1');
    if (toDelete.firma) data.append('firma_delete', '1');

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

      // Al guardar OK, limpiamos inputs file y reseteamos estados de archivo
      if (logoRef.current) logoRef.current.value = '';
      if (firmaRef.current) firmaRef.current.value = '';
      setPreview({ logo: null, firma: null });
      setMetaInfo({ logo: null, firma: null });
      setAutoAdjusted({ logo: false, firma: false });
      setFieldError({ logo: '', firma: '' });
      setToDelete({ logo: false, firma: false });

      if (!isEdit) {
        // Si era creación, limpiamos todo el form
        setExisting({ logo: null, firma: null });
        setFormData({
          nombre: '',
          responsable: '',
          cargo: '',
          razon_social: '',
          logo: null,
          firma: null,
        });
      } else {
        // Si fue edición, actualizamos previews “existentes” con lo devuelto (si tu API responde URLs)
        setExisting({
          logo:  resp.data?.logo_url  || existing.logo,
          firma: resp.data?.firma_url || existing.firma,
        });
      }

      onSave && onSave(resp.data);
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
          onChange={handleTextChange}
          required
        />
      </div>

      <div className="col-md-6">
        <label className="form-label">Responsable</label>
        <input
          className="form-control"
          name="responsable"
          value={formData.responsable}
          onChange={handleTextChange}
          required
        />
      </div>

      <div className="col-md-6">
        <label className="form-label">Cargo</label>
        <input
          className="form-control"
          name="cargo"
          value={formData.cargo}
          onChange={handleTextChange}
          required
        />
      </div>

      <div className="col-md-6">
        <label className="form-label">Razón social</label>
        <input
          className="form-control"
          name="razon_social"
          value={formData.razon_social}
          onChange={handleTextChange}
        />
      </div>

      {/* LOGO */}
      <div className="col-md-6">
        <label className="form-label d-flex align-items-center justify-content-between">
          <span>
            Logo{' '}
            <small className="text-muted">(PNG/JPG/WEBP/SVG · máx. 600×200 px y 300 KB)</small>
          </span>
          {existing.logo && !preview.logo && !toDelete.logo && (
            <a href={existing.logo} target="_blank" rel="noopener noreferrer" className="small">
              Ver actual
            </a>
          )}
        </label>

        <input
          ref={logoRef}
          type="file"
          className="form-control"
          name="logo"
          accept={ACCEPTED_INPUT}
          onChange={handleFileChange}
          disabled={submitting}
        />

        {(existing.logo || preview.logo) && !toDelete.logo && (
          <div className="mt-2 d-flex align-items-center gap-3">
            <img
              src={preview.logo || existing.logo}
              alt="Logo"
              style={{
                height: 48,
                width: 'auto',
                objectFit: 'contain',
                border: '1px dashed #ccc',
                padding: 4,
                background: '#fff',
              }}
            />
            <div className="small">
              {preview.logo && autoAdjusted.logo && (
                <div className="text-success">✔ Optimizado automáticamente.</div>
              )}
              <div className="text-muted">
                {formatMeta(metaInfo.logo) || (existing.logo ? 'Archivo existente' : '')}
              </div>
              {fieldError.logo && <div className="text-danger">{fieldError.logo}</div>}
              <button
                type="button"
                className="btn btn-sm btn-outline-danger mt-1"
                onClick={() => markDelete('logo')}
                disabled={submitting}
              >
                Quitar logo
              </button>
            </div>
          </div>
        )}

        {toDelete.logo && (
          <div className="mt-2 small d-flex align-items-center gap-2">
            <span className="badge text-bg-warning">Se eliminará al guardar</span>
            <button
              type="button"
              className="btn btn-sm btn-link"
              onClick={() => undoDelete('logo')}
              disabled={submitting}
            >
              Deshacer
            </button>
          </div>
        )}
      </div>

      {/* FIRMA */}
      <div className="col-md-6">
        <label className="form-label d-flex align-items-center justify-content-between">
          <span>
            Firma{' '}
            <small className="text-muted">(PNG/JPG/WEBP/SVG · máx. 600×180 px y 200 KB)</small>
          </span>
          {existing.firma && !preview.firma && !toDelete.firma && (
            <a href={existing.firma} target="_blank" rel="noopener noreferrer" className="small">
              Ver actual
            </a>
          )}
        </label>

        <input
          ref={firmaRef}
          type="file"
          className="form-control"
          name="firma"
          accept={ACCEPTED_INPUT}
          onChange={handleFileChange}
          disabled={submitting}
        />

        {(existing.firma || preview.firma) && !toDelete.firma && (
          <div className="mt-2 d-flex align-items-center gap-3">
            <img
              src={preview.firma || existing.firma}
              alt="Firma"
              style={{
                height: 48,
                width: 'auto',
                objectFit: 'contain',
                border: '1px dashed #ccc',
                padding: 4,
                background: '#fff',
              }}
            />
            <div className="small">
              {preview.firma && autoAdjusted.firma && (
                <div className="text-success">✔ Optimizada automáticamente.</div>
              )}
              <div className="text-muted">
                {formatMeta(metaInfo.firma) || (existing.firma ? 'Archivo existente' : '')}
              </div>
              {fieldError.firma && <div className="text-danger">{fieldError.firma}</div>}
              <button
                type="button"
                className="btn btn-sm btn-outline-danger mt-1"
                onClick={() => markDelete('firma')}
                disabled={submitting}
              >
                Quitar firma
              </button>
            </div>
          </div>
        )}

        {toDelete.firma && (
          <div className="mt-2 small d-flex align-items-center gap-2">
            <span className="badge text-bg-warning">Se eliminará al guardar</span>
            <button
              type="button"
              className="btn btn-sm btn-link"
              onClick={() => undoDelete('firma')}
              disabled={submitting}
            >
              Deshacer
            </button>
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
        <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
