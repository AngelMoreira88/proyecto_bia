// frontend/src/components/CargaDatos.jsx
import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { subirExcel } from '../services/api';

const MAX_FILE_MB = 20;
const ALLOWED_EXT = ['.csv', '.xls', '.xlsx'];

export default function CargaDatos() {
  const navigate = useNavigate();

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [records, setRecords] = useState([]); // 👈 guardamos los datos para confirmar
  const [errors, setErrors] = useState([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const filename = useMemo(() => file?.name || '', [file]);

  const validateFile = (f) => {
    if (!f) return 'Seleccioná un archivo.';
    const lower = f.name.toLowerCase();
    if (!ALLOWED_EXT.some(ext => lower.endsWith(ext))) {
      return `Formato no permitido. Usá: ${ALLOWED_EXT.join(', ')}`;
    }
    const sizeMB = f.size / (1024 * 1024);
    if (sizeMB > MAX_FILE_MB) {
      return `El archivo supera ${MAX_FILE_MB} MB.`;
    }
    return null;
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0] ?? null;
    setErrors([]);
    setPreview('');
    setRecords([]);
    setFile(f);
    const vErr = validateFile(f);
    if (vErr) setErrors([vErr]);
  };

  const resetAll = () => {
    setFile(null);
    setPreview('');
    setRecords([]);
    setErrors([]);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors([]);
    setPreview('');
    setRecords([]);

    const vErr = validateFile(file);
    if (vErr) {
      setErrors([vErr]);
      return;
    }

    const formData = new FormData();
    formData.append('archivo', file);

    try {
      setUploading(true);
      const res = await subirExcel(formData);
      const data = res?.data ?? {};
      if (data.success) {
        // backend devuelve html sanitizado (preview) y data (registros)
        setPreview(String(data.preview || ''));
        if (Array.isArray(data.data)) {
          setRecords(data.data); // 👈 guardamos los registros para Confirmar
        }
      } else {
        // normalizamos errores posibles
        const backendErrors =
          Array.isArray(data.errors) ? data.errors :
          typeof data.errors === 'string' ? [data.errors] :
          Object.entries(data.errors || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : String(v)}`);
        setErrors(backendErrors.length ? backendErrors : ['Error en la validación del archivo.']);
      }
    } catch (err) {
      console.error(err);
      setErrors(['Error en la carga del archivo.']);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="container py-3">
      <h2 className="mb-3">Carga de Datos</h2>

      <form onSubmit={handleSubmit} className="d-flex flex-column gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_EXT.join(',')}
          onChange={handleFileChange}
        />

        {filename && (
          <div className="text-muted small">
            Archivo seleccionado: <strong>{filename}</strong>
          </div>
        )}

        <div className="d-flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={uploading || !file}>
            {uploading ? 'Subiendo…' : 'Subir'}
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={resetAll}
            disabled={uploading && !preview && !errors.length}
          >
            Limpiar
          </button>
        </div>
      </form>

      {errors.length > 0 && (
        <div className="alert alert-danger mt-3" role="alert">
          <ul className="m-0 ps-3">
            {errors.map((e, i) => <li key={i}>{String(e)}</li>)}
          </ul>
        </div>
      )}

      {preview && (
        <div className="mt-4">
          <h3 className="h5">Vista previa</h3>
          <div
            className="border rounded p-2"
            style={{ maxHeight: '60vh', overflow: 'auto', background: '#fff' }}
            // El backend devuelve HTML seguro para mostrar (tabla/resumen)
            dangerouslySetInnerHTML={{ __html: preview }}
          />
          <div className="mt-3 d-flex gap-2">
            <button
              type="button"
              className="btn btn-success"
              onClick={() => navigate('/carga-datos/confirmar', { state: { records } })}
              disabled={!records.length}
              title={!records.length ? 'Primero generá la vista previa válida' : 'Confirmar y aplicar'}
            >
              Confirmar carga
            </button>
            {!records.length && (
              <small className="text-muted align-self-center">
                * Si este botón está deshabilitado, volvé a subir el archivo.
              </small>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
