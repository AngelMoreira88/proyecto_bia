// frontend/src/components/UploadForm.jsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { subirExcel } from '../services/api';

const EXT_PERMITIDAS = ['csv', 'xls', 'xlsx'];
const MIME_OK = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const validarArchivo = (file) => {
  if (!file) return false;
  const ext = (file.name?.split('.').pop() || '').toLowerCase();
  if (EXT_PERMITIDAS.includes(ext)) return true;
  if (MIME_OK.includes(file.type)) return true;
  return false;
};

export default function UploadForm() {
  const [archivo, setArchivo] = useState(null);
  const [previewHtml, setPreview] = useState('');
  const [error, setError] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const seleccionarArchivo = useCallback((file) => {
    if (!file) return;
    if (!validarArchivo(file)) {
      setArchivo(null);
      setError('Formato no permitido. Usá .csv, .xls o .xlsx');
      setPreview('');
      return;
    }
    setArchivo(file);
    setError('');
    setPreview('');
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    seleccionarArchivo(file);
  };

  // Drag & drop
  const handleDragOver  = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true);  };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
    const file = e.dataTransfer.files?.[0] || null;
    seleccionarArchivo(file);
  };

  const handleClickDropzone = () => fileInputRef.current?.click();
  const handleKeyDropzone = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); }
  };

  const handleClear = () => {
    setArchivo(null);
    setError('');
    setPreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    if (!archivo) { setError('Seleccioná un archivo primero'); return; }
    const formData = new FormData();
    formData.append('archivo', archivo);

    try {
      setSubiendo(true);
      setError('');
      const res = await subirExcel(formData);
      if (res.data?.success) {
        setPreview(res.data.preview || '');
        navigate('/carga-datos/confirmar', { state: { records: res.data.data } });
      } else {
        const msg = (res.data?.errors || []).join(', ') || 'No se pudo procesar el archivo';
        setError(msg);
      }
    } catch {
      setError('Error al subir el archivo');
    } finally {
      setSubiendo(false);
    }
  };

  const onPaste = useCallback((e) => {
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      const candidate = Array.from(files).find(validarArchivo) || null;
      if (candidate) seleccionarArchivo(candidate);
    }
  }, [seleccionarArchivo]);

  useEffect(() => {
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onPaste]);

  return (
    <div className="page-fill d-flex align-items-center bg-app">
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-12 col-lg-10 col-xl-8">
            <div className="card shadow-sm border-0 rounded-4 w-100">
              <div className="card-body p-4 p-md-5">
                <h2 className="text-bia fw-bold text-center mb-2">Subir Archivo Excel</h2>
                <p className="text-secondary text-center mb-4">
                  Cargá un <span className="fw-semibold">.xls/.xlsx</span> o <span className="fw-semibold">.csv</span> para actualizar deudores.
                </p>

                {/* Dropzone */}
                <div
                  className={`dropzone-bia ${dragOver ? 'dragover' : ''}`}
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={handleClickDropzone}
                  onKeyDown={handleKeyDropzone}
                  role="button"
                  tabIndex={0}
                  aria-label="Arrastrá y soltá, hacé clic para seleccionar, o pegá con Ctrl/Cmd+V"
                >
                  <input
                    ref={fileInputRef}
                    id="archivo"
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    onChange={handleFileChange}
                    hidden
                  />
                  <div className="d-flex align-items-center justify-content-center gap-3 flex-wrap">
                    <div className="modern-icon" aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"
                              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div className="text-center">
                      <div className="fw-semibold">Arrastrá y soltá el archivo aquí</div>
                      <small className="text-secondary">o hacé clic para seleccionarlo</small>
                      <div className="small text-secondary mt-1">También podés <strong>pegar (Ctrl/Cmd+V)</strong></div>
                      <div className="small text-secondary mt-1">Formatos: .csv, .xls, .xlsx</div>
                    </div>
                  </div>
                </div>

                {/* Archivo elegido */}
                {archivo && (
                  <div className="alert bg-bia-subtle border-bia mt-3 mb-2 d-flex justify-content-between align-items-center">
                    <div className="me-2">
                      <div className="fw-semibold text-bia">{archivo.name || 'archivo'}</div>
                      <small className="text-secondary">
                        {archivo.size ? `${(archivo.size / 1024).toFixed(1)} KB` : '—'}
                      </small>
                    </div>
                    <button className="btn btn-outline-bia btn-sm" onClick={handleClear}>
                      Quitar
                    </button>
                  </div>
                )}

                {/* Acciones */}
                <div className="d-flex flex-wrap justify-content-center gap-2 mt-3">
                  <button
                    className="btn btn-bia"
                    onClick={handleUpload}
                    disabled={subiendo || !archivo}
                  >
                    {subiendo && <span className="spinner-border spinner-border-sm me-2" />}
                    {subiendo ? 'Subiendo…' : 'Subir y previsualizar'}
                  </button>
                  <Link to="/portal" className="btn btn-outline-bia">Volver</Link>
                </div>

                {/* Errores */}
                {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}

                {/* Previsualización */}
                {previewHtml && (
                  <div className="card mt-4 border-0">
                    <div
                      className="card-body border rounded-3"
                      style={{ maxHeight: 280, overflow: 'auto' }}
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
