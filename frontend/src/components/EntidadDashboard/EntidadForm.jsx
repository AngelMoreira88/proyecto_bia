// src/components/EntidadDashboard/EntidadForm.jsx
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
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (selectedEntidad) {
      setFormData({
        nombre: selectedEntidad.nombre || "",
        responsable: selectedEntidad.responsable || "",
        cargo: selectedEntidad.cargo || "",
        razon_social: selectedEntidad.razon_social || "",
        logo: null,
        firma: null,
      });
    } else {
      setFormData({
        nombre: "",
        responsable: "",
        cargo: "",
        razon_social: "",
        logo: null,
        firma: null,
      });
    }
    setErr("");
  }, [selectedEntidad]);

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    setFormData((prev) => ({ ...prev, [name]: files ? files[0] : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);

    const data = new FormData();
    Object.entries(formData).forEach(([k, v]) => { if (v) data.append(k, v); });

    try {
      const url = selectedEntidad
        ? `/api/entidades/${selectedEntidad.id}/`
        : "/api/entidades/";
      const method = selectedEntidad ? "put" : "post";

      const res = await axios({ method, url, data, headers: { "Content-Type": "multipart/form-data" } });
      onSave?.(res.data);
    } catch (e) {
      setErr("No se pudo guardar la entidad. Intente nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="row g-3">
      {/* Nombre */}
      <div className="col-md-6">
        <div className="form-floating">
          <input
            id="ent-nombre"
            className="form-control"
            name="nombre"
            placeholder="Nombre"
            value={formData.nombre}
            onChange={handleChange}
            required
          />
          <label htmlFor="ent-nombre">Nombre</label>
        </div>
      </div>

      {/* Responsable */}
      <div className="col-md-6">
        <div className="form-floating">
          <input
            id="ent-resp"
            className="form-control"
            name="responsable"
            placeholder="Responsable"
            value={formData.responsable}
            onChange={handleChange}
            required
          />
          <label htmlFor="ent-resp">Responsable</label>
        </div>
      </div>

      {/* Cargo */}
      <div className="col-md-6">
        <div className="form-floating">
          <input
            id="ent-cargo"
            className="form-control"
            name="cargo"
            placeholder="Cargo"
            value={formData.cargo}
            onChange={handleChange}
            required
          />
          <label htmlFor="ent-cargo">Cargo</label>
        </div>
      </div>

      {/* Razón social */}
      <div className="col-md-6">
        <div className="form-floating">
          <input
            id="ent-razon"
            className="form-control"
            name="razon_social"
            placeholder="Razón social"
            value={formData.razon_social}
            onChange={handleChange}
          />
          <label htmlFor="ent-razon">Razón social</label>
        </div>
      </div>

      {/* Logo */}
      <div className="col-md-6">
        <label className="form-label">Logo</label>
        <input type="file" className="form-control" name="logo" onChange={handleChange} />
        {formData.logo && (
          <div className="form-text">Archivo: {formData.logo.name}</div>
        )}
      </div>

      {/* Firma */}
      <div className="col-md-6">
        <label className="form-label">Firma</label>
        <input type="file" className="form-control" name="firma" onChange={handleChange} />
        {formData.firma && (
          <div className="form-text">Archivo: {formData.firma.name}</div>
        )}
      </div>

      {/* Acciones */}
      {err && <div className="col-12"><div className="alert alert-danger py-2">{err}</div></div>}
      <div className="col-12 d-flex gap-2">
        <button type="submit" className="btn btn-bia" disabled={loading}>
          {loading && <span className="spinner-border spinner-border-sm me-2" />}
          {selectedEntidad ? "Actualizar entidad" : "Guardar entidad"}
        </button>
        {selectedEntidad && (
          <button type="button" className="btn btn-outline-bia" onClick={onCancel} disabled={loading}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
