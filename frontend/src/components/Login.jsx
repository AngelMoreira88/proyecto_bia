import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import Header from './Header';

export default function Login() {
  const [username, setUsername]   = useState('');
  const [password, setPassword]   = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [remember, setRemember]   = useState(true);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  const navigate  = useNavigate();
  const location  = useLocation();

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

      // Si no querés persistir refresh al desmarcar "Recordarme", podés omitir guardarlo
      localStorage.setItem('access_token', access);
      if (remember) localStorage.setItem('refresh_token', refresh);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access}`;

      // Forzar actualización del header
      window.dispatchEvent(new Event('storage'));

      // Decidir navegación
      const saved = localStorage.getItem('redirectAfterLogin');
      let target = intended || saved || defaultRedirect;
      if (target === '/' || target === '/login') target = defaultRedirect;
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
      <div
        className="container-fluid p-0"
        style={{ marginTop: '88px', height: 'calc(100vh - 88px)', overflow: 'hidden' }}
      >
        <div className="row h-100 g-0">
          {/* Columna izquierda: formulario */}
          <div className="col-lg-6 d-flex align-items-center justify-content-center p-4">
            <div
              className="card shadow-sm border-0 w-100"
              style={{ maxWidth: 440 }}
            >
              <div className="card-body p-4">
                <div className="text-center mb-3">
                  <div className="mb-2">
                    <img src="/images/LogoBIA.png" alt="Grupo BIA" height="40" />
                  </div>
                  <h3 className="text-bia fw-bold m-0">Iniciar sesión</h3>
                  <small className="text-secondary">
                    Accedé al sistema de Gestión de Grupo BIA
                  </small>
                </div>

                {error && (
                  <div className="alert alert-danger text-center py-2 mb-3" role="alert">
                    {error}
                  </div>
                )}

                <form onSubmit={handleLogin} className="needs-validation" noValidate>
                  {/* Usuario */}
                  <div className="form-floating mb-3">
                    <input
                      id="username"
                      type="text"
                      className="form-control"
                      placeholder="Usuario"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                    <label htmlFor="username">Usuario</label>
                  </div>

                  {/* Contraseña con toggle de visibilidad */}
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
                          required
                        />
                        <label htmlFor="password">Contraseña</label>
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline-bia"
                        onClick={() => setShowPw((v) => !v)}
                        aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        tabIndex={0}
                      >
                        {showPw ? 'Ocultar' : 'Ver'}
                      </button>
                    </div>
                  </div>

                  {/* Opciones extras */}
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
                    <Link to="/recuperar" className="link-bia">
                      ¿Olvidaste tu contraseña?
                    </Link>
                  </div>

                  {/* Botón principal */}
                  <button
                    type="submit"
                    className="btn btn-bia w-100"
                    disabled={loading}
                  >
                    {loading && (
                      <span
                        className="spinner-border spinner-border-sm me-2"
                        role="status"
                        aria-hidden="true"
                      />
                    )}
                    {loading ? 'Ingresando…' : 'Ingresar'}
                  </button>

                  {/* Línea divisoria sutil */}
                  <div className="d-flex align-items-center my-3">
                    <div className="flex-grow-1 border-top" />
                    <span className="px-2 text-secondary small">o</span>
                    <div className="flex-grow-1 border-top" />
                  </div>

                  {/* Acceso público / volver */}
                  <div className="d-grid gap-2">
                    <Link to="/" className="btn btn-outline-bia">
                      Volver al Menú
                    </Link>
                  </div>
                </form>
              </div>
            </div>
          </div>

          {/* Columna derecha: imagen de apoyo */}
          <div className="col-lg-6 d-none d-lg-block">
            <div
              className="w-100 h-100"
              style={{
                backgroundImage: 'url(/images/PuertoMadero.png)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
