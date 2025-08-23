// frontend/src/components/EntidadDashboard/EntidadForm.jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';

export default function EntidadForm({ selectedEntidad, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    nombre: '',
    responsable: '',
    cargo: '',
    razon_social: '',
    logo: null,
    firma: null,
  });

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
    } else {
      setFormData({
        nombre: '',
        responsable: '',
        cargo: '',
        razon_social: '',
        logo: null,
        firma: null,
      });
    }
  }, [selectedEntidad]);

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    setFormData((prev) => ({ ...prev, [name]: files ? files[0] : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = new FormData();
    for (const key in formData) {
      if (formData[key]) data.append(key, formData[key]);
    }
    try {
      const url = selectedEntidad
        ? `/api/entidades/${selectedEntidad.id}/`
        : '/api/entidades/';
      const method = selectedEntidad ? 'put' : 'post';
      const response = await api({
        method,
        url,
        data,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onSave && onSave(response.data);
    } catch (error) {
      console.error('Error al guardar la entidad:', error);
      alert('No se pudo guardar la entidad.');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="nombre" value={formData.nombre} onChange={handleChange} placeholder="Nombre" required />
      <input name="responsable" value={formData.responsable} onChange={handleChange} placeholder="Responsable" required />
      <input name="cargo" value={formData.cargo} onChange={handleChange} placeholder="Cargo" required />
      <input name="razon_social" value={formData.razon_social} onChange={handleChange} placeholder="Razón Social" />
      <label>Logo: <input type="file" name="logo" onChange={handleChange} /></label>
      <label>Firma: <input type="file" name="firma" onChange={handleChange} /></label>
      <button type="submit">Guardar</button>
      <button type="button" onClick={onCancel}>Cancelar</button>
    </form>
  );
}
