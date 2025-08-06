// src/components/EntidadDashboard/EntidadForm.tsx
import { useState } from 'react';
import axios from 'axios';

interface EntidadFormProps {
  onSuccess: () => void;
}

export default function EntidadForm({ onSuccess }: EntidadFormProps) {
  const [formData, setFormData] = useState({
    nombre: '',
    responsable: '',
    cargo: '',
    razon_social: '',
    logo: null as File | null,
    firma: null as File | null,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, files } = e.target;
    if (files) {
      setFormData({ ...formData, [name]: files[0] });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      if (value) data.append(key, value);
    });

    await axios.post('/api/entidades/', data);
    onSuccess();
    setFormData({ nombre: '', responsable: '', cargo: '', razon_social: '', logo: null, firma: null });
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 p-4 bg-white rounded shadow-md">
      <input type="text" name="nombre" placeholder="Nombre" value={formData.nombre} onChange={handleChange} className="input" />
      <input type="text" name="responsable" placeholder="Responsable" value={formData.responsable} onChange={handleChange} className="input" />
      <input type="text" name="cargo" placeholder="Cargo" value={formData.cargo} onChange={handleChange} className="input" />
      <input type="text" name="razon_social" placeholder="Razón Social" value={formData.razon_social} onChange={handleChange} className="input" />
      <input type="file" name="logo" accept="image/*" onChange={handleChange} className="input" />
      <input type="file" name="firma" accept="image/*" onChange={handleChange} className="input" />
      <button type="submit" className="bg-blue-600 text-white rounded px-4 py-2">Guardar Entidad</button>
    </form>
  );
}