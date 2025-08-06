// frontend/src/components/UploadForm.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { subirExcel } from '../services/api';
import Header from './Header';

export default function UploadForm() {
  const [archivo, setArchivo] = useState(null);
  const [previewHtml, setPreview] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleFileChange = (e) => {
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
          state: { records: res.data.data },
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
      <div className="container d-flex align-items-center justify-content-center" style={{ minHeight: 'calc(100vh - 88px)', paddingTop: '88px' }}>
        <div className="card shadow p-4 w-100" style={{ maxWidth: 600 }}>
          <h4 className="text-primary text-center mb-4">Subir Archivo Excel</h4>

          <div className="mb-3">
            <label htmlFor="archivo" className="form-label">Seleccionar archivo</label>
            <input
              type="file"
              className="form-control"
              id="archivo"
              accept=".csv,.xls,.xlsx"
              onChange={handleFileChange}
            />
          </div>

          <div className="d-grid mb-3">
            <button className="btn btn-success" onClick={handleUpload}>
              Subir y Previsualizar
            </button>
          </div>

          {error && <div className="alert alert-danger">{error}</div>}

          {previewHtml && (
            <div
              className="mt-4"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          )}
        </div>
      </div>
    </>
  );
}
