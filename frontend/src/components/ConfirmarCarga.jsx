// frontend/src/components/ConfirmarCarga.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import Header from './Header';

export default function ConfirmarCarga() {
  const navigate = useNavigate();
  const location = useLocation();

  // Desde UploadForm:
  // { uploadId, totalRows, fileName }
  const { uploadId, totalRows, fileName } = location.state || {};

  const [loading, setLoading] = useState(true);
  const [okMsg, setOkMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [metrics, setMetrics] = useState({});

  // ---- Idempotencia en el cliente ----
  const makeUUID = () =>
    (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : `${Math.random().toString(36).slice(2)}-${Date.now()}`;

  const idemKeyRef = useRef(makeUUID());
  const didRunRef = useRef(false);

  const confirmar = async () => {
    setLoading(true);
    setOkMsg('');
    setErrMsg('');
    setMetrics({});

    if (!uploadId) {
      setErrMsg('No se encontró información de la carga (uploadId). Volvé a la pantalla de subida.');
      setLoading(false);
      return;
    }

    const payload = { upload_id: uploadId };

    try {
      const res = await api.post('/api/carga-datos/confirmar/', payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idemKeyRef.current,
        },
      });

      const status = res?.status ?? 0;
      const data = res?.data || {};

      const hasCounts =
        typeof data.created_count === 'number' ||
        typeof data.updated_count === 'number' ||
        typeof data.skipped_count === 'number' ||
        typeof data.errors_count === 'number';

      const inferredSuccess =
        data.success === true ||
        (status >= 200 &&
          status < 300 &&
          !data.error &&
          !data.errors &&
          hasCounts);

      if (inferredSuccess) {
        const parts = [];
        if (typeof data.created_count === 'number') parts.push(`creados: ${data.created_count}`);
        if (typeof data.updated_count === 'number') parts.push(`actualizados: ${data.updated_count}`);
        if (typeof data.skipped_count === 'number') parts.push(`omitidos: ${data.skipped_count}`);
        if (typeof data.errors_count === 'number') parts.push(`errores: ${data.errors_count}`);
        if (data.idempotent_replay) parts.push('idempotente (sin duplicar)');

        setMetrics({
          created_count: data.created_count,
          updated_count: data.updated_count,
          skipped_count: data.skipped_count,
          errors_count: data.errors_count,
          idempotent_replay: !!data.idempotent_replay,
        });

        setOkMsg(
          `✅ Carga confirmada${parts.length ? ` (${parts.join(' · ')})` : ''}.`
        );
      } else {
        const backendErrors =
          Array.isArray(data.errors)
            ? data.errors.join(' | ')
            : typeof data.error === 'string'
              ? data.error
              : Object.entries(data.errors || {})
                  .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : String(v)}`)
                  .join(' | ');

        setErrMsg(backendErrors || '❌ Hubo un problema al confirmar la carga.');
      }
    } catch (err) {
      console.error('Error al confirmar carga:', err);
      const status = err?.response?.status;
      const data = err?.response?.data;

      // Caso especial: timeout/proxy de Azure -> Network Error (sin response) o 504/499
      const isTimeoutLike =
        !err.response ||                      // CORS bloquea la respuesta de error
        status === 499 ||
        status === 504 ||
        err.code === 'ECONNABORTED' ||
        err.message === 'Network Error';

      if (isTimeoutLike) {
        setErrMsg(
          '⚠️ El servidor tardó demasiado en responder y la conexión se cortó. ' +
          'Es muy probable que la carga se haya aplicado igual. ' +
          'Verificá en el portal o abrí "Ver errores / resumen" para confirmar.'
        );
      } else {
        const readable =
          data && typeof data === 'object'
            ? Object.entries(data)
                .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : String(v)}`)
                .join(' | ')
            : '';
        setErrMsg(readable || '❌ Error al confirmar la carga.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;
    confirmar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToPortal = () => navigate('/portal');
  const goToErrores = () => navigate('/carga-datos/errores');

  return (
    <>
      <Header />
      <div className="container d-flex flex-column justify-content-center align-items-center min-vh-100">
        <div className="card shadow p-4" style={{ maxWidth: 640, width: '100%' }}>
          <h2 className="text-center text-primary mb-3">Confirmar Carga</h2>

          {(fileName || totalRows) && (
            <div className="text-center text-muted mb-3">
              {fileName && (
                <div>
                  Archivo: <strong>{fileName}</strong>
                </div>
              )}
              {typeof totalRows === 'number' && (
                <div>
                  Filas detectadas: <strong>{totalRows}</strong>
                </div>
              )}
            </div>
          )}

          {loading && (
            <div className="alert alert-info text-center" role="alert">
              Procesando confirmación…
            </div>
          )}

          {!loading && okMsg && (
            <div className="alert alert-success text-center" role="alert">
              {okMsg}
            </div>
          )}

          {!loading && errMsg && (
            <div className="alert alert-danger text-center" role="alert">
              {errMsg}
            </div>
          )}

          {!loading && !errMsg && (
            <div className="text-center text-muted mb-2">
              {typeof metrics.created_count === 'number' && (
                <div>
                  Creados: <strong>{metrics.created_count}</strong>
                </div>
              )}
              {typeof metrics.updated_count === 'number' && (
                <div>
                  Actualizados: <strong>{metrics.updated_count}</strong>
                </div>
              )}
              {typeof metrics.skipped_count === 'number' && (
                <div>
                  Omitidos: <strong>{metrics.skipped_count}</strong>
                </div>
              )}
              {typeof metrics.errors_count === 'number' && (
                <div>
                  Errores: <strong>{metrics.errors_count}</strong>
                </div>
              )}
              {metrics.idempotent_replay && (
                <div className="small text-success">
                  Operación idempotente: sin duplicar inserciones.
                </div>
              )}
            </div>
          )}

          <div className="d-flex justify-content-center gap-2 mt-2">
            {!loading && (
              <>
                <button className="btn btn-outline-secondary" onClick={goToPortal}>
                  Volver al portal
                </button>

                <button className="btn btn-outline-primary" onClick={confirmar}>
                  Reintentar
                </button>

                <button
                  className="btn btn-success"
                  onClick={goToErrores}
                  title="Ver errores / resumen de validación"
                >
                  Ver errores / resumen
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
