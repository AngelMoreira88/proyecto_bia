// frontend/src/components/EntidadDashboard/EntidadForm.jsx
import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';

const ENTIDADES_BASE = '/api/certificado/entidades/';

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
        logo: null,   // no precargamos archivos existentes
        firma: null,
      });
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
    if (logoRef.current) logoRef.current.value = '';
    if (firmaRef.current) firmaRef.current.value = '';
  };

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    setServerError('');
    setFormData((prev) => ({
      ...prev,
      [name]: files ? (files.length ? files[0] : null) : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    // Construimos FormData; enviamos strings vacíos, omitimos null/undefined
    const data = new FormData();
    Object.entries(formData).forEach(([k, v]) => {
      if (v !== null && v !== undefined) data.append(k, v);
    });

    const isEdit = Boolean(selectedEntidad?.id);
    const url = isEdit ? `${ENTIDADES_BASE}${selectedEntidad.id}/` : ENTIDADES_BASE;
    const method = isEdit ? 'patch' : 'post'; // PATCH para edición parcial

    try {
      setSubmitting(true);
      setServerError('');
      const resp = await api({
        method,
        url,
        data,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      // limpiar formulario después de guardar si es alta
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

      <div className="col-md-6">
        <label className="form-label">Logo</label>
        <input
          ref={logoRef}
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
          ref={firmaRef}
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
