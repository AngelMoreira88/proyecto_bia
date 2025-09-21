// frontend/src/components/Perfil.jsx
import React, { useEffect, useState, useRef, useMemo } from "react";

import {
  adminGetMe,
  adminListRoles,
  adminGetUserRoles,
  adminSetUserRoles,
  adminCreateUser,
  adminUpdateUser,
} from "../services/api";

import UserList from "./Admin/UserList";

/* =========================
   ROLES SOPORTADOS (únicos)
   ========================= */
const CANONICAL_ROLES = ["Admin", "Supervisor", "Operador"];

const normalizeRole = (r) => {
  if (!r) return null;
  const s = String(r).trim().toLowerCase();
  if (s === "admin" || s === "administrador") return "Admin";
  if (s === "supervisor") return "Supervisor";
  if (s === "operador" || s === "approver" || s === "editor") return "Operador";
  return null;
};

const toRolesUI = (raw) => {
  const set = new Set();
  (Array.isArray(raw) ? raw : []).forEach((r) => {
    const n = normalizeRole(r);
    if (n) set.add(n);
  });
  const arr = set.size > 0 ? Array.from(set) : CANONICAL_ROLES.slice();
  return arr.map((v) => ({ value: v, label: v }));
};

export default function Perfil() {
  // Identidad propia
  const [meId, setMeId] = useState(null);

  // Datos personales (target: yo u otro si admin)
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");

  // Seguridad
  const [passActual, setPassActual] = useState("");
  const [passNueva, setPassNueva] = useState("");
  const [passConfirm, setPassConfirm] = useState("");

  // Preferencias
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifPush, setNotifPush] = useState(false);

  // Avatar (demo)
  const [avatarUrl, setAvatarUrl] = useState(null);
  const fileRef = useRef(null);

  // Permisos
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [meRoles, setMeRoles] = useState([]); // normalizados
  const [allowRoleMgmt, setAllowRoleMgmt] = useState(false);
  const [allowUserMgmt, setAllowUserMgmt] = useState(false);

  // Catálogo de roles
  const [rolesDisponibles, setRolesDisponibles] = useState(CANONICAL_ROLES);
  const rolesUI = useMemo(() => toRolesUI(rolesDisponibles), [rolesDisponibles]);

  // Selección desde la tabla
  const [selUser, setSelUser] = useState(null);

  // Gestión de Roles (panel)
  const [rolesUsuario, setRolesUsuario] = useState(new Set());

  // Crear/Editar usuario (form)
  const [modoEdicion, setModoEdicion] = useState("crear"); // "crear" | "editar"
  const [formUsuario, setFormUsuario] = useState({
    email: "",
    first_name: "",
    last_name: "",
    username: "",
    password: "",
    password2: "",
    is_active: true,
  });
  // Roles del form (multi)
  const [rolesForm, setRolesForm] = useState(new Set(["Operador"]));
  const [errorsUsuario, setErrorsUsuario] = useState({});

  // UI
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState("");

  // Refresco del listado
  const [listRefreshKey, setListRefreshKey] = useState(0);

  const isAdmin = isSuperUser || meRoles.includes("Admin");
  const isEditingSelf = !selUser || selUser?.id === meId;
  const canEditOwnProfile = !!meId;
  const canEditOthers = allowUserMgmt;
  const canEditProfile = isEditingSelf ? canEditOwnProfile : canEditOthers;

  /* ==============
     CARGA INICIAL
     ============== */
  useEffect(() => {
    const load = async () => {
      try {
        setCargando(true);
        const meRes = await adminGetMe().catch(() => null);
        if (meRes?.data) {
          const {
            id,
            is_superuser,
            roles,
            first_name,
            last_name,
            email: meEmail,
            phone,
            preferences,
          } = meRes.data;

          setMeId(id ?? null);
          setIsSuperUser(!!is_superuser);

          const rArr = Array.isArray(roles) ? roles : [];
          const normalized = Array.from(new Set(rArr.map(normalizeRole).filter(Boolean)));
          setMeRoles(normalized);

          const canAdmin = !!is_superuser || normalized.includes("Admin");
          setAllowRoleMgmt(canAdmin);
          setAllowUserMgmt(canAdmin);

          setNombre(first_name ?? "");
          setApellido(last_name ?? "");
          setEmail(meEmail ?? "");
          setTelefono(phone ?? "");
          if (preferences && typeof preferences === "object") {
            if (typeof preferences.email_notifications === "boolean") {
              setNotifEmail(preferences.email_notifications);
            }
            if (typeof preferences.push_notifications === "boolean") {
              setNotifPush(preferences.push_notifications);
            }
          }
        }

        const rolesRes = await adminListRoles().catch(() => null);
        const raw = Array.isArray(rolesRes?.data?.roles) ? rolesRes.data.roles : [];
        const normalizedCatalog = Array.from(new Set(toRolesUI(raw).map((r) => r.value)));
        setRolesDisponibles(normalizedCatalog.length ? normalizedCatalog : CANONICAL_ROLES);
      } finally {
        setCargando(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const canAdmin = !!isSuperUser || meRoles.includes("Admin");
    setAllowRoleMgmt(canAdmin);
    setAllowUserMgmt(canAdmin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperUser, meRoles]);

  /* ============================
     Datos personales
     ============================ */
  const handleGuardarPerfil = async (e) => {
    e.preventDefault();
    const targetId = isEditingSelf ? meId : selUser?.id;
    if (!targetId) return setMsg("No se pudo identificar el usuario destino.");
    if (!canEditProfile) return setMsg("No tenés permisos para editar estos datos.");

    try {
      setGuardando(true);
      setMsg("");
      const payload = {
        first_name: nombre.trim(),
        last_name: apellido.trim(),
        email: email.trim(),
        phone: (telefono || "").trim(),
        preferences: {
          email_notifications: !!notifEmail,
          push_notifications: !!notifPush,
        },
      };
      const { data } = await adminUpdateUser(targetId, payload);
      setMsg(data?.id || data?.success ? "Datos actualizados." : "No se pudieron actualizar los datos.");
    } catch (err) {
      console.error(err);
      const status = err?.response?.status;
      if (status === 403) return setMsg("No autorizado para actualizar datos personales.");
      const apiErr = err?.response?.data?.errors || err?.response?.data?.detail || err?.response?.data;
      setMsg(Array.isArray(apiErr) ? apiErr.join(" — ") : typeof apiErr === "string" ? apiErr : "Error al guardar los datos personales.");
    } finally {
      setGuardando(false);
    }
  };

  /* =======================
     Contraseña
     ======================= */
  const handleCambiarPassword = async (e) => {
    e.preventDefault();
    const targetId = isEditingSelf ? meId : selUser?.id;
    if (!targetId) return setMsg("No se pudo identificar el usuario destino.");

    if (isEditingSelf) {
      if (!passActual?.trim()) return setMsg("Ingresá la contraseña actual.");
      if (!passNueva?.trim() || !passConfirm?.trim()) return setMsg("Ingresá la nueva contraseña y su confirmación.");
      if (passNueva !== passConfirm) return setMsg("Las contraseñas no coinciden.");
    } else {
      if (!canEditOthers) return setMsg("No tenés permisos para cambiar esta contraseña.");
      if (!passNueva?.trim() || !passConfirm?.trim()) return setMsg("Ingresá la nueva contraseña y su confirmación.");
      if (passNueva !== passConfirm) return setMsg("Las contraseñas no coinciden.");
    }

    try {
      setGuardando(true);
      setMsg("");
      const payload = isEditingSelf
        ? { current_password: passActual, new_password: passNueva }
        : { password: passNueva };
      const { data } = await adminUpdateUser(targetId, payload);
      setMsg(data?.id || data?.success ? "Contraseña actualizada." : "No se pudo actualizar la contraseña.");
      if (data?.id || data?.success) {
        setPassActual(""); setPassNueva(""); setPassConfirm("");
      }
    } catch (err) {
      console.error(err);
      const status = err?.response?.status;
      if (status === 403) return setMsg("No autorizado para actualizar la contraseña.");
      const apiErr = err?.response?.data?.errors || err?.response?.data?.detail || err?.response?.data;
      setMsg(Array.isArray(apiErr) ? apiErr.join(" — ") : typeof apiErr === "string" ? apiErr : "Error al actualizar la contraseña.");
    } finally {
      setGuardando(false);
    }
  };

  /* ========
     Avatar
     ======== */
  const handleAvatarSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUrl(URL.createObjectURL(file));
  };
  const handleQuitarAvatar = () => {
    setAvatarUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  /* ==========================
     Selección desde la tabla
     ========================== */
  const seleccionarUsuario = async (u) => {
    if (!allowUserMgmt && !allowRoleMgmt) return;

    setSelUser(u);
    setRolesUsuario(new Set());
    setMsg("");

    if (allowUserMgmt) {
      setModoEdicion("editar");
      setFormUsuario({
        email: u.email || "",
        first_name: u.first_name || "",
        last_name: u.last_name || "",
        username: u.username || "",
        password: "",
        password2: "",
        is_active: u.is_active ?? true,
      });

      // Sincronizar tarjetas de arriba
      setNombre(u.first_name || "");
      setApellido(u.last_name || "");
      setEmail(u.email || "");
      setTelefono(u.phone || "");
      setPassActual(""); setPassNueva(""); setPassConfirm("");
    }

    try {
      setCargando(true);
      let canonRoles = [];
      if (Array.isArray(u._roles)) {
        canonRoles = u._roles.map(normalizeRole).filter(Boolean);
      } else {
        const { data } = await adminGetUserRoles(u.id);
        canonRoles = (Array.isArray(data?.roles) ? data.roles : []).map(normalizeRole).filter(Boolean);
      }
      setRolesUsuario(new Set(canonRoles));
      setRolesForm(new Set(canonRoles)); // ← también en el form multirol

      // Scroll al panel de roles
      const rolesCard = document.getElementById("roles-panel-anchor");
      if (rolesCard) rolesCard.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      console.error(err);
      if (err?.response?.status === 403) {
        setAllowRoleMgmt(false); setAllowUserMgmt(false);
      }
      setMsg("No se pudieron cargar los roles del usuario.");
    } finally {
      setCargando(false);
    }
  };

  /* ==========================
     Gestión de Roles (panel)
     ========================== */
  const toggleRolPanel = (rol) => {
    if (!allowRoleMgmt) return;
    const n = normalizeRole(rol);
    if (!n) return;
    const next = new Set(rolesUsuario);
    if (next.has(n)) next.delete(n); else next.add(n);
    setRolesUsuario(next);
  };

  const guardarRoles = async () => {
    if (!allowRoleMgmt || !selUser) return;
    try {
      setGuardando(true);
      const rolesToSave = Array.from(rolesUsuario);
      const { data } = await adminSetUserRoles(selUser.id, { roles: rolesToSave });
      if (data?.success) {
        setMsg("Roles actualizados correctamente.");
        setListRefreshKey((k) => k + 1); // refrescar lista
      } else {
        setMsg("No se pudieron actualizar los roles.");
      }
    } catch (err) {
      console.error(err);
      if (err?.response?.status === 403) {
        setAllowRoleMgmt(false); setAllowUserMgmt(false);
        return setMsg("No autorizado para gestionar roles.");
      }
      const apiErr = err?.response?.data?.errors;
      setMsg(Array.isArray(apiErr) ? apiErr.join(" — ") : "Error al actualizar roles.");
    } finally {
      setGuardando(false);
    }
  };

  /* ==========================
     Gestión de Usuarios (CRUD)
     ========================== */
  const validarUsuario = () => {
    const e = {};
    if (!formUsuario.email?.trim()) e.email = "Email requerido";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formUsuario.email.trim())) e.email = "Email inválido";
    if (!formUsuario.username?.trim()) e.username = "Usuario requerido";

    if (rolesForm.size === 0) e.roles = "Seleccioná al menos un rol";

    if (modoEdicion === "crear") {
      if (!formUsuario.password) e.password = "Contraseña requerida";
      if (formUsuario.password !== formUsuario.password2) e.password2 = "Las contraseñas no coinciden";
    } else if (formUsuario.password || formUsuario.password2) {
      if (formUsuario.password !== formUsuario.password2) e.password2 = "Las contraseñas no coinciden";
    }
    setErrorsUsuario(e);
    return Object.keys(e).length === 0;
  };

  const onChangeUsuario = (field, value) =>
    setFormUsuario((prev) => ({ ...prev, [field]: value }));

  const toggleRolForm = (rol) => {
    const n = normalizeRole(rol);
    if (!n) return;
    setRolesForm((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    });
  };

  const iniciarCreacion = () => {
    if (!allowUserMgmt) return;
    setModoEdicion("crear");
    setSelUser(null);
    setFormUsuario({
      email: "",
      first_name: "",
      last_name: "",
      username: "",
      password: "",
      password2: "",
      is_active: true,
    });
    setRolesForm(new Set(["Operador"]));
    setErrorsUsuario({});
    setPassActual(""); setPassNueva(""); setPassConfirm("");
  };

  const limpiarFormularioUsuario = () => {
    if (modoEdicion === "crear") {
      setFormUsuario({
        email: "",
        first_name: "",
        last_name: "",
        username: "",
        password: "",
        password2: "",
        is_active: true,
      });
      setRolesForm(new Set(["Operador"]));
    } else if (selUser) {
      setFormUsuario({
        email: selUser.email || "",
        first_name: selUser.first_name || "",
        last_name: selUser.last_name || "",
        username: selUser.username || "",
        password: "",
        password2: "",
        is_active: selUser.is_active ?? true,
      });
      setRolesForm(new Set(Array.isArray(selUser._roles) ? selUser._roles.map(normalizeRole).filter(Boolean) : []));
    }
    setErrorsUsuario({});
  };

  const guardarUsuario = async () => {
    if (!allowUserMgmt) return;
    if (!validarUsuario()) return;

    try {
      setGuardando(true);
      setMsg("");

      const rolesToAssign = Array.from(rolesForm); // multirol

      if (modoEdicion === "crear") {
        // 1) Crear usuario (datos básicos)
        const payload = {
          email: formUsuario.email.trim(),
          password: formUsuario.password,
          nombre: (formUsuario.first_name || "").trim(),
          apellido: (formUsuario.last_name || "").trim(),
          username: formUsuario.username.trim(),
          is_active: !!formUsuario.is_active,
        };
        const res = await adminCreateUser(payload);
        const data = res?.data || {};
        const newUserId = data?.id ?? data?.user?.id ?? null;

        // 2) Asignar roles (multi) asegurado desde el front
        if (newUserId && rolesToAssign.length) {
          try {
            await adminSetUserRoles(newUserId, { roles: rolesToAssign });
          } catch (e) {
            console.warn("No se pudieron asignar roles tras crear usuario:", e?.response?.data || e?.message);
          }
        }

        setMsg("Usuario creado correctamente.");
        setListRefreshKey((k) => k + 1); // refrescar listado
        iniciarCreacion(); // reset form
      } else if (modoEdicion === "editar" && selUser?.id) {
        // 1) Actualizar datos
        const payload = {
          email: formUsuario.email.trim(),
          first_name: formUsuario.first_name.trim(),
          last_name: formUsuario.last_name.trim(),
          username: formUsuario.username.trim(),
          ...(formUsuario.password ? { password: formUsuario.password } : {}),
          is_active: !!formUsuario.is_active,
        };
        const { data } = await adminUpdateUser(selUser.id, payload);

        // 2) Asignar roles (multi) del form
        try {
          await adminSetUserRoles(selUser.id, { roles: rolesToAssign });
        } catch (e) {
          console.warn("No se pudieron actualizar roles en edición:", e?.response?.data || e?.message);
        }

        if (data?.id || data?.success) {
          setMsg("Usuario actualizado correctamente.");
          setListRefreshKey((k) => k + 1); // refrescar listado
        } else {
          setMsg("No se pudo actualizar el usuario.");
        }
      }
    } catch (err) {
      console.error(err);
      if (err?.response?.status === 403) {
        setAllowRoleMgmt(false); setAllowUserMgmt(false);
        return setMsg("No autorizado para crear/editar usuarios.");
      }
      const apiErr = err?.response?.data?.errors || err?.response?.data?.detail || err?.response?.data;
      setMsg(Array.isArray(apiErr) ? apiErr.join(" — ") : typeof apiErr === "string" ? apiErr : "Error al guardar usuario.");
    } finally {
      setGuardando(false);
    }
  };

  /* ======================
     UI helpers
     ====================== */
  const selectedUserInfo = useMemo(() => {
    if (!selUser) return null;
    const roles = Array.isArray(selUser._roles) ? selUser._roles : [];
    return {
      username: selUser.username || "-",
      email: selUser.email || "-",
      name: `${selUser.first_name || ""} ${selUser.last_name || ""}`.trim() || "-",
      phone: selUser.phone || "-",
      active: selUser.is_active !== false,
      roles,
    };
  }, [selUser]);

  return (
    <div className="page-fill bg-app">
      <div className="container d-flex justify-content-center align-items-start py-3 py-md-4">
        <div className="w-100" style={{ maxWidth: 1180 }}>
          {/* Encabezado */}
          <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between mb-3 px-2 px-md-0">
            <div>
              <h2 className="text-bia fw-bold mb-1">Perfil</h2>
              <small className="text-secondary">
                Gestioná tus datos personales, preferencias, seguridad y administración (si sos Admin).
              </small>
            </div>
            <div className="mt-3 mt-md-0 d-flex gap-2">
              {allowUserMgmt && (
                <button className="btn btn-bia" onClick={iniciarCreacion}>
                  + Nuevo usuario
                </button>
              )}
              <button className="btn btn-outline-bia" onClick={() => window.history.back()}>
                Volver
              </button>
            </div>
          </div>

          {/* Datos personales */}
          <div className="card border-0 shadow-sm rounded-4 mb-4">
            <div className="card-body p-4">
              <div className="d-flex align-items-center justify-content-between">
                <h5 className="fw-semibold mb-3">
                  Datos personales{" "}
                  {!isEditingSelf && selUser ? (
                    <small className="text-secondary">· Editando <code>{selUser.username}</code></small>
                  ) : null}
                </h5>
                {!canEditProfile && <span className="badge text-bg-light border">Solo lectura</span>}
              </div>

              <form onSubmit={handleGuardarPerfil} className="row g-3">
                <div className="col-md-6">
                  <label className="form-label" htmlFor="pf-nombre">Nombre</label>
                  <input id="pf-nombre" className="form-control" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={!canEditProfile} />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="pf-apellido">Apellido</label>
                  <input id="pf-apellido" className="form-control" value={apellido} onChange={(e) => setApellido(e.target.value)} disabled={!canEditProfile} />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="pf-email">Email</label>
                  <input id="pf-email" type="email" className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canEditProfile} />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="pf-telefono">Teléfono</label>
                  <input id="pf-telefono" className="form-control" value={telefono} onChange={(e) => setTelefono(e.target.value)} disabled={!canEditProfile} />
                </div>

                <div className="col-12 d-flex justify-content-end">
                  <button className="btn btn-bia" type="submit" disabled={!canEditProfile || guardando}>
                    {guardando ? "Guardando..." : "Guardar cambios"}
                  </button>
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
                    <input id="notifEmail" className="form-check-input" type="checkbox" checked={notifEmail} onChange={(e) => setNotifEmail(e.target.checked)} disabled={!canEditProfile} />
                    <label className="form-check-label" htmlFor="notifEmail">Recibir notificaciones por email</label>
                  </div>
                  <div className="form-check form-switch mt-2">
                    <input id="notifPush" className="form-check-input" type="checkbox" checked={notifPush} onChange={(e) => setNotifPush(e.target.checked)} disabled={!canEditProfile} />
                    <label className="form-check-label" htmlFor="notifPush">Habilitar notificaciones push</label>
                  </div>
                </div>
                <div className="col-md-6">{/* futuro: idioma/tema */}</div>
              </div>
            </div>
          </div>

          {/* Seguridad */}
          <div className="card border-0 shadow-sm rounded-4 mb-4">
            <div className="card-body p-4">
              <div className="d-flex align-items-center justify-content-between">
                <h5 className="fw-semibold mb-3">
                  Seguridad{" "}
                  {!isEditingSelf && selUser ? (
                    <small className="text-secondary">· Editando <code>{selUser.username}</code></small>
                  ) : null}
                </h5>
              </div>

              <form onSubmit={handleCambiarPassword} className="row g-3">
                {isEditingSelf ? (
                  <>
                    <div className="col-md-4">
                      <label className="form-label" htmlFor="pf-pass-actual">Contraseña actual</label>
                      <input id="pf-pass-actual" type="password" className="form-control" autoComplete="current-password" value={passActual} onChange={(e) => setPassActual(e.target.value)} disabled={!canEditOwnProfile} />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label" htmlFor="pf-pass-nueva">Nueva contraseña</label>
                      <input id="pf-pass-nueva" type="password" className="form-control" autoComplete="new-password" value={passNueva} onChange={(e) => setPassNueva(e.target.value)} disabled={!canEditOwnProfile} />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label" htmlFor="pf-pass-confirm">Confirmar nueva</label>
                      <input id="pf-pass-confirm" type="password" className="form-control" autoComplete="new-password" value={passConfirm} onChange={(e) => setPassConfirm(e.target.value)} disabled={!canEditOwnProfile} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="pf-pass-nueva-2">Nueva contraseña</label>
                      <input id="pf-pass-nueva-2" type="password" className="form-control" autoComplete="new-password" value={passNueva} onChange={(e) => setPassNueva(e.target.value)} disabled={!canEditOthers} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="pf-pass-confirm-2">Confirmar nueva</label>
                      <input id="pf-pass-confirm-2" type="password" className="form-control" autoComplete="new-password" value={passConfirm} onChange={(e) => setPassConfirm(e.target.value)} disabled={!canEditOthers} />
                    </div>
                  </>
                )}

                <div className="col-12 d-flex justify-content-end">
                  <button className="btn btn-outline-bia" type="submit" disabled={guardando || (isEditingSelf ? !canEditOwnProfile : !canEditOthers)}>
                    {guardando ? "Guardando..." : "Actualizar contraseña"}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* ───────────── Gestión de Usuarios – Crear/Editar (con roles múltiples) ───────────── */}
          {allowUserMgmt && (
            <div className="card border-0 shadow-sm rounded-4 mb-4">
              <div className="card-body p-4">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <h5 className="fw-semibold mb-0">Gestión de Usuarios — {modoEdicion === "crear" ? "Crear" : `Editar ${selUser?.username || ""}`}</h5>
                  <span className="badge text-bg-light border">Solo Admin / Superusuario</span>
                </div>

                <div className="row g-3">
                  <div className="col-md-4">
                    <label className="form-label" htmlFor="usr-email">Email</label>
                    <input
                      id="usr-email"
                      type="email"
                      className={`form-control ${errorsUsuario.email ? "is-invalid" : ""}`}
                      value={formUsuario.email}
                      onChange={(e) => onChangeUsuario("email", e.target.value)}
                    />
                    {errorsUsuario.email && <div className="invalid-feedback">{errorsUsuario.email}</div>}
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
                    <label className="form-label" htmlFor="usr-username">Usuario</label>
                    <input
                      id="usr-username"
                      className={`form-control ${errorsUsuario.username ? "is-invalid" : ""}`}
                      value={formUsuario.username}
                      onChange={(e) => onChangeUsuario("username", e.target.value)}
                    />
                    {errorsUsuario.username && <div className="invalid-feedback">{errorsUsuario.username}</div>}
                  </div>

                  {/* Roles múltiples */}
                  <div className="col-md-8">
                    <label className="form-label d-block">Roles</label>
                    <div className="d-flex flex-wrap gap-3">
                      {rolesUI.map((r) => (
                        <div className="form-check" key={`form-role-${r.value}`}>
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id={`form-role-${r.value}`}
                            checked={rolesForm.has(r.value)}
                            onChange={() => toggleRolForm(r.value)}
                          />
                          <label className="form-check-label" htmlFor={`form-role-${r.value}`}>
                            {r.label}
                          </label>
                        </div>
                      ))}
                    </div>
                    {errorsUsuario.roles && (
                      <div className="text-danger small mt-1">{errorsUsuario.roles}</div>
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
                    {errorsUsuario.password && <div className="invalid-feedback">{errorsUsuario.password}</div>}
                  </div>

                  <div className="col-md-4">
                    <label className="form-label" htmlFor="usr-password2">Confirmar contraseña</label>
                    <input
                      id="usr-password2"
                      type="password"
                      className={`form-control ${errorsUsuario.password2 ? "is-invalid" : ""}`}
                      value={formUsuario.password2}
                      onChange={(e) => onChangeUsuario("password2", e.target.value)}
                      autoComplete="new-password"
                    />
                    {errorsUsuario.password2 && <div className="invalid-feedback">{errorsUsuario.password2}</div>}
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
                    <button className="btn btn-bia" onClick={guardarUsuario} disabled={guardando}>
                      {guardando
                        ? "Guardando..."
                        : modoEdicion === "crear"
                        ? "Crear usuario"
                        : "Guardar cambios"}
                    </button>
                    <button className="btn btn-outline-secondary" onClick={limpiarFormularioUsuario} type="button">
                      Limpiar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ───────────── Listado de Usuarios (paginado, búsqueda, filtros) ───────────── */}
          {allowUserMgmt && (
            <div className="mb-4">
              <UserList rolesUI={rolesUI} onSelect={seleccionarUsuario} refreshKey={listRefreshKey} />
            </div>
          )}

          {/* ───────────── Gestión de Roles (panel separado) ───────────── */}
          {allowRoleMgmt && selUser && (
            <div id="roles-panel-anchor" className="card border-0 shadow-sm rounded-4 mb-5">
              <div className="card-body p-4">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <h5 className="fw-semibold mb-0">Gestión de Roles</h5>
                  <span className="badge text-bg-light border">Solo Admin / Superusuario</span>
                </div>

                {selectedUserInfo && (
                  <div className="border rounded-3 p-3 mb-3 bg-light-subtle">
                    <div className="row g-2 small">
                      <div className="col-md-3">
                        <div className="text-secondary">Usuario</div>
                        <div className="fw-semibold">{selectedUserInfo.username}</div>
                      </div>
                      <div className="col-md-3">
                        <div className="text-secondary">Nombre</div>
                        <div className="fw-semibold">{selectedUserInfo.name}</div>
                      </div>
                      <div className="col-md-3">
                        <div className="text-secondary">Email</div>
                        <div className="fw-semibold">{selectedUserInfo.email}</div>
                      </div>
                      <div className="col-md-3">
                        <div className="text-secondary">Estado</div>
                        <div className="fw-semibold">
                          {selectedUserInfo.active ? "Activo" : "Inactivo"}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="d-flex flex-wrap gap-3">
                  {rolesUI.map((r) => (
                    <div className="form-check" key={r.value}>
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id={`rol-${r.value}`}
                        checked={rolesUsuario.has(r.value)}
                        onChange={() => toggleRolPanel(r.value)}
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

                {msg && <div className="alert alert-info mt-3 py-2 mb-0">{msg}</div>}
              </div>
            </div>
          )}

          {msg && !allowRoleMgmt && !allowUserMgmt && (
            <div className="alert alert-warning">{msg}</div>
          )}
        </div>
      </div>
    </div>
  );
}
