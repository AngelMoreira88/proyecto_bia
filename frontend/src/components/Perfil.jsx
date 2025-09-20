// frontend/src/components/Perfil.jsx
import React, { useEffect, useState, useRef } from "react";
import BackToHomeButton from "./BackToHomeButton";

import { getUserRole } from "../services/auth";
import {
  adminGetMe,
  adminListRoles,
  adminSearchUsers,
  adminGetUserRoles,
  adminSetUserRoles,

  // NUEVO: asegurate que existan en services/api.js
  adminCreateUser,
  adminUpdateUser,
  // adminDeactivateUser, // opcional
} from "../services/api";

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
  const isAdmin = roleLocal === "admin"; // <— Solo Admin crea/edita usuarios

  // Gestión de roles (UI admin/superuser)
  const [rolesDisponibles, setRolesDisponibles] = useState([]); // ["admin","editor","approver"]
  const [busqueda, setBusqueda] = useState("");
  const [usuarios, setUsuarios] = useState([]); // resultados búsqueda
  const [selUser, setSelUser] = useState(null); // {id, username, email, ...}
  const [rolesUsuario, setRolesUsuario] = useState(new Set()); // Set de roles del usuario seleccionado
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState("");

  // Gestión de usuarios (solo Admin)
  const [modoEdicion, setModoEdicion] = useState("crear"); // "crear" | "editar"
  const [formUsuario, setFormUsuario] = useState({
    username: "",
    email: "",
    first_name: "",
    last_name: "",
    password: "",
    is_active: true,
  });
  const [errorsUsuario, setErrorsUsuario] = useState({});

  // --- Carga inicial: info del usuario logueado y catálogos de roles ---
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
        setRolesDisponibles(Array.isArray(rolesRes?.data?.roles) ? rolesRes.data.roles : []);
      } finally {
        setCargando(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    // Puede gestionar roles si es superuser o tiene rol 'admin'
    setCanManageRoles(isSuperUser || roleLocal === "admin");
  }, [isSuperUser, roleLocal]);

  // --- Demo acciones de perfil ---
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
    // TODO: subir avatar con FormData al backend
  };

  const handleQuitarAvatar = () => {
    setAvatarUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  // --- Gestión de roles (acciones admin/superuser) ---
  const buscarUsuarios = async () => {
    if (!busqueda.trim()) {
      setUsuarios([]);
      return;
    }
    try {
      setCargando(true);
      const { data } = await adminSearchUsers(busqueda.trim());
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
      // completar formulario de edición con datos del usuario seleccionado
      if (isAdmin) {
        setModoEdicion("editar");
        setFormUsuario({
          username: u.username || "",
          email: u.email || "",
          first_name: u.first_name || "",
          last_name: u.last_name || "",
          password: "", // en edición no mostramos password actual
          is_active: u.is_active ?? true,
        });
        setErrorsUsuario({});
      }
      // cargar roles
      const { data } = await adminGetUserRoles(u.id);
      setRolesUsuario(new Set(Array.isArray(data?.roles) ? data.roles : []));
    } catch (err) {
      console.error(err);
      setMsg("No se pudieron cargar los roles del usuario.");
    } finally {
      setCargando(false);
    }
  };

  const toggleRol = (rol) => {
    const next = new Set(rolesUsuario);
    if (next.has(rol)) next.delete(rol);
    else next.add(rol);
    setRolesUsuario(next);
  };

  const guardarRoles = async () => {
    if (!selUser) return;
    try {
      setGuardando(true);
      const body = { roles: Array.from(rolesUsuario) };
      const { data } = await adminSetUserRoles(selUser.id, body);
      if (data?.success) {
        setMsg("Roles actualizados correctamente.");
      } else {
        setMsg("No se pudieron actualizar los roles.");
      }
    } catch (err) {
      console.error(err);
      const apiErr = err?.response?.data?.errors;
      setMsg(Array.isArray(apiErr) ? apiErr.join(" — ") : "Error al actualizar roles.");
    } finally {
      setGuardando(false);
    }
  };

  // --- Gestión de usuarios (solo Admin) ---
  const limpiarFormularioUsuario = () => {
    setFormUsuario({
      username: "",
      email: "",
      first_name: "",
      last_name: "",
      password: "",
      is_active: true,
    });
    setErrorsUsuario({});
  };

  const validarUsuario = () => {
    const e = {};
    if (!formUsuario.username?.trim()) e.username = "Usuario requerido";
    if (!formUsuario.email?.trim()) e.email = "Email requerido";
    if (modoEdicion === "crear" && !formUsuario.password?.trim()) {
      e.password = "Contraseña requerida";
    }
    setErrorsUsuario(e);
    return Object.keys(e).length === 0;
    };

  const onChangeUsuario = (field, value) => {
    setFormUsuario((prev) => ({ ...prev, [field]: value }));
  };

  const guardarUsuario = async () => {
    if (!isAdmin) return;
    if (!validarUsuario()) return;

    try {
      setGuardando(true);
      setMsg("");
      if (modoEdicion === "crear") {
        const payload = {
          username: formUsuario.username.trim(),
          email: formUsuario.email.trim(),
          first_name: formUsuario.first_name.trim(),
          last_name: formUsuario.last_name.trim(),
          password: formUsuario.password, // backend debe hashear
          is_active: !!formUsuario.is_active,
        };
        const { data } = await adminCreateUser(payload);
        if (data?.id) {
          setMsg("Usuario creado correctamente.");
          limpiarFormularioUsuario();
          // refrescar resultados de búsqueda si coincide
          if (busqueda && data.username?.includes(busqueda)) {
            await buscarUsuarios();
          }
        } else {
          setMsg("No se pudo crear el usuario.");
        }
      } else if (modoEdicion === "editar" && selUser?.id) {
        const payload = {
          username: formUsuario.username.trim(),
          email: formUsuario.email.trim(),
          first_name: formUsuario.first_name.trim(),
          last_name: formUsuario.last_name.trim(),
          // password se omite si viene vacío
          ...(formUsuario.password ? { password: formUsuario.password } : {}),
          is_active: !!formUsuario.is_active,
        };
        const { data } = await adminUpdateUser(selUser.id, payload);
        if (data?.id || data?.success) {
          setMsg("Usuario actualizado correctamente.");
          // actualizar en la lista local
          setUsuarios((prev) =>
            prev.map((u) => (u.id === selUser.id ? { ...u, ...payload } : u))
          );
        } else {
          setMsg("No se pudo actualizar el usuario.");
        }
      }
    } catch (err) {
      console.error(err);
      const apiErr =
        err?.response?.data?.errors ||
        err?.response?.data?.detail ||
        err?.response?.data;
      setMsg(
        Array.isArray(apiErr)
          ? apiErr.join(" — ")
          : typeof apiErr === "string"
          ? apiErr
          : "Error al guardar usuario."
      );
    } finally {
      setGuardando(false);
    }
  };

  const iniciarCreacion = () => {
    if (!isAdmin) return;
    setModoEdicion("crear");
    limpiarFormularioUsuario();
    setSelUser(null); // no editar roles de un usuario no seleccionado
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

          {/* Gestión de Usuarios (solo Admin) */}
          {isAdmin && (
            <div className="card border-0 shadow-sm rounded-4 mb-5">
              <div className="card-body p-4">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <h5 className="fw-semibold mb-0">Gestión de Usuarios</h5>
                  <span className="badge text-bg-light border">Solo Admin</span>
                </div>

                <div className="d-flex flex-wrap gap-2 mb-3">
                  <button className="btn btn-bia" onClick={iniciarCreacion}>
                    + Nuevo usuario
                  </button>
                  {modoEdicion === "editar" && selUser && (
                    <div className="align-self-center small text-secondary">
                      Editando: <code>{selUser.username}</code>
                    </div>
                  )}
                </div>

                <div className="row g-3">
                  <div className="col-md-4">
                    <label className="form-label" htmlFor="usr-username">Usuario</label>
                    <input
                      id="usr-username"
                      className={`form-control ${errorsUsuario.username ? "is-invalid" : ""}`}
                      value={formUsuario.username}
                      onChange={(e) => onChangeUsuario("username", e.target.value)}
                    />
                    {errorsUsuario.username && (
                      <div className="invalid-feedback">{errorsUsuario.username}</div>
                    )}
                  </div>
                  <div className="col-md-4">
                    <label className="form-label" htmlFor="usr-email">Email</label>
                    <input
                      id="usr-email"
                      type="email"
                      className={`form-control ${errorsUsuario.email ? "is-invalid" : ""}`}
                      value={formUsuario.email}
                      onChange={(e) => onChangeUsuario("email", e.target.value)}
                    />
                    {errorsUsuario.email && (
                      <div className="invalid-feedback">{errorsUsuario.email}</div>
                    )}
                  </div>
                  <div className="col-md-4">
                    <label className="form-label" htmlFor="usr-password">
                      {modoEdicion === "crear" ? "Contraseña" : "Nueva contraseña (opcional)"}
                    </label>
                    <input
                      id="usr-password"
                      type="password"
                      className={`form-control ${errorsUsuario.password ? "is-invalid" : ""}`}
                      value={formUsuario.password}
                      onChange={(e) => onChangeUsuario("password", e.target.value)}
                      autoComplete="new-password"
                    />
                    {errorsUsuario.password && (
                      <div className="invalid-feedback">{errorsUsuario.password}</div>
                    )}
                  </div>
                  <div className="col-md-4">
                    <label className="form-label" htmlFor="usr-first">Nombre</label>
                    <input
                      id="usr-first"
                      className="form-control"
                      value={formUsuario.first_name}
                      onChange={(e) => onChangeUsuario("first_name", e.target.value)}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label" htmlFor="usr-last">Apellido</label>
                    <input
                      id="usr-last"
                      className="form-control"
                      value={formUsuario.last_name}
                      onChange={(e) => onChangeUsuario("last_name", e.target.value)}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label d-block">Estado</label>
                    <div className="form-check form-switch">
                      <input
                        id="usr-active"
                        className="form-check-input"
                        type="checkbox"
                        checked={!!formUsuario.is_active}
                        onChange={(e) => onChangeUsuario("is_active", e.target.checked)}
                      />
                      <label className="form-check-label" htmlFor="usr-active">
                        Activo
                      </label>
                    </div>
                  </div>
                  <div className="col-12 d-flex gap-2 justify-content-end">
                    <button
                      className="btn btn-bia"
                      onClick={guardarUsuario}
                      disabled={guardando}
                    >
                      {guardando
                        ? "Guardando..."
                        : modoEdicion === "crear"
                        ? "Crear usuario"
                        : "Guardar cambios"}
                    </button>
                    <button
                      className="btn btn-outline-secondary"
                      onClick={limpiarFormularioUsuario}
                      type="button"
                    >
                      Limpiar
                    </button>
                  </div>
                </div>
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
                    <button className="btn btn-outline-secondary w-100" onClick={buscarUsuarios} disabled={cargando}>
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
                      {rolesDisponibles.map((r) => (
                        <div className="form-check" key={r}>
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id={`rol-${r}`}
                            checked={rolesUsuario.has(r)}
                            onChange={() => toggleRol(r)}
                          />
                          <label className="form-check-label" htmlFor={`rol-${r}`}>
                            {r}
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
