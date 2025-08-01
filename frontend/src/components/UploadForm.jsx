// frontend/src/components/UploadForm.jsx

import React, { useState } from 'react';
import { useNavigate }      from 'react-router-dom';
import { subirExcel }       from '../services/api';

export default function UploadForm() {
  const [archivo, setArchivo]     = useState(null);
  const [previewHtml, setPreview] = useState('');
  const [error, setError]         = useState('');
  const navigate                  = useNavigate();

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
        // Opcional: mostrás la preview en esta pantalla
        setPreview(res.data.preview);

        // 👉 Luego navegás a ConfirmarCarga PASANDO records
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
    <div style={{ padding: '1rem' }}>
      <h2>Subir Excel</h2>
      <input 
        type="file" 
        accept=".csv,.xls,.xlsx" 
        onChange={handleFileChange} 
      />
      <button 
        onClick={handleUpload} 
        style={{ marginLeft: '1rem' }}
      >
        Subir y Previsualizar
      </button>

      {previewHtml && (
        <div
          style={{ marginTop: '1rem' }}
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      )}

      {error && <p style={{ color: 'red', marginTop: '1rem' }}>{error}</p>}
    </div>
  );
}
