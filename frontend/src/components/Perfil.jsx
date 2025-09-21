// frontend/src/components/Perfil.jsx
import React, { useEffect, useState, useRef } from "react";

import { getUserRole } from "../services/auth";
import {
  adminGetMe,
  adminListRoles,
  adminSearchUsers,
  adminGetUserRoles,
  adminSetUserRoles,
  adminCreateUser,
} from "../services/api";

// Etiquetas amigables para mostrar en UI, manteniendo valores reales que
// entiende el backend (value). Editá las etiquetas a gusto.
const ROLE_LABELS = {
  admin: "Admin",
  editor: "Supervisor",
  approver: "Operador",
  // Si el backend devuelve estos directamente, también los mostramos prolijos:
  supervisor: "Supervisor",
  operador: "Operador",
};

// Convierte una lista de strings de roles del server en [{value,label}]
const toRolesUI = (raw) => {
  const uniq = Array.from(new Set(Array.isArray(raw) ? raw : []));
  return uniq
    .filter((v) => ROLE_LABELS[v]) // solo los conocidos
    .map((v) => ({ value: v, label: ROLE_LABELS[v] }));
};

export default function Perfil() {
  // Datos de perfil (demo)
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [cargo, setCargo] = useState("");
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifPush, setNotifPush] = useState(false);

  // Avatar (demo)
  const [avatarUrl, setAvatarUrl] = useState(null);
  const fileRef = useRef(null);

  // Roles/seguridad
  const roleLocal = getUserRole?.() || "";
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [canManageRoles, setCanManageRoles] = useState(false);

  // Gestión de roles (UI admin)
  const [rolesDisponibles, setRolesDisponibles] = useState([]); // strings del backend
  const [busqueda, setBusqueda] = useState("");
  const [usuarios, setUsuarios] = useState([]); // resultados búsqueda
  const [selUser, setSelUser] = useState(null); // {id, username, email, ...}
  const [rolesUsuario, setRolesUsuario] = useState(new Set()); // Set(values) del usuario seleccionado
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState("");

  const isAdmin = String(roleLocal).toLowerCase() === "admin";
  const isSupervisor = ["supervisor", "sup", "super"].includes(String(roleLocal).toLowerCase());
  const canCreateUsers = isAdmin || isSupervisor; // admin/supervisor crean usuarios

  // --- Carga inicial ---
  useEffect(() => {
    const load = async () => {
      try {
        setCargando(true);
        const me = await adminGetMe().catch(() => null);
        if (me?.data) {
          const { is_superuser } = me.data;
          setIsSuperUser(!!is_superuser);
        }
        const rolesRes = await adminListRoles().catch(() => null);
        const rolesServer = Array.isArray(rolesRes?.data?.roles) ? rolesRes.data.roles : [];
        setRolesDisponibles(rolesServer);
      } finally {
        setCargando(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    setCanManageRoles(isSuperUser || isAdmin);
  }, [isSuperUser, isAdmin]);

  // --- Perfil demo ---
  const handleGuardarPerfil = async (e) => {
    e.preventDefault();
    alert("Perfil guardado (demo).");
  };

  const handleCambiarPassword = async (e) => {
    e.preventDefault();
    alert("Solicitud de cambio de contraseña (demo).");
  };

  const handleAvatarSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAvatarUrl(url);
  };

  const handleQuitarAvatar = () => {
    setAvatarUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  // --- Búsqueda/selección de usuarios (admin/superuser) ---
  const buscarUsuarios = async (queryOverride) => {
    const term = (queryOverride ?? busqueda).trim();
    if (!term) {
      setUsuarios([]);
      return;
    }
    try {
      setCargando(true);
      const { data } = await adminSearchUsers(term);
      setUsuarios(Array.isArray(data?.results) ? data.results : []);
      setMsg("");
    } catch (err) {
      console.error(err);
      setMsg("No se pudieron buscar usuarios.");
    } finally {
      setCargando(false);
    }
  };

  const seleccionarUsuario = async (u) => {
    setSelUser(u);
    setRolesUsuario(new Set());
    setMsg("");
    try {
      setCargando(true);
      const { data } = await adminGetUserRoles(u.id);
      setRolesUsuario(new Set(Array.isArray(data?.roles) ? data.roles : []));
    } catch (err) {
      console.error(err);
      setMsg("No se pudieron cargar los roles del usuario.");
    } finally {
      setCargando(false);
    }
  };

  const toggleRol = (roleValue) => {
    const next = new Set(rolesUsuario);
    if (next.has(roleValue)) next.delete(roleValue);
    else next.add(roleValue);
    setRolesUsuario(next);
  };

  const guardarRoles = async () => {
    if (!selUser) return;
    try {
      setGuardando(true);
      const body = { roles: Array.from(rolesUsuario) }; // valores reales
      const { data } = await adminSetUserRoles(selUser.id, body);
      if (data?.success) setMsg("Roles actualizados correctamente.");
      else setMsg("No se pudieron actualizar los roles.");
    } catch (err) {
      console.error(err);
      const apiErr = err?.response?.data?.errors;
      setMsg(Array.isArray(apiErr) ? apiErr.join(" — ") : "Error al actualizar roles.");
    } finally {
      setGuardando(false);
    }
  };

  // ============================
  // Crear Usuario (admin/supervisor)
  // ============================
  const [nuevo, setNuevo] = useState({
    email: "",
    nombre: "",
    role: "", // se setea por default al primero disponible abajo
    password: "",
    password2: "",
  });
  const [creating, setCreating] = useState(false);
  const [msgCreate, setMsgCreate] = useState(null); // {type:'success'|'error', text:string}

  // Catálogo UI: si el server no devolvió nada, usamos la tríada típica del backend actual
  const rolesUI =
    toRolesUI(rolesDisponibles).length > 0
      ? toRolesUI(rolesDisponibles)
      : toRolesUI(["admin", "editor", "approver"]);

  // Setear default en cuanto haya catálogo
  useEffect(() => {
    if (!nuevo.role && rolesUI.length) {
      setNuevo((p) => ({ ...p, role: rolesUI[0].value }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolesUI.length]);

  const validarNuevo = () => {
    if (!nuevo.email.trim()) return "Ingresá un email";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuevo.email.trim())) return "Email inválido";
    if (!nuevo.password) return "Ingresá una contraseña";
    if (nuevo.password.length < 6) return "La contraseña debe tener al menos 6 caracteres";
    if (nuevo.password !== nuevo.password2) return "Las contraseñas no coinciden";
    if (!nuevo.role) return "Seleccioná un rol";
    return null;
  };

  const onNuevoChange = (k, v) => setNuevo((prev) => ({ ...prev, [k]: v }));

  const onCrearUsuario = async (e) => {
    e.preventDefault();
    setMsgCreate(null);
    const err = validarNuevo();
    if (err) return setMsgCreate({ type: "error", text: err });

    setCreating(true);
    try {
      // 1) Crear usuario (mandamos el valor real que entiende el backend)
      const res = await adminCreateUser({
        email: nuevo.email.trim(),
        password: nuevo.password,
        role: nuevo.role, // value real (ej: "editor")
        nombre: nuevo.nombre?.trim() || undefined,
      });

      // 2) Tomar id/username/email devueltos para fallback role-set y refresco
      const data = res?.data || {};
      const newUserId = data?.id ?? data?.user?.id ?? data?.pk ?? data?.uid ?? null;
      const newUserUsername =
        data?.username ?? data?.user?.username ?? data?.email ?? nuevo.email.trim();
      const newUserEmail = data?.email ?? data?.user?.email ?? nuevo.email.trim();

      // 3) Fallback por si el create no asigna roles
      if (newUserId) {
        try {
          await adminSetUserRoles(newUserId, { roles: [nuevo.role] });
        } catch (roleErr) {
          console.warn("Fallback set roles tras crear usuario:", roleErr?.response?.data || roleErr?.message);
        }
      }

      setMsgCreate({ type: "success", text: "Usuario creado correctamente." });
      setNuevo({ email: "", nombre: "", role: rolesUI[0]?.value || "", password: "", password2: "" });

      // 4) Refrescar búsqueda con ese email
      if (newUserEmail) {
        setBusqueda(newUserEmail);
        await buscarUsuarios(newUserEmail);
        const justFetched = (await adminSearchUsers(newUserEmail))?.data?.results || [];
        const found = justFetched.find(
          (u) =>
            String(u.email || "").toLowerCase() === String(newUserEmail).toLowerCase() ||
            String(u.username || "").toLowerCase() === String(newUserUsername).toLowerCase()
        );
        if (found) await seleccionarUsuario(found);
      }
    } catch (e2) {
      console.error(e2);
      const serverMsg =
        e2?.response?.data?.detail ||
        e2?.response?.data?.message ||
        (typeof e2?.response?.data === "string" ? e2.response.data : null);
      setMsgCreate({ type: "error", text: serverMsg || "No se pudo crear el usuario." });
    } finally {
      setCreating(false);
    }
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

          {/* Avatar + datos rápidos */}
          <div className="card border-0 shadow-sm rounded-4 mb-4">
            <div className="card-body p-4">
              <div className="d-flex flex-column flex-md-row align-items-start align-items-md-center gap-3">
                <div className="position-relative">
                  <div
                    className="rounded-circle overflow-hidden d-flex align-items-center justify-content-center bg-light border"
                    style={{ width: 96, height: 96 }}
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
                  <small className="text-secondary d-block mt-2">PNG o JPG. Tamaño recomendado 400×400.</small>
                </div>
              </div>
            </div>
          </div>

          {/* Datos personales */}
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

          {/* Preferencias */}
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
                <div className="col-md-6">{/* espacio para idioma/tema */}</div>
              </div>
            </div>
          </div>

          {/* Seguridad */}
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
                  <small className="text-secondary">Añadí una capa extra de seguridad con una app de autenticación.</small>
                </div>
                <button className="btn btn-outline-secondary" disabled>
                  Configurar (próximamente)
                </button>
              </div>
            </div>
          </div>

          {/* Crear usuario (Admin / Supervisor) */}
          {canCreateUsers && (
            <div className="card border-0 shadow-sm rounded-4 mb-4">
              <div className="card-body p-4">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <h5 className="fw-semibold mb-0">Crear usuario</h5>
                  <span className="badge text-bg-light border">Admin / Supervisor</span>
                </div>

                {msgCreate && (
                  <div className={`alert ${msgCreate.type === 'success' ? 'alert-success' : 'alert-danger'} rounded-4`}>
                    {msgCreate.text}
                  </div>
                )}

                <form className="row g-3" onSubmit={onCrearUsuario}>
                  <div className="col-md-6">
                    <div className="form-floating">
                      <input
                        type="email"
                        className="form-control"
                        id="alta-email"
                        placeholder=" "
                        value={nuevo.email}
                        onChange={(e) => onNuevoChange("email", e.target.value)}
                        autoComplete="username"
                        required
                      />
                      <label htmlFor="alta-email">Email</label>
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="form-floating">
                      <input
                        type="text"
                        className="form-control"
                        id="alta-nombre"
                        placeholder=" "
                        value={nuevo.nombre}
                        onChange={(e) => onNuevoChange("nombre", e.target.value)}
                      />
                      <label htmlFor="alta-nombre">Nombre (opcional)</label>
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="form-floating">
                      <select
                        className="form-select"
                        id="alta-role"
                        value={nuevo.role}
                        onChange={(e) => onNuevoChange("role", e.target.value)}
                        required
                      >
                        {rolesUI.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                      <label htmlFor="alta-role">Rol</label>
                    </div>
                  </div>

                  <div className="col-md-6" />

                  <div className="col-md-6">
                    <div className="form-floating">
                      <input
                        type="password"
                        className="form-control"
                        id="alta-pass"
                        placeholder=" "
                        value={nuevo.password}
                        onChange={(e) => onNuevoChange("password", e.target.value)}
                        autoComplete="new-password"
                        required
                      />
                      <label htmlFor="alta-pass">Contraseña</label>
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="form-floating">
                      <input
                        type="password"
                        className="form-control"
                        id="alta-pass2"
                        placeholder=" "
                        value={nuevo.password2}
                        onChange={(e) => onNuevoChange("password2", e.target.value)}
                        autoComplete="new-password"
                        required
                      />
                      <label htmlFor="alta-pass2">Repetir contraseña</label>
                    </div>
                  </div>

                  <div className="col-12 d-flex justify-content-end gap-2">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      disabled={creating}
                      onClick={() => { setNuevo({ email: "", nombre: "", role: rolesUI[0]?.value || "", password: "", password2: "" }); setMsgCreate(null); }}
                    >
                      Limpiar
                    </button>
                    <button type="submit" className="btn btn-bia" disabled={creating}>
                      {creating ? "Creando…" : "Crear usuario"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Gestión de Roles (solo superuser o admin) */}
          {canManageRoles && (
            <div className="card border-0 shadow-sm rounded-4 mb-5">
              <div className="card-body p-4">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <h5 className="fw-semibold mb-0">Gestión de Roles</h5>
                  <span className="badge text-bg-light border">Solo superusuario / admin</span>
                </div>

                <div className="row g-2 align-items-end">
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="pf-buscar">Buscar usuario</label>
                    <input
                      id="pf-buscar"
                      className="form-control"
                      placeholder="usuario, email, nombre o apellido"
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      onKeyDown={(e) => (e.key === "Enter" ? buscarUsuarios() : null)}
                    />
                  </div>
                  <div className="col-md-3">
                    <button className="btn btn-outline-secondary w-100" onClick={() => buscarUsuarios()} disabled={cargando}>
                      {cargando ? "Buscando..." : "Buscar"}
                    </button>
                  </div>
                </div>

                {/* resultados */}
                {usuarios.length > 0 && (
                  <div className="mt-3">
                    <div className="small text-secondary mb-1">Resultados:</div>
                    <div className="list-group">
                      {usuarios.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          className={"list-group-item list-group-item-action" + (selUser?.id === u.id ? " active" : "")}
                          onClick={() => seleccionarUsuario(u)}
                        >
                          <div className="d-flex justify-content-between">
                            <div>
                              <strong>{u.username}</strong>
                              {u.email ? <span className="ms-2 text-muted">{u.email}</span> : null}
                            </div>
                            <small className="text-muted">
                              {u.first_name || u.last_name ? `${u.first_name || ""} ${u.last_name || ""}`.trim() : ""}
                            </small>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* edición roles del usuario seleccionado */}
                {selUser && (
                  <div className="mt-4">
                    <div className="mb-2">
                      <strong>Asignar roles a:</strong>{" "}
                      <code>{selUser.username}</code>{" "}
                      {selUser.email ? <span className="text-muted ms-2">{selUser.email}</span> : null}
                    </div>
                    <div className="d-flex flex-wrap gap-3">
                      {rolesUI.map((r) => (
                        <div className="form-check" key={r.value}>
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id={`rol-${r.value}`}
                            checked={rolesUsuario.has(r.value)}
                            onChange={() => toggleRol(r.value)}
                          />
                          <label className="form-check-label" htmlFor={`rol-${r.value}`}>
                            {r.label}
                          </label>
                        </div>
                      ))}
                    </div>
                    <div className="d-flex gap-2 mt-3">
                      <button className="btn btn-bia" onClick={guardarRoles} disabled={guardando}>
                        {guardando ? "Guardando..." : "Guardar roles"}
                      </button>
                      <button className="btn btn-outline-secondary" onClick={() => setSelUser(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {msg && <div className="alert alert-info mt-3 py-2 mb-0">{msg}</div>}
              </div>
            </div>
          )}

          {/* Zona peligrosa (solo admins locales, opcional) */}
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
