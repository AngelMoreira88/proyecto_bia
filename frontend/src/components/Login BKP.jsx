// frontend/src/components/Login.jsx
import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { login } from '../services/auth';


export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Al montar, pedimos la página de login para obtener la cookie CSRF
  useEffect(() => {
    api.get('/accounts/login/').catch(() => {
      /* no nos importa la respuesta, solo la cookie */
    });
  }, []);

  const handleSubmit = async e => {
    e.preventDefault();
    try {
      await login(username, password);
      window.location.href = '/carga-datos';
    } catch {
      setError('Usuario o contraseña inválidos');
    }
  };

  return (
    <div style={{ maxWidth: 300, margin: '2rem auto' }}>
      <h2>Iniciar Sesión</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Usuario</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem', margin: '0.5rem 0' }}
          />
        </div>
        <div>
          <label>Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem', margin: '0.5rem 0' }}
          />
        </div>
        <button
          type="submit"
          style={{ padding: '0.5rem 1rem', marginTop: '1rem' }}
        >
          Entrar
        </button>
        {error && <p style={{ color: 'red', marginTop: '1rem' }}>{error}</p>}
      </form>
      <h1 className="text-4xl font-bold text-blue-600">
        ¡Tailwind está funcionando!
      </h1>
    </div>
  );

}
