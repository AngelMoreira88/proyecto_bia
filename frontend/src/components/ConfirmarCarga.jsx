// frontend/src/components/ConfirmarCarga.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation }    from 'react-router-dom';
import { confirmarCarga }              from '../services/api';

export default function ConfirmarCarga() {
  const [message, setMessage] = useState('');
  const [error, setError]     = useState('');
  const navigate              = useNavigate();
  const location              = useLocation();

  // Extraemos records del state que enviamos en el navigate()
  const records = location.state?.records || [];

  useEffect(() => {
    if (records.length === 0) {
      setError('❌ No hay datos para confirmar');
      return;
    }

    (async () => {
      try {
        const res = await confirmarCarga(records);
        if (res.data.success) {
          setMessage(`✅ Se crearon ${res.data.created_count} registros.`);
          // Opcional: redirigir luego de un ratito
          setTimeout(() => navigate('/carga-datos/errores'), 2000);
        } else {
          setError(res.data.error);
        }
      } catch (err) {
        setError('❌ Error al confirmar la carga.');
      }
    })();
  }, [navigate, records]);

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Confirmar Carga</h2>
      {message && <p style={{ color: 'green' }}>{message}</p>}
      {error   && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}
