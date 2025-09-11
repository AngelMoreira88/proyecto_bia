// frontend/src/components/ModificarMasivo.jsx
import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../services/api';

const ALLOWED_EXT = ['.csv', '.xls', '.xlsx'];
const MAX_FILE_MB = 20;

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

  // ====== LISTA COMPLETA DE COLUMNAS del models.py (excepto 'id' e 'id_pago_unico') ======
  // Si agregás campos al modelo, sumalos acá para que salgan en la plantilla.
  const MODEL_FIELDS_EXCEPT_KEY = [
    'creditos',
    'propietario',
    'entidadoriginal',
    'entidadinterna',
    'entidad',              // FK: colocar el ID numérico de la entidad
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

  // ====== PLANTILLA XLSX ======
  const buildTemplateAOA = () => {
    // Cabecera: clave + __op + todas las columnas editables
    const header = ['id_pago_unico', '__op', ...MODEL_FIELDS_EXCEPT_KEY];

    // Filas de ejemplo:
    // - UPDATE: no cambies id_pago_unico (solo identifica el registro)
    // - INSERT: id_pago_unico debe ser único/nuevo
    // - DELETE: se ignoran otros campos
    const rowUpdate = [
      '10001', 'UPDATE',
      // Relleno rápido para algunas columnas, el resto vacío:
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
      // El resto de columnas importa poco para DELETE:
      ...Array(MODEL_FIELDS_EXCEPT_KEY.length).fill('')
    ];

    return [header, rowUpdate, rowInsert, rowDelete];
  };

  const downloadTemplateXLSX = () => {
    const aoa = buildTemplateAOA();
    const ws  = XLSX.utils.aoa_to_sheet(aoa);

    // Anchos de columnas dinámicos (un poco más anchos para campos largos)
    const headers = aoa[0];
    ws['!cols'] = headers.map((h, i) => {
      const base = Math.min(Math.max((String(h).length + 2), 12), 32);
      // agrandar un poco columnas conocidas
      const wider = ['nombre_apellido', 'provincia', 'entidadoriginal', 'entidadinterna', 'mail1', 'mail2', 'mail3'];
      return { wch: wider.includes(h) ? Math.max(base, 22) : base };
    });

    // Hoja de instrucciones
    const instrucciones = [
      ['Cómo usar la planilla'],
      [
        "• 'id_pago_unico' es la clave de negocio: NO se modifica en UPDATE; se usa para identificar el registro."
      ],
      [
        "• '__op' es opcional: UPDATE (o vacío), INSERT, DELETE. Si lo dejás vacío, se infiere por diferencias."
      ],
      [
        "• Para UPDATE completá solo las columnas a modificar; dejá vacías las que no cambian."
      ],
      [
        "• Para INSERT, 'id_pago_unico' debe ser nuevo y único."
      ],
      [
        "• Para DELETE solo se usa 'id_pago_unico'; el resto de columnas se ignoran."
      ],
      [
        "• Formatos: fechas YYYY-MM-DD; decimales con punto; 'entidad' es el ID numérico de la entidad."
      ],
      [
        "• Esta plantilla incluye TODAS las columnas del modelo; podés borrar columnas que no necesites para tu UPDATE."
      ],
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet(instrucciones);
    wsInfo['!cols'] = [{ wch: 110 }];

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
    // nueva clave de idempotencia si volvés a empezar
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
      // NO setear Content-Type, que lo ponga el navegador
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
        <div className="card-header bg-white border-0">
          <strong className="text-bia">Cómo usar este módulo</strong>
        </div>
        <div className="card-body">
          <ol className="mb-3">
            <li className="mb-1">
              Descargá la{' '}
              <button
                type="button"
                className="btn btn-sm btn-outline-primary btn-outline-bia"
                onClick={downloadTemplateXLSX}
              >
                plantilla .xlsx
              </button>
              .
            </li>
            <li className="mb-1">
              Completá una fila por registro. <strong>Obligatorio:</strong>{' '}
              <code>id_pago_unico</code> (o <code>business_key</code>) como clave de negocio.
              <br />
              <span className="text-muted small">No modifiques la clave para UPDATE; solo identifica el registro.</span>
            </li>
            <li className="mb-1">
              <strong>Acciones</strong> (<code>__op</code>):{' '}
              <span className="badge text-bg-warning">UPDATE</span> /{' '}
              <span className="badge text-bg-success">INSERT</span> /{' '}
              <span className="badge text-bg-danger">DELETE</span> /{' '}
              <span className="badge text-bg-secondary">NOCHANGE</span> (o vacío).
            </li>
            <li className="mb-1">
              Guardá el archivo como <code>.xlsx</code> (también acepta <code>.xls</code> o <code>.csv</code>) y{' '}
              <strong>subilo</strong>.
            </li>
            <li>
              Presioná <em>Validar / Previsualizar</em>. Si está todo ok,{' '}
              <strong>Confirmar cambios</strong>.
            </li>
          </ol>
          <div className="small text-muted">
            La plantilla incluye <strong>todas las columnas</strong> del modelo; para UPDATE podés dejar en blanco
            las que no quieras modificar. Para INSERT completá lo necesario; para DELETE solo la clave.
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
