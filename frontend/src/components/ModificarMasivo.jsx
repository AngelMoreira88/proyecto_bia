// frontend/src/components/ModificarMasivo.jsx
import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../services/api';

const ALLOWED_EXT = ['.csv', '.xls', '.xlsx'];
const MAX_FILE_MB = 20;

// Campos del models.py (todas las columnas de db_bia, sin 'id')
const ALL_MODEL_FIELDS = [
  'creditos',
  'propietario',
  'entidadoriginal',
  'entidadinterna',
  'entidad',              // FK: cargar ID numérico o nombre (el backend resuelve)
  'grupo',
  'tramo',
  'comision',
  'dni',
  'cuit',
  'nombre_apellido',
  'fecha_apertura',
  'fecha_deuda',
  'saldo_capital',
  'saldo_exigible',
  'interes_diario',
  'interes_total',
  'saldo_actualizado',
  'cancel_min',
  'cod_rp',
  'agencia',
  'estado',
  'sub_estado',
  'tel1',
  'tel2',
  'tel3',
  'tel4',
  'tel5',
  'mail1',
  'mail2',
  'mail3',
  'provincia',
  'pago_acumulado',
  'ultima_fecha_pago',
  'fecha_plan',
  'anticipo',
  'cuotas',
  'importe',
  'total_plan',
  'saldo',
];

// Campos que NO se pueden modificar en UPDATE (el backend los ignora)
const NON_EDITABLE_IN_UPDATE = ['id_pago_unico', 'fecha_apertura'];

export default function ModificarMasivo() {
  const navigate = useNavigate();

  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState([]);
  const [uploading, setUploading] = useState(false);

  const [previewHtml, setPreviewHtml] = useState('');
  const [summary, setSummary] = useState(null); // métricas backend
  const [jobId, setJobId] = useState(null);     // id del BulkJob

  const inputRef = useRef(null);

  // ---- Idempotencia para "Confirmar" ----
  const makeUUID = () =>
    (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : `${Math.random().toString(36).slice(2)}-${Date.now()}`;

  const idemKeyRef = useRef(makeUUID());

  const filename = useMemo(() => file?.name || '', [file]);

  // ====== Descargar la BASE desde el backend (todas las columnas + __op) ======
  const downloadExportXLSX = async () => {
    try {
      const res = await api.get('/carga-datos/api/bulk-update/export.xlsx', {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'db_bia_export.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('No se pudo descargar el Excel:', err);
      alert('No se pudo descargar el Excel. Verificá que estés logueado.');
    }
  };

  // ====== PLANTILLA XLSX (completa, generada en front) ======
  const buildTemplateAOA = () => {
    const header = ['id_pago_unico', '__op', ...ALL_MODEL_FIELDS];

    const rowUpdate = [
      '10001', 'UPDATE',
      'CRED-XYZ', 'BANCO DEMO', 'ORIGINAL S.A.', 'INT-01', 1,
      'G1', 'T1', '10.50', '30111222', '20-30111222-3', 'Juan Pérez',
      '2024-01-10', '2024-02-15', '1000.00', '1500.00', '0.1234', '200.00', '1700.00',
      'NO', 'A1', 'Sucursal Centro', 'ACTIVO', 'CONTACTADO',
      '111111', '222222', '', '', '', 'jperez@demo.com', '', '',
      'Buenos Aires', '500.00', '2024-06-01', '2024-06-10', '50.00', 12, '100.00', '1200.00', '700.00'
    ];

    const rowInsert = [
      '20001', 'INSERT',
      'CRED-NEW', 'BANCO NUEVO', 'ORIG NUEVA', 'INT-02', 2,
      'G2', 'T2', '15.00', '40222333', '20-40222333-8', 'Ana Gómez',
      '2024-03-01', '2024-04-01', '2000.00', '2500.00', '0.0456', '300.00', '2800.00',
      'SI', 'B2', 'Sucursal Norte', 'NUEVO', 'PENDIENTE',
      '333333', '', '', '', '', 'agomez@demo.com', '', '',
      'Córdoba', '0.00', '', '', '0.00', 0, '0.00', '0.00', '0.00'
    ];

    const rowDelete = [
      '30001', 'DELETE',
      ...Array(ALL_MODEL_FIELDS.length).fill('')
    ];

    return [header, rowUpdate, rowInsert, rowDelete];
  };

  // ====== PLANTILLA XLSX (mínima, solo columnas necesarias para UPDATE) ======
  const buildTemplateMinimalAOA = () => {
    const header = ['id_pago_unico', '__op', 'estado']; // ejemplo mínimo
    const rowUpdate = ['12345', 'UPDATE', 'CONTACTADO'];
    const rowNoChange = ['67890', 'NOCHANGE', '']; // ilustrativo
    return [header, rowUpdate, rowNoChange];
  };

  const downloadTemplateXLSX = () => {
    const aoa = buildTemplateAOA();
    const ws  = XLSX.utils.aoa_to_sheet(aoa);

    const headers = aoa[0];
    ws['!cols'] = headers.map((h) => {
      const base = Math.min(Math.max((String(h).length + 2), 12), 32);
      const wider = ['nombre_apellido', 'provincia', 'entidadoriginal', 'entidadinterna', 'mail1', 'mail2', 'mail3'];
      return { wch: wider.includes(h) ? Math.max(base, 22) : base };
    });

    const instrucciones = [
      ['Cómo usar la planilla (COMPLETA)'],
      ['• Para UPDATE, NO hace falta enviar todas las columnas: incluí solo las que vas a cambiar + id_pago_unico + __op=UPDATE.'],
      ['• __op: UPDATE (o vacío), INSERT, DELETE, NOCHANGE.'],
      ['• Para UPDATE podés dejar fuera columnas no modificadas (recomendado).'],
      ['• Para INSERT, podés dejar id_pago_unico vacío: el backend lo autogenera.'],
      ['• Para DELETE, alcanza con id_pago_unico + __op=DELETE.'],
      ['• Fechas: YYYY-MM-DD; fecha_deuda debe ser anterior a fecha_apertura; fecha_apertura se completa si falta.'],
      ['• "entidad" puede ser ID o nombre (el backend resuelve).'],
      [`• En UPDATE, el backend ignora: ${NON_EDITABLE_IN_UPDATE.join(', ')} (si los envías con cambios).`],
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet(instrucciones);
    wsInfo['!cols'] = [{ wch: 120 }];

    const wb  = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Datos');
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Guía');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob  = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_modificacion_masiva.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadTemplateMinimalXLSX = () => {
    const aoa = buildTemplateMinimalAOA();
    const ws  = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 18 }];

    const instrucciones = [
      ['Cómo usar la planilla (MÍNIMA)'],
      ['• UPDATE mínimo: id_pago_unico + __op=UPDATE + solo las columnas a cambiar (ej.: estado).'],
      ['• No incluyas columnas que no vas a modificar (las vacías se ignoran).'],
      ['• Campos no editables en UPDATE: id_pago_unico, fecha_apertura.'],
      ['• Estados especiales (unicidad blanda): CANCELADO / CON DEUDA.'],
      ['• __op: UPDATE (o vacío), INSERT, DELETE, NOCHANGE.'],
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet(instrucciones);
    wsInfo['!cols'] = [{ wch: 120 }];

    const wb  = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Datos');
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Guía (mínima)');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob  = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_minima_update.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ====== VALIDACIONES DE ARCHIVO ======
  const validateFile = (f) => {
    if (!f) return 'Seleccioná un archivo.';
    const lower = f.name.toLowerCase();
    if (!ALLOWED_EXT.some((ext) => lower.endsWith(ext))) {
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
    setFile(f);
    setErrors([]);
    setPreviewHtml('');
    setSummary(null);
    setJobId(null);
    const vErr = validateFile(f);
    if (vErr) setErrors([vErr]);
  };

  const resetAll = () => {
    setFile(null);
    setErrors([]);
    setUploading(false);
    setPreviewHtml('');
    setSummary(null);
    setJobId(null);
    if (inputRef.current) inputRef.current.value = '';
    idemKeyRef.current = makeUUID();
  };

  // ====== VALIDATE ======
  const validar = async (e) => {
    e?.preventDefault?.();
    setErrors([]);
    setPreviewHtml('');
    setSummary(null);
    setJobId(null);

    const vErr = validateFile(file);
    if (vErr) {
      setErrors([vErr]);
      return;
    }

    const form = new FormData();
    form.append('archivo', file);

    try {
      setUploading(true);
      const res = await api.post('/carga-datos/api/bulk-update/validate', form);
      const data = res?.data || {};

      if (data.success) {
        setPreviewHtml(String(data.preview || ''));
        setSummary(data.summary || null);
        setJobId(data.job_id || null);
      } else {
        const readable =
          Array.isArray(data.errors) ? data.errors.join(' | ')
          : data.error || 'Validación rechazada.';
        setErrors([readable]);
      }
    } catch (err) {
      console.error('Error en validate:', err);
      const data = err?.response?.data;
      const readable =
        data && typeof data === 'object'
          ? (data.error || data.detail ||
            (Array.isArray(data.errors) ? data.errors.join(' | ')
              : Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : String(v)}`).join(' | ')))
          : 'Bad Request';
      setErrors([readable]);
    } finally {
      setUploading(false);
    }
  };

  // ====== COMMIT ======
  const confirmar = async () => {
    setErrors([]);

    if (!jobId) {
      setErrors(["No hay 'job_id'. Primero validá el archivo."]);
      return;
    }
    if (summary && typeof summary.ok === 'number' && summary.ok === 0) {
      setErrors(["No hay cambios aplicables en este archivo (ok=0)."]);
      return;
    }

    try {
      setUploading(true);
      const headers = {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idemKeyRef.current,
      };

      const payload = { job_id: jobId };

      const res = await api.post('/carga-datos/api/bulk-update/commit', payload, { headers });
      const data = res?.data || {};

      if (data.success) {
        const parts = [];
        if (typeof data.updated_rows === 'number') parts.push(`actualizados: ${data.updated_rows}`);
        if (typeof data.inserted === 'number')    parts.push(`insertados: ${data.inserted}`);
        if (typeof data.deleted === 'number')     parts.push(`eliminados: ${data.deleted}`);
        alert(`✅ Confirmación OK${parts.length ? ` (${parts.join(' · ')})` : ''}`);
        navigate('/portal');
      } else {
        const readable =
          Array.isArray(data.errors) ? data.errors.join(' | ')
          : data.error || 'No se pudo confirmar.';
        setErrors([readable]);
      }
    } catch (err) {
      console.error('Error en commit:', err);
      const data = err?.response?.data;
      const details =
        data && typeof data === 'object'
          ? [
              data.error || data.detail ||
                (Array.isArray(data.errors) ? data.errors.join(' | ')
                  : Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : String(v)}`).join(' | ')),
              data.summary ? `Resumen: ${JSON.stringify(data.summary)}` : ''
            ].filter(Boolean).join(' | ')
          : 'Error al confirmar';
      setErrors([details]);
    } finally {
      setUploading(false);
    }
  };

  const confirmDisabled =
    uploading || !jobId || (summary && typeof summary.ok === 'number' && summary.ok === 0);

  return (
    <div className="container py-3">
      <h2 className="mb-1 text-bia">Modificación masiva</h2>
      {jobId && (
        <div className="text-muted small mb-3">
          Job ID: <code>{jobId}</code>
        </div>
      )}

      {/* ====== BLOQUE INSTRUCTIVO ====== */}
      <div className="card border-0 rounded-4 shadow-sm mb-3">
        <div className="card-header bg-white border-0 d-flex flex-wrap gap-2 align-items-center">
          <strong className="text-bia me-2">Cómo usar este módulo</strong>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary btn-outline-bia"
            onClick={downloadExportXLSX}
            title="Descargar la base actual en formato .xlsx"
          >
            Descargar base (.xlsx)
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={downloadTemplateXLSX}
            title="Descargar la planilla COMPLETA generada en el navegador"
          >
            Plantilla completa (.xlsx)
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={downloadTemplateMinimalXLSX}
            title="Descargar la planilla MÍNIMA para UPDATE"
          >
            Plantilla mínima (.xlsx)
          </button>
        </div>
        <div className="card-body">
          <ol className="mb-3">
            <li className="mb-1">
              Usá <strong>Descargar base</strong> o una <em>Plantilla</em>.
            </li>
            <li className="mb-1">
              <strong>Para UPDATE:</strong> incluí <code>id_pago_unico</code>, <code>__op=UPDATE</code> y
              <strong> solo las columnas que querés cambiar</strong>. No incluyas campos no editables:
              <code> {NON_EDITABLE_IN_UPDATE.join(', ')} </code>.
            </li>
            <li className="mb-1">
              <strong>Acciones</strong> (<code>__op</code>):{' '}
              <span className="badge text-bg-warning">UPDATE</span> /{' '}
              <span className="badge text-bg-success">INSERT</span> /{' '}
              <span className="badge text-bg-danger">DELETE</span> /{' '}
              <span className="badge text-bg-secondary">NOCHANGE</span> (o vacío).
            </li>
            <li className="mb-1">
              Guardá el archivo y <strong>subilo</strong>. Luego presioná <em>Validar / Previsualizar</em>.
              Si está todo ok, <strong>Confirmar cambios</strong>.
            </li>
          </ol>
          <div className="small text-muted">
            Colores de la vista previa: <span className="badge text-bg-success">INSERT</span>,{' '}
            <span className="badge text-bg-warning">UPDATE</span>,{' '}
            <span className="badge text-bg-danger">errores</span>,{' '}
            <span className="badge text-bg-secondary">sin cambios</span>. Permisos: validar (admin/editor/aprobador),
            confirmar (admin/aprobador).
          </div>
        </div>
      </div>

      {/* ====== FORMULARIO ====== */}
      <form onSubmit={validar} className="d-flex flex-column gap-2">
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
          <button type="submit" className="btn btn-primary btn-bia" disabled={uploading || !file}>
            {uploading ? 'Procesando…' : 'Validar / Previsualizar'}
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={resetAll}
            disabled={uploading}
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

      {summary && (
        <div className="mt-3">
          <h3 className="h6 mb-2 text-bia">Resumen</h3>
          <pre className="small bg-light p-2 rounded border">
            {JSON.stringify(summary, null, 2)}
          </pre>
        </div>
      )}

      {previewHtml && (
        <div className="mt-4">
          <h3 className="h5 text-bia">Vista previa</h3>
          <div
            className="border rounded p-2 bg-white shadow-sm"
            style={{ maxHeight: '60vh', overflow: 'auto' }}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
          <div className="mt-3 d-flex flex-column flex-sm-row gap-2">
            <button
              type="button"
              className="btn btn-success"
              onClick={confirmar}
              disabled={confirmDisabled}
              title={!jobId ? "Primero validá para obtener un job_id" :
                (summary && summary.ok === 0 ? "No hay cambios aplicables (ok=0)" : "Confirmar cambios")}
            >
              Confirmar cambios
            </button>
            <small className="text-muted align-self-center">
              Se usa idempotencia para evitar duplicados si reintentás.
            </small>
          </div>
        </div>
      )}
    </div>
  );
}
