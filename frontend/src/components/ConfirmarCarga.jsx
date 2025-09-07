// frontend/src/components/ConfirmarCarga.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import Header from './Header';
import BackHomeLink from './BackHomeLink'; // si lo tenés, opcional

export default function ConfirmarCarga() {
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [okMsg, setOkMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [metrics, setMetrics] = useState({}); // created_count, updated_count, etc.

  const confirmar = async () => {
    setLoading(true);
    setOkMsg('');
    setErrMsg('');
    setMetrics({});

    // Si venían records desde la vista previa, los enviamos; si no, payload vacío (usa sesión backend)
    const records = location.state?.records;
    const payload =
      Array.isArray(records) && records.length > 0 ? { records } : {};

    try {
      const res = await api.post('/carga-datos/api/confirmar/', payload, {
        headers: { 'Content-Type': 'application/json' },
      });

      const data = res?.data || {};
      if (data.success) {
        const parts = [];
        if (typeof data.created_count === 'number') parts.push(`creados: ${data.created_count}`);
        if (typeof data.updated_count === 'number') parts.push(`actualizados: ${data.updated_count}`);
        if (typeof data.skipped_count === 'number') parts.push(`omitidos: ${data.skipped_count}`);
        if (typeof data.errors_count === 'number') parts.push(`errores: ${data.errors_count}`);
        setMetrics({
          created_count: data.created_count,
          updated_count: data.updated_count,
          skipped_count: data.skipped_count,
          errors_count: data.errors_count,
        });
        setOkMsg(`✅ Carga confirmada${parts.length ? ` (${parts.join(' · ')})` : ''}.`);
        // ❌ Ya no redirigimos automáticamente a errores.
      } else {
        const backendErrors =
          Array.isArray(data.errors) ? data.errors.join(' | ') :
          typeof data.error === 'string' ? data.error :
          Object.entries(data.errors || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : String(v)}`).join(' | ');
        setErrMsg(backendErrors || '❌ Hubo un problema al confirmar la carga.');
      }
    } catch (err) {
      console.error('Error al confirmar carga:', err);
      const data = err?.response?.data;
      const readable =
        data && typeof data === 'object'
          ? Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : String(v)}`).join(' | ')
          : '';
      setErrMsg(readable || '❌ Error al confirmar la carga.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    confirmar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ErrorsButton = () => (
    <button
      className="btn btn-success"
      onClick={() => navigate('/carga-datos/errores')}
      title="Ver errores / resumen de validación"
    >
      Ver errores / resumen
    </button>
  );

  return (
    <>
      <Header />
      <div className="container d-flex flex-column justify-content-center align-items-center min-vh-100">
        <div className="card shadow p-4" style={{ maxWidth: 640, width: '100%' }}>
          <h2 className="text-center text-primary mb-3">Confirmar Carga</h2>

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
                <div>Creados: <strong>{metrics.created_count}</strong></div>
              )}
              {typeof metrics.updated_count === 'number' && (
                <div>Actualizados: <strong>{metrics.updated_count}</strong></div>
              )}
              {typeof metrics.skipped_count === 'number' && (
                <div>Omitidos: <strong>{metrics.skipped_count}</strong></div>
              )}
              {typeof metrics.errors_count === 'number' && (
                <div>Errores: <strong>{metrics.errors_count}</strong></div>
              )}
            </div>
          )}

          <div className="d-flex justify-content-center gap-2 mt-2">
            {!loading && (
              <>
                {/* Volver al portal */}
                <button className="btn btn-outline-secondary" onClick={() => navigate('/portal')}>
                  Volver al portal
                </button>

                {/* Reintentar confirmación */}
                <button className="btn btn-outline-primary" onClick={confirmar}>
                  Reintentar
                </button>

                {/* Ver errores/resumen sólo si querés revisarlos (puede devolver 404 si no hay) */}
                <ErrorsButton />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
