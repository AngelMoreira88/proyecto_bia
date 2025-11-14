// frontend/src/components/Login.jsx
import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { login as doLogin } from '../services/auth';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const intended = location.state?.from?.pathname;
  const defaultRedirect = '/portal';

  // const handleLogin = async (e) => {
  //   e.preventDefault();
  //   setError('');
  //   setLoading(true);

  //   try {
  //     const { data } = await axios.post('/api/token/', { username, password });
  //     const { access, refresh } = data;

  //     localStorage.setItem('access_token', access);
  //     if (remember) localStorage.setItem('refresh_token', refresh);
  //     axios.defaults.headers.common['Authorization'] = `Bearer ${access}`;

  //     // notificar a la app (misma pestaña)
  //     window.dispatchEvent(new Event('auth-changed'));
  //     // compat opcional
  //     window.dispatchEvent(new Event('storage'));

  //     const saved = localStorage.getItem('redirectAfterLogin');
  //     let target = intended || saved || defaultRedirect;
  //     if (target === '/' || target === '/login') target = defaultRedirect;
  //     localStorage.removeItem('redirectAfterLogin');
  //     navigate(target, { replace: true });
  //   } catch {
  //     setError('Credenciales inválidas. Intenta nuevamente.');
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  const handleLogin = async (e) => {
  e.preventDefault();
  setError('');
  setLoading(true);

  try {
    await doLogin(username, password);

    // Redirección como ya tenías
    const saved = localStorage.getItem('redirectAfterLogin');
    let target = intended || saved || defaultRedirect;
    if (target === '/' || target === '/login') target = defaultRedirect;
    localStorage.removeItem('redirectAfterLogin');
    navigate(target, { replace: true });
  } catch (err) {
    setError('Credenciales inválidas. Intenta nuevamente.');
  } finally {
    setLoading(false);
  }
};

  return (
    // Full-bleed: sin container, sin gutters; ocupa todo el alto útil bajo el header
    <div className="container-fluid p-0">
      <div className="row g-0 hero-slice align-items-stretch">
        {/* Izquierda: fondo gris claro + formulario centrado */}
        <div className="col-12 col-lg-6 bg-app d-flex align-items-center justify-content-center p-4 p-md-5">
          <div className="card shadow-sm border-0 rounded-4 w-100" style={{ maxWidth: 520 }}>
            <div className="card-body p-4 p-md-5">
              <div className="text-center mb-3">
                <img src="/images/LogoBIA.png" alt="Grupo BIA" height="40" className="mb-2" />
                <h3 className="text-bia fw-bold m-0">Iniciar sesión</h3>
                <small className="text-secondary">Accedé al sistema de Gestión de Grupo BIA</small>
              </div>

              {error && (
                <div className="alert alert-danger text-center py-2 mb-3" role="alert">
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} noValidate>
                <div className="form-floating mb-3">
                  <input
                    id="username"
                    type="text"
                    className="form-control"
                    placeholder="Usuario"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                  />
                  <label htmlFor="username">Usuario</label>
                </div>

                <div className="mb-3">
                  <div className="input-group">
                    <div className="form-floating flex-grow-1">
                      <input
                        id="password"
                        type={showPw ? 'text' : 'password'}
                        className="form-control"
                        placeholder="Contraseña"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                      />
                      <label htmlFor="password">Contraseña</label>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline-bia"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showPw ? 'Ocultar' : 'Ver'}
                    </button>
                  </div>
                </div>

                <div className="d-flex justify-content-between align-items-center mb-3">
                  <div className="form-check">
                    <input
                      id="remember"
                      className="form-check-input"
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="remember">
                      Recordarme
                    </label>
                  </div>
                  <Link to="/recuperar" className="link-bia">¿Olvidaste tu contraseña?</Link>
                </div>

                <button type="submit" className="btn btn-bia w-100" disabled={loading}>
                  {loading && <span className="spinner-border spinner-border-sm me-2" role="status" />}
                  {loading ? 'Ingresando…' : 'Ingresar'}
                </button>

                <div className="d-flex align-items-center my-3">
                  <div className="flex-grow-1 border-top" />
                  <span className="px-2 text-secondary small">o</span>
                  <div className="flex-grow-1 border-top" />
                </div>

                <div className="d-grid gap-2">
                  <Link to="/" className="btn btn-outline-bia">Volver al Menú</Link>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Derecha: imagen FULL, pegada a los bordes (solo ≥ lg) */}
        <div className="col-12 col-lg-6 d-none d-lg-block p-0">
          <div className="login-hero w-100 h-100" role="img" aria-label="Puerto Madero" />
        </div>
      </div>
    </div>
  );
}
