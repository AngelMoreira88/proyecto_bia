import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { subirExcel } from '../services/api';
import Header from './Header';

export default function UploadForm() {
  const [archivo, setArchivo] = useState(null);
  const [previewHtml, setPreview] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleFileChange = e => {
    setArchivo(e.target.files[0]);
    setError('');
    setPreview('');
  };

  const handleUpload = async () => {
    if (!archivo) {
      setError('Seleccioná un archivo primero');
      return;
    }

    const formData = new FormData();
    formData.append('archivo', archivo);

    try {
      const res = await subirExcel(formData);
      if (res.data.success) {
        setPreview(res.data.preview);
        navigate('/carga-datos/confirmar', {
          state: { records: res.data.data }
        });
      } else {
        setError((res.data.errors || []).join(', '));
      }
    } catch (e) {
      setError('Error al subir el archivo');
    }
  };

  return (
    <>
      <Header />
      <div className="container py-5">
        <h2 className="mb-4">Subir Excel</h2>
        <div className="mb-3">
          <input 
            type="file" 
            className="form-control"
            accept=".csv,.xls,.xlsx" 
            onChange={handleFileChange} 
          />
        </div>
        <button className="btn btn-success" onClick={handleUpload}>
          Subir y Previsualizar
        </button>

        {previewHtml && (
          <div
            className="mt-4"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        )}

        {error && <div className="alert alert-danger mt-3">{error}</div>}
      </div>
    </>
  );
}
