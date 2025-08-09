import React, { useState, useEffect } from "react";
import axios from "axios";

export default function EntidadForm({ selectedEntidad, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    nombre: "",
    responsable: "",
    cargo: "",
    razon_social: "",
    logo: null,
    firma: null,
  });

  useEffect(() => {
    if (selectedEntidad) {
      setFormData({
        ...selectedEntidad,
        logo: null,
        firma: null,
      });
    }
  }, [selectedEntidad]);

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    if (files) {
      setFormData((prev) => ({ ...prev, [name]: files[0] }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
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
        : "/api/entidades/";
      const method = selectedEntidad ? "put" : "post";

      const response = await axios({
        method,
        url,
        data,
        headers: { "Content-Type": "multipart/form-data" },
      });

      onSave(response.data);
    } catch (error) {
      console.error("Error al guardar la entidad:", error);
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
