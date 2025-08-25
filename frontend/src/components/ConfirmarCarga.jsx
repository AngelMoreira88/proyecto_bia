// frontend/src/components/ConfirmarCarga.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import Header from './Header';

export default function ConfirmarCarga() {
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [okMsg, setOkMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const confirmar = async () => {
    setLoading(true);
    setOkMsg('');
    setErrMsg('');

    // Si venían records desde la vista previa, los enviamos; si no, payload vacío.
    const records = location.state?.records;
    const payload =
      Array.isArray(records) && records.length > 0 ? { records } : {};

    try {
      const res = await api.post('/carga-datos/api/confirmar/', payload, {
        headers: { 'Content-Type': 'application/json' },
      });

      const data = res?.data || {};
      if (data.success) {
        // Construimos un mensaje amigable con métricas si existen
        const parts = [];
        if (typeof data.created_count === 'number') parts.push(`creados: ${data.created_count}`);
        if (typeof data.updated_count === 'number') parts.push(`actualizados: ${data.updated_count}`);
        if (typeof data.skipped_count === 'number') parts.push(`omitidos: ${data.skipped_count}`);
        if (typeof data.errors_count === 'number') parts.push(`errores: ${data.errors_count}`);

        setOkMsg(`✅ Carga confirmada${parts.length ? ` (${parts.join(' · ')})` : ''}.`);

        // Redirige a la vista de errores web (resumen) tras 2s
        setTimeout(() => navigate('/carga-datos/errores-web'), 2000);
      } else {
        // Normalizamos errores devueltos por backend
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
    // Si no hay records en state, igual confirmamos (backend tomará lo de sesión/cache)
    confirmar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

          <div className="d-flex justify-content-center gap-2 mt-2">
            {!loading && (
              <>
                <button className="btn btn-outline-secondary" onClick={() => navigate(-1)}>
                  Volver
                </button>
                <button className="btn btn-outline-primary" onClick={confirmar}>
                  Reintentar
                </button>
                <button
                  className="btn btn-success"
                  onClick={() => navigate('/carga-datos/errores-web')}
                >
                  Ver errores / resumen
                </button>
              </>
            )}
          </div>

          <p className="text-muted text-center mt-3">
            {loading ? 'No cierres esta ventana…' : 'Redirigiendo automáticamente…'}
          </p>
        </div>
      </div>
    </>
  );
}
