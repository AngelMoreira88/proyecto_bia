import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { isLoggedIn } from '@/services/auth';  // ✅ Agregá esto

export default function EntidadDashboard() {
  const [entidades, setEntidades] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    nombre: '',
    responsable: '',
    cargo: '',
    razon_social: '',
    logo: null,
    firma: null
  });

  const fetchEntidades = async () => {
    const res = await axios.get('/api/entidades/');
    setEntidades(res.data);
  };

  useEffect(() => {
    fetchEntidades();
  }, []);

  const handleChange = e => {
    const { name, value, files } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: files ? files[0] : value
    }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    const payload = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      if (value) payload.append(key, value);
    });

    const url = editingId
      ? `/api/entidades/${editingId}/`
      : `/api/entidades/`;

    const method = editingId ? 'put' : 'post';

    await axios({
      method,
      url,
      data: payload,
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    setFormData({
      nombre: '',
      responsable: '',
      cargo: '',
      razon_social: '',
      logo: null,
      firma: null
    });
    setEditingId(null);
    fetchEntidades();
  };

  const handleEdit = (ent) => {
    setFormData({
      nombre: ent.nombre || '',
      responsable: ent.responsable || '',
      cargo: ent.cargo || '',
      razon_social: ent.razon_social || '',
      logo: null,
      firma: null
    });
    setEditingId(ent.id);
  };

  const handleCancelEdit = () => {
    setFormData({
      nombre: '',
      responsable: '',
      cargo: '',
      razon_social: '',
      logo: null,
      firma: null
    });
    setEditingId(null);
  };

  return (
    <div className="p-6 space-y-8">
      {/* Mostrar formulario solo si el usuario está logueado */}
      {isLoggedIn() && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Editar entidad' : 'Registrar nueva entidad'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nombre</Label>
                <Input name="nombre" value={formData.nombre} onChange={handleChange} required />
              </div>
              <div>
                <Label>Responsable</Label>
                <Input name="responsable" value={formData.responsable} onChange={handleChange} required />
              </div>
              <div>
                <Label>Cargo</Label>
                <Input name="cargo" value={formData.cargo} onChange={handleChange} required />
              </div>
              <div>
                <Label>Razón social</Label>
                <Input name="razon_social" value={formData.razon_social} onChange={handleChange} />
              </div>
              <div>
                <Label>Logo</Label>
                <Input type="file" name="logo" onChange={handleChange} />
              </div>
              <div>
                <Label>Firma</Label>
                <Input type="file" name="firma" onChange={handleChange} />
              </div>

              <div className="col-span-2 flex gap-4 mt-4">
                <Button type="submit">
                  {editingId ? 'Actualizar entidad' : 'Guardar entidad'}
                </Button>
                {editingId && (
                  <Button type="button" variant="ghost" onClick={handleCancelEdit}>
                    Cancelar edición
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Separator />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {entidades.map(ent => (
          <Card key={ent.id}>
            <CardHeader>
              <CardTitle>{ent.nombre}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p><strong>Responsable:</strong> {ent.responsable}</p>
              <p><strong>Cargo:</strong> {ent.cargo}</p>
              <p><strong>Razón Social:</strong> {ent.razon_social}</p>
              {ent.logo && <img src={ent.logo} alt="logo" className="w-24 h-auto" />}
              {ent.firma && <img src={ent.firma} alt="firma" className="w-24 h-auto" />}
              {isLoggedIn() && (
                <Button variant="outline" onClick={() => handleEdit(ent)}>
                  Editar
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

