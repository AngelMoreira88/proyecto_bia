import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import Header from './Header';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  // Ruta a la que quería ir el usuario antes de loguearse
  const intended = location.state?.from?.pathname;
  // Si no había intención previa, redirigimos a /portal
  const defaultRedirect = '/portal';

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await axios.post('/api/token/', { username, password });
      const { access, refresh } = data;
      localStorage.setItem('access_token', access);
      localStorage.setItem('refresh_token', refresh);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access}`;

      // Forzamos actualización del header
      window.dispatchEvent(new Event('storage'));

      // Decidimos adónde navegar
      // — si venía con una intención (por ejemplo /carga-datos), la respetamos
      // — si no, vamos a /portal (HomePortalBia)
      const saved = localStorage.getItem('redirectAfterLogin');
      let target = intended || saved || defaultRedirect;
      // Si la intención era la raíz "/", la reemplazamos también por /portal
      if (target === '/' || target === '/login') {
        target = defaultRedirect;
      }
      localStorage.removeItem('redirectAfterLogin');
      navigate(target, { replace: true });
    } catch {
      setError('Credenciales inválidas. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header />
      <div className="container d-flex align-items-center justify-content-center min-vh-100" style={{ paddingTop: '88px' }}>
        <div className="card shadow-sm p-4" style={{ maxWidth: 400, width: '100%' }}>
          <h3 className="text-center text-primary mb-4">Iniciar sesión</h3>
          {error && <div className="alert alert-danger text-center">{error}</div>}
          <form onSubmit={handleLogin}>
            <div className="mb-3">
              <label htmlFor="username" className="form-label">Usuario</label>
              <input
                id="username"
                type="text"
                className="form-control"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="mb-3">
              <label htmlFor="password" className="form-label">Contraseña</label>
              <input
                id="password"
                type="password"
                className="form-control"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary w-100" disabled={loading}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
