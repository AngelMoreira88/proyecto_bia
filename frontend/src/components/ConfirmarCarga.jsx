// frontend/src/components/ConfirmarCarga.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { confirmarCarga } from '../services/api';
import Header from './Header';

export default function ConfirmarCarga() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const records = location.state?.records || [];

    if (records.length === 0) {
      setError('❌ No hay datos para confirmar.');
      return;
    }

    (async () => {
      try {
        const res = await confirmarCarga(records);
        if (res.data.success) {
          setMessage(`✅ Se crearon ${res.data.created_count} registros.`);
          setTimeout(() => navigate('/carga-datos/errores'), 2000);
        } else {
          setError(res.data.error || 'Hubo un problema con la carga.');
        }
      } catch {
        setError('❌ Error al confirmar la carga.');
      }
    })();
  }, [navigate, location.state]);

  return (
    <>
      <Header />
      <div className="container d-flex flex-column justify-content-center align-items-center min-vh-100">
        <div className="card shadow p-4" style={{ maxWidth: 600, width: '100%' }}>
          <h2 className="text-center text-primary mb-4">Confirmar Carga</h2>

          {message && (
            <div className="alert alert-success text-center" role="alert">
              {message}
            </div>
          )}

          {error && (
            <div className="alert alert-danger text-center" role="alert">
              {error}
            </div>
          )}

          <p className="text-muted text-center">Redirigiendo automáticamente...</p>
        </div>
      </div>
    </>
  );
}
