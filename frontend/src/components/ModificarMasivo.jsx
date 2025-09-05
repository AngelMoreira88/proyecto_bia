// frontend/src/components/ModificarMasivo.jsx
import React, { useMemo, useRef, useState } from 'react';
import { bulkValidar, bulkCommit } from '../services/api';
import { getUserRole } from '../services/auth';
import BackHomeLink from './BackHomeLink';

const MAX_FILE_MB = 20;
const ALLOWED_EXT = ['.csv', '.xls', '.xlsx'];

export default function ModificarMasivo() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [errors, setErrors] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [jobId, setJobId] = useState('');
  const inputRef = useRef(null);

  const isAuthorized = ['admin', 'approver', 'editor'].includes(getUserRole?.() || '');

  const filename = useMemo(() => file?.name || '', [file]);

  const validateFile = (f) => {
    if (!f) return 'Seleccioná un archivo.';
    const lower = f.name.toLowerCase();
    if (!ALLOWED_EXT.some(ext => lower.endsWith(ext))) {
      return `Formato no permitido. Usá: ${ALLOWED_EXT.join(', ')}`;
    }
    const sizeMB = f.size / (1024 * 1024);
    if (sizeMB > MAX_FILE_MB) return `El archivo supera ${MAX_FILE_MB} MB.`;
    return null;
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0] ?? null;
    setErrors([]);
    setPreview('');
    setJobId('');
    setFile(f);
    const vErr = validateFile(f);
    if (vErr) setErrors([vErr]);
  };

  const resetAll = () => {
    setFile(null);
    setPreview('');
    setErrors([]);
    setProcessing(false);
    setJobId('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleValidate = async (e) => {
    e.preventDefault();
    setErrors([]);
    setPreview('');
    setJobId('');

    const vErr = validateFile(file);
    if (vErr) { setErrors([vErr]); return; }

    const formData = new FormData();
    formData.append('archivo', file);

    try {
      setProcessing(true);
      const { data } = await bulkValidar(formData);
      if (data?.success) {
        setJobId(String(data.job_id || ''));
        setPreview(String(data.preview || ''));
      } else {
        const backendErrors =
          Array.isArray(data?.errors) ? data.errors :
          typeof data?.errors === 'string' ? [data.errors] :
          ['Error de validación.'];
        setErrors(backendErrors);
      }
    } catch (err) {
      console.error(err);
      setErrors(['Error al validar el archivo.']);
    } finally {
      setProcessing(false);
    }
  };

  const handleCommit = async () => {
    if (!jobId) return;
    try {
      setProcessing(true);
      const { data } = await bulkCommit(jobId);
      if (data?.success) {
        alert('Cambios aplicados correctamente.');
        resetAll();
      } else {
        const backendErrors =
          Array.isArray(data?.errors) ? data.errors :
          typeof data?.errors === 'string' ? [data.errors] :
          ['No se pudo aplicar el ajuste masivo.'];
        setErrors(backendErrors);
      }
    } catch (err) {
      console.error(err);
      setErrors(['Error al aplicar los cambios.']);
    } finally {
      setProcessing(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="container py-3">
        <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between mb-2">
          <h2 className="mb-2 mb-md-0">Modificar Masivo — Ajuste de columnas desde Excel</h2>
          <BackHomeLink className="btn btn-outline-bia">Volver al home</BackHomeLink>
        </div>
        <div className="alert alert-warning">
          No tenés permisos para acceder a este módulo. Contactá a un administrador.
        </div>
      </div>
    );
  }

  return (
    <div className="container py-3">
      {/* Encabezado con Volver al home */}
      <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between mb-2">
        <h2 className="mb-2 mb-md-0">Modificar Masivo — Ajuste de columnas desde Excel</h2>
        <BackHomeLink className="btn btn-outline-bia">Volver al home</BackHomeLink>
      </div>
      <p className="text-muted">
        Subí un archivo con la <strong>clave de negocio</strong> (p. ej. <code>id_pago_unico</code>) y las columnas a ajustar.
        Primero validamos y mostramos <em>vista previa de cambios</em>. Luego podés confirmar para aplicar.
      </p>

      <div className="card mb-3">
        <div className="card-body">
          <h5 className="card-title mb-3">Instrucciones</h5>
          <ul className="mb-0">
            <li>Formatos admitidos: <code>{ALLOWED_EXT.join(', ')}</code>. Máx: {MAX_FILE_MB}MB.</li>
            <li>Incluí la columna clave (p. ej. <code>id_pago_unico</code>) y solo las columnas a modificar.</li>
            <li>Opcional: agregá <code>__op</code> con <code>UPDATE</code>/<code>INSERT</code>/<code>DELETE</code> (según reglas del backend).</li>
            <li>Los cambios se aplican en transacción y quedan auditados.</li>
          </ul>
        </div>
      </div>

      <form onSubmit={handleValidate} className="d-flex flex-column gap-2">
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

        <div className="d-flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary" disabled={processing || !file}>
            {processing ? 'Procesando…' : 'Validar (Vista previa)'}
          </button>
          <button type="button" className="btn btn-success" onClick={handleCommit} disabled={!jobId || processing}>
            Confirmar y aplicar
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={resetAll} disabled={processing && !preview && !errors.length}>
            Limpiar
          </button>
          {/* También un volver secundario en la zona de acciones si querés */}
          <BackHomeLink className="btn btn-outline-bia">Volver</BackHomeLink>
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
          <h3 className="h5">Vista previa de cambios</h3>
          <div
            className="border rounded p-2"
            style={{ maxHeight: '60vh', overflow: 'auto', background: '#fff' }}
            // HTML seguro devuelto por el backend (tabla con diffs)
            dangerouslySetInnerHTML={{ __html: preview }}
          />
          <p className="small text-muted mt-2">
            Revisá los cambios propuestos. Si todo está correcto, presioná <strong>Confirmar y aplicar</strong>.
          </p>
        </div>
      )}
    </div>
  );
}
