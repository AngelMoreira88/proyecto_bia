// frontend/src/components/Perfil.jsx
import React, { useState, useRef } from "react";
import { getUserRole } from "../services/auth"; // 👈 para controlar visibilidad de “Zona peligrosa”

export default function Perfil() {
  const [nombre, setNombre]       = useState("");
  const [apellido, setApellido]   = useState("");
  const [email, setEmail]         = useState("");
  const [telefono, setTelefono]   = useState("");
  const [empresa, setEmpresa]     = useState("");
  const [cargo, setCargo]         = useState("");
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifPush, setNotifPush]   = useState(false);

  const [avatarUrl, setAvatarUrl] = useState(null);
  const fileRef = useRef(null);

  const isAdmin = getUserRole() === "admin"; // 👈 solo admins verán la “Zona peligrosa”

  const handleGuardarPerfil = async (e) => {
    e.preventDefault();
    // TODO: enviar a backend (api.post(...))
    alert("Perfil guardado (demo).");
  };

  const handleCambiarPassword = async (e) => {
    e.preventDefault();
    // TODO: enviar a backend
    alert("Solicitud de cambio de contraseña (demo).");
  };

  const handleAvatarSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAvatarUrl(url);
    // TODO: subir avatar con FormData al backend
  };

  const handleQuitarAvatar = () => {
    setAvatarUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="page-fill bg-app">
      <div className="container d-flex justify-content-center align-items-start py-3 py-md-4">
        <div className="w-100" style={{ maxWidth: 1080 }}>
          {/* Encabezado */}
          <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between mb-3 px-2 px-md-0">
            <div>
              <h2 className="text-bia fw-bold mb-1">Perfil</h2>
              <small className="text-secondary">
                Gestioná tus datos personales, preferencias y seguridad de la cuenta.
              </small>
            </div>
            <div className="mt-3 mt-md-0">
              <button className="btn btn-outline-bia" onClick={() => window.history.back()}>
                Volver
              </button>
            </div>
          </div>

          {/* Sección: Avatar + datos rápidos */}
          <div className="card border-0 shadow-sm rounded-4 mb-4">
            <div className="card-body p-4">
              <div className="d-flex flex-column flex-md-row align-items-start align-items-md-center gap-3">
                <div className="position-relative">
                  <div
                    className="rounded-circle overflow-hidden d-flex align-items-center justify-content-center bg-light border"
                    style={{ width: 96, height: 96 }}
                  >
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="Avatar"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <span className="text-secondary small">96×96</span>
                    )}
                  </div>
                </div>
                <div className="flex-grow-1">
                  <div className="d-flex flex-wrap gap-2">
                    <button className="btn btn-bia" onClick={() => fileRef.current?.click()}>
                      Subir foto
                    </button>
                    {avatarUrl && (
                      <button className="btn btn-outline-bia" onClick={handleQuitarAvatar}>
                        Quitar
                      </button>
                    )}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={handleAvatarSelect}
                      aria-label="Seleccionar imagen de perfil"
                    />
                  </div>
                  <small className="text-secondary d-block mt-2">
                    PNG o JPG. Tamaño recomendado 400×400.
                  </small>
                </div>
              </div>
            </div>
          </div>

          {/* Sección: Datos personales */}
          <div className="card border-0 shadow-sm rounded-4 mb-4">
            <div className="card-body p-4">
              <h5 className="fw-semibold mb-3">Datos personales</h5>
              <form onSubmit={handleGuardarPerfil} className="row g-3">
                <div className="col-md-6">
                  <label className="form-label" htmlFor="pf-nombre">Nombre</label>
                  <input id="pf-nombre" className="form-control" value={nombre} onChange={(e) => setNombre(e.target.value)} />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="pf-apellido">Apellido</label>
                  <input id="pf-apellido" className="form-control" value={apellido} onChange={(e) => setApellido(e.target.value)} />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="pf-email">Email</label>
                  <input id="pf-email" type="email" className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="pf-telefono">Teléfono</label>
                  <input id="pf-telefono" className="form-control" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="pf-empresa">Empresa</label>
                  <input id="pf-empresa" className="form-control" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="pf-cargo">Cargo</label>
                  <input id="pf-cargo" className="form-control" value={cargo} onChange={(e) => setCargo(e.target.value)} />
                </div>
                <div className="col-12 d-flex justify-content-end">
                  <button className="btn btn-bia" type="submit">Guardar cambios</button>
                </div>
              </form>
            </div>
          </div>

          {/* Sección: Preferencias */}
          <div className="card border-0 shadow-sm rounded-4 mb-4">
            <div className="card-body p-4">
              <h5 className="fw-semibold mb-3">Preferencias</h5>
              <div className="row g-3">
                <div className="col-md-6">
                  <div className="form-check form-switch">
                    <input
                      id="notifEmail"
                      className="form-check-input"
                      type="checkbox"
                      checked={notifEmail}
                      onChange={(e) => setNotifEmail(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="notifEmail">
                      Recibir notificaciones por email
                    </label>
                  </div>
                  <div className="form-check form-switch mt-2">
                    <input
                      id="notifPush"
                      className="form-check-input"
                      type="checkbox"
                      checked={notifPush}
                      onChange={(e) => setNotifPush(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="notifPush">
                      Habilitar notificaciones push
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  {/* Espacio para idioma/tema si luego lo necesitás */}
                </div>
              </div>
            </div>
          </div>

          {/* Sección: Seguridad */}
          <div className="card border-0 shadow-sm rounded-4 mb-4">
            <div className="card-body p-4">
              <h5 className="fw-semibold mb-3">Seguridad</h5>
              <form onSubmit={handleCambiarPassword} className="row g-3">
                <div className="col-md-4">
                  <label className="form-label" htmlFor="pf-pass-actual">Contraseña actual</label>
                  <input id="pf-pass-actual" type="password" className="form-control" autoComplete="current-password" />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="pf-pass-nueva">Nueva contraseña</label>
                  <input id="pf-pass-nueva" type="password" className="form-control" autoComplete="new-password" />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="pf-pass-confirm">Confirmar nueva</label>
                  <input id="pf-pass-confirm" type="password" className="form-control" autoComplete="new-password" />
                </div>
                <div className="col-12 d-flex justify-content-end">
                  <button className="btn btn-outline-bia" type="submit">Actualizar contraseña</button>
                </div>
              </form>

              <hr className="my-4" />
              <div className="d-flex flex-column flex-md-row justify-content-between align-items-start gap-3">
                <div>
                  <div className="fw-semibold">Autenticación de dos factores (2FA)</div>
                  <small className="text-secondary">
                    Añadí una capa extra de seguridad con una app de autenticación.
                  </small>
                </div>
                <button className="btn btn-outline-secondary" disabled>
                  Configurar (próximamente)
                </button>
              </div>
            </div>
          </div>

          {/* Zona peligrosa (solo admins) */}
          {isAdmin && (
            <div className="card border-0 shadow-sm rounded-4 mb-5">
              <div className="card-body p-4">
                <h5 className="fw-semibold text-danger mb-2">Zona peligrosa</h5>
                <small className="text-secondary d-block mb-3">
                  Eliminá tu cuenta de forma permanente. Esta acción no se puede deshacer.
                </small>
                <button className="btn btn-outline-danger" disabled>
                  Eliminar cuenta (próximamente)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
