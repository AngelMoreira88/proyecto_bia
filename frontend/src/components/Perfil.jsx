// frontend/src/components/Perfil.jsx
import React, { useEffect, useState, useRef } from "react";

import {
  adminGetMe,
  adminListRoles,
  adminSearchUsers,
  adminGetUserRoles,
  adminSetUserRoles,
  adminCreateUser,
  adminUpdateUser,
} from "../services/api";

export default function Perfil() {
  // Identidad propia
  const [meId, setMeId] = useState(null);

  // Datos de perfil del "target" actual (yo u otro si admin seleccionó)
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [cargo, setCargo] = useState("");
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifPush, setNotifPush] = useState(false);

  // Seguridad (cambio de contraseña)
  const [passActual, setPassActual] = useState("");
  const [passNueva, setPassNueva] = useState("");
  const [passConfirm, setPassConfirm] = useState("");

  // Avatar (demo)
  const [avatarUrl, setAvatarUrl] = useState(null);
  const fileRef = useRef(null);

  // Permisos reales desde backend
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [meRoles, setMeRoles] = useState([]); // p.ej. ["Admin","Supervisor"]
  const [allowRoleMgmt, setAllowRoleMgmt] = useState(false); // Gestión de Roles
  const [allowUserMgmt, setAllowUserMgmt] = useState(false); // Gestión de Usuarios (solo Admin/superuser)

  // Gestión de roles (UI admin/superuser)
  const [rolesDisponibles, setRolesDisponibles] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [rolesFilter, setRolesFilter] = useState(new Set()); // multi–rol
  const [usuarios, setUsuarios] = useState([]); // [{...user, _roles: [...]}]
  const [selUser, setSelUser] = useState(null); // si hay selección y soy admin, edito a este usuario
  const [rolesUsuario, setRolesUsuario] = useState(new Set());
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

  // Flags derivados
  const rolesLower = meRoles.map((r) => String(r).toLowerCase());

  // ¿Estoy editando a otro usuario?
  const isEditingSelf = !selUser || selUser?.id === meId;
  // Cualquier autenticado puede editar su propio perfil y contraseña
  const canEditOwnProfile = !!meId;
  // Para editar a otros, solo admin/superuser
  const canEditOthers = allowUserMgmt;
  // Permiso efectivo para el panel actual (target = self u otro)
  const canEditProfile = isEditingSelf ? canEditOwnProfile : canEditOthers;

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
            company,
            position,
            preferences,
          } = meRes.data;

          setMeId(id ?? null);
          setIsSuperUser(!!is_superuser);

          const rArr = Array.isArray(roles) ? roles : [];
          setMeRoles(rArr);

          const canAdmin =
            !!is_superuser || rArr.map((x) => String(x).toLowerCase()).includes("admin");
          setAllowRoleMgmt(canAdmin);
          setAllowUserMgmt(canAdmin);

          // Cargo mis datos en el panel (por defecto: yo)
          setNombre(first_name ?? "");
          setApellido(last_name ?? "");
          setEmail(meEmail ?? "");
          setTelefono(phone ?? "");
          setEmpresa(company ?? "");
          setCargo(position ?? "");
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
        setRolesDisponibles(
          Array.isArray(rolesRes?.data?.roles) ? rolesRes.data.roles : []
        );
      } finally {
        setCargando(false);
      }
    };
    load();
  }, []);

  // Recalcular flags si cambian
  useEffect(() => {
    const canAdmin = !!isSuperUser || rolesLower.includes("admin");
    setAllowRoleMgmt(canAdmin);
    setAllowUserMgmt(canAdmin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperUser, meRoles]);

  // Guardar datos personales del target (yo u otro si admin)
  const handleGuardarPerfil = async (e) => {
    e.preventDefault();

    const targetId = isEditingSelf ? meId : selUser?.id;
    if (!targetId) {
      setMsg("No se pudo identificar el usuario destino.");
      return;
    }
    if (!canEditProfile) {
      setMsg("No tenés permisos para editar estos datos.");
      return;
    }

    try {
      setGuardando(true);
      setMsg("");

      const payload = {
        first_name: nombre.trim(),
        last_name: apellido.trim(),
        email: email.trim(),
        phone: (telefono || "").trim(),
        company: (empresa || "").trim(),
        position: (cargo || "").trim(),
        preferences: {
          email_notifications: !!notifEmail,
          push_notifications: !!notifPush,
        },
      };

      const { data } = await adminUpdateUser(targetId, payload);
      if (data?.id || data?.success) {
        setMsg(
          isEditingSelf ? "Tus datos fueron actualizados." : "Datos del usuario actualizados."
        );
        if (!isEditingSelf && selUser) {
          setUsuarios((prev) =>
            prev.map((u) => (u.id === selUser.id ? { ...u, ...payload } : u))
          );
        }
      } else {
        setMsg("No se pudieron actualizar los datos.");
      }
    } catch (err) {
      console.error(err);
      const status = err?.response?.status;
      if (status === 403) {
        setMsg("No autorizado para actualizar datos personales.");
        return;
      }
      const apiErr =
        err?.response?.data?.errors ||
        err?.response?.data?.detail ||
        err?.response?.data;
      setMsg(
        Array.isArray(apiErr)
          ? apiErr.join(" — ")
          : typeof apiErr === "string"
          ? apiErr
          : "Error al guardar los datos personales."
      );
    } finally {
      setGuardando(false);
    }
  };

  // Cambiar contraseña del target (yo u otro si admin)
  const handleCambiarPassword = async (e) => {
    e.preventDefault();

    const targetId = isEditingSelf ? meId : selUser?.id;
    if (!targetId) {
      setMsg("No se pudo identificar el usuario destino.");
      return;
    }

    // Validaciones de formulario
    if (isEditingSelf) {
      if (!passActual?.trim()) {
        setMsg("Ingresá la contraseña actual.");
        return;
      }
      if (!passNueva?.trim() || !passConfirm?.trim()) {
        setMsg("Ingresá la nueva contraseña y su confirmación.");
        return;
      }
      if (passNueva !== passConfirm) {
        setMsg("Las contraseñas no coinciden.");
        return;
      }
    } else {
      // admin cambiando a otro: solo nueva + confirm
      if (!passNueva?.trim() || !passConfirm?.trim()) {
        setMsg("Ingresá la nueva contraseña y su confirmación.");
        return;
      }
      if (passNueva !== passConfirm) {
        setMsg("Las contraseñas no coinciden.");
        return;
      }
      if (!canEditOthers) {
        setMsg("No tenés permisos para cambiar esta contraseña.");
        return;
      }
    }

    try {
      setGuardando(true);
      setMsg("");

      // Payload según caso
      const payload = isEditingSelf
        ? { current_password: passActual, new_password: passNueva }
        : { password: passNueva }; // admin/superuser para terceros

      const { data } = await adminUpdateUser(targetId, payload);
      if (data?.id || data?.success) {
        setMsg(
          isEditingSelf ? "Tu contraseña fue actualizada." : "Contraseña del usuario actualizada."
        );
        setPassActual("");
        setPassNueva("");
        setPassConfirm("");
      } else {
        setMsg("No se pudo actualizar la contraseña.");
      }
    } catch (err) {
      console.error(err);
      const status = err?.response?.status;
      if (status === 403) {
        setMsg("No autorizado para actualizar la contraseña.");
        return;
      }
      const apiErr =
        err?.response?.data?.errors ||
        err?.response?.data?.detail ||
        err?.response?.data;
      setMsg(
        Array.isArray(apiErr)
          ? apiErr.join(" — ")
          : typeof apiErr === "string"
          ? apiErr
          : "Error al actualizar la contraseña."
      );
    } finally {
      setGuardando(false);
    }
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

  // ======= LISTADO / FILTROS (Admin/Superuser) =======

  const toggleRoleFilter = (rol) => {
    setRolesFilter((prev) => {
      const n = new Set(prev);
      if (n.has(rol)) n.delete(rol);
      else n.add(rol);
      return n;
    });
  };

  const limpiarFiltros = () => {
    setBusqueda("");
    setGroupFilter("");
    setRolesFilter(new Set());
  };

  // Obtiene usuarios del backend, y **carga sus roles**; filtra por roles en cliente si hace falta
  const buscarUsuarios = async (opts = { listAll: false }) => {
    if (!allowRoleMgmt) return;

    const q = opts.listAll ? "__all__" : busqueda.trim();
    const rolesCsv = Array.from(rolesFilter).join(",");

    try {
      setCargando(true);
      setMsg("");

      // Si tu backend soporta roles, enviamos el parámetro.
      const { data } = await adminSearchUsers(q || "", groupFilter || "", rolesCsv || "");
      let results = Array.isArray(data?.results) ? data.results : [];

      // 1) Cargar roles por usuario (Promise.all) y cachear en _roles
      const withRoles = await Promise.all(
        results.map(async (u) => {
          try {
            const r = await adminGetUserRoles(u.id);
            const rolesU = Array.isArray(r?.data?.roles) ? r.data.roles : [];
            return { ...u, _roles: rolesU };
          } catch {
            return { ...u, _roles: [] };
          }
        })
      );

      // 2) Filtrado cliente por roles (si hay filtros marcados)
      if (rolesFilter.size > 0) {
        const want = new Set(rolesFilter);
        results = withRoles.filter((u) => (u._roles || []).some((r) => want.has(r)));
      } else {
        results = withRoles;
      }

      setUsuarios(results);
    } catch (err) {
      console.error(err);
      if (err?.response?.status === 403) {
        setAllowRoleMgmt(false);
        setAllowUserMgmt(false);
      }
      setMsg("No se pudieron obtener usuarios.");
    } finally {
      setCargando(false);
    }
  };

  const seleccionarUsuario = async (u) => {
    if (!allowRoleMgmt) return;
    setSelUser(u);
    setRolesUsuario(new Set());
    setMsg("");

    // Si soy admin/superuser → puedo editar datos de ese usuario, sincronizo panel
    if (allowUserMgmt) {
      setModoEdicion("editar");
      setFormUsuario({
        username: u.username || "",
        email: u.email || "",
        first_name: u.first_name || "",
        last_name: u.last_name || "",
        password: "",
        is_active: u.is_active ?? true,
      });
      setErrorsUsuario({});

      // Sincronizo panel de datos personales con el usuario seleccionado
      setNombre(u.first_name || "");
      setApellido(u.last_name || "");
      setEmail(u.email || "");
      setTelefono(u.phone || "");
      setEmpresa(u.company || "");
      setCargo(u.position || "");

      // Reset de contraseñas panel seguridad
      setPassActual("");
      setPassNueva("");
      setPassConfirm("");
    }

    try {
      setCargando(true);
      // Si el usuario ya trae _roles (cargados en la búsqueda), usarlos; si no, pedirlos:
      if (Array.isArray(u._roles)) {
        setRolesUsuario(new Set(u._roles));
      } else {
        const { data } = await adminGetUserRoles(u.id);
        setRolesUsuario(new Set(Array.isArray(data?.roles) ? data.roles : []));
      }
    } catch (err) {
      console.error(err);
      if (err?.response?.status === 403) {
        setAllowRoleMgmt(false);
        setAllowUserMgmt(false);
      }
      setMsg("No se pudieron cargar los roles del usuario.");
    } finally {
      setCargando(false);
    }
  };

  const toggleRol = (rol) => {
    if (!allowRoleMgmt) return;
    const next = new Set(rolesUsuario);
    if (next.has(rol)) next.delete(rol);
    else next.add(rol);
    setRolesUsuario(next);
  };

  const guardarRoles = async () => {
    if (!allowRoleMgmt || !selUser) return;
    try {
      setGuardando(true);
      const body = { roles: Array.from(rolesUsuario) };
      const { data } = await adminSetUserRoles(selUser.id, body);
      if (data?.success) {
        setMsg("Roles actualizados correctamente.");
        // reflejar en la tabla
        setUsuarios((prev) =>
          prev.map((u) => (u.id === selUser.id ? { ...u, _roles: body.roles } : u))
        );
      } else {
        setMsg("No se pudieron actualizar los roles.");
      }
    } catch (err) {
      console.error(err);
      if (err?.response?.status === 403) {
        setAllowRoleMgmt(false);
        setAllowUserMgmt(false);
        setMsg("No autorizado para gestionar roles.");
        return;
      }
      const apiErr = err?.response?.data?.errors;
      setMsg(
        Array.isArray(apiErr) ? apiErr.join(" — ") : "Error al actualizar roles."
      );
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
    setModoEdicion("crear");
    setSelUser(null);
    // Volver panel a mis datos (no forzamos fetch; mantenemos lo cargado al inicio)
    setPassActual("");
    setPassNueva("");
    setPassConfirm("");
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
    if (!allowUserMgmt) return;
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
          password: formUsuario.password,
          is_active: !!formUsuario.is_active,
        };
        const { data } = await adminCreateUser(payload);
        if (data?.id) {
          setMsg("Usuario creado correctamente.");
          await buscarUsuarios({ listAll: true });
          limpiarFormularioUsuario();
        } else {
          setMsg("No se pudo crear el usuario.");
        }
      } else if (modoEdicion === "editar" && selUser?.id) {
        const payload = {
          username: formUsuario.username.trim(),
          email: formUsuario.email.trim(),
          first_name: formUsuario.first_name.trim(),
          last_name: formUsuario.last_name.trim(),
          ...(formUsuario.password ? { password: formUsuario.password } : {}),
          is_active: !!formUsuario.is_active,
        };
        const { data } = await adminUpdateUser(selUser.id, payload);
        if (data?.id || data?.success) {
          setMsg("Usuario actualizado correctamente.");
          setUsuarios((prev) =>
            prev.map((u) => (u.id === selUser.id ? { ...u, ...payload } : u))
          );
        } else {
          setMsg("No se pudo actualizar el usuario.");
        }
      }
    } catch (err) {
      console.error(err);
      if (err?.response?.status === 403) {
        setAllowRoleMgmt(false);
        setAllowUserMgmt(false);
        setMsg("No autorizado para crear/editar usuarios.");
        return;
      }
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
    if (!allowUserMgmt) return;
    setModoEdicion("crear");
    setFormUsuario({
      username: "",
      email: "",
      first_name: "",
      last_name: "",
      password: "",
      is_active: true,
    });
    setErrorsUsuario({});
    setSelUser(null);
    setPassActual("");
    setPassNueva("");
    setPassConfirm("");
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

          {/* Datos personales (editable para todos si es su propio perfil; admin/superuser para otros) */}
          <div className="card border-0 shadow-sm rounded-4 mb-4">
            <div className="card-body p-4">
              <div className="d-flex align-items-center justify-content-between">
                <h5 className="fw-semibold mb-3">
                  Datos personales{" "}
                  {!isEditingSelf && selUser ? (
                    <small className="text-secondary">
                      · Editando <code>{selUser.username}</code>
                    </small>
                  ) : null}
                </h5>
                {!canEditProfile && (
                  <span className="badge text-bg-light border">Solo lectura</span>
                )}
              </div>

              <form onSubmit={handleGuardarPerfil} className="row g-3">
                <div className="col-md-6">
                  <label className="form-label" htmlFor="pf-nombre">
                    Nombre
                  </label>
                  <input
                    id="pf-nombre"
                    className="form-control"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    disabled={!canEditProfile}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="pf-apellido">
                    Apellido
                  </label>
                  <input
                    id="pf-apellido"
                    className="form-control"
                    value={apellido}
                    onChange={(e) => setApellido(e.target.value)}
                    disabled={!canEditProfile}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="pf-email">
                    Email
                  </label>
                  <input
                    id="pf-email"
                    type="email"
                    className="form-control"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={!canEditProfile}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="pf-telefono">
                    Teléfono
                  </label>
                  <input
                    id="pf-telefono"
                    className="form-control"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    disabled={!canEditProfile}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="pf-empresa">
                    Empresa
                  </label>
                  <input
                    id="pf-empresa"
                    className="form-control"
                    value={empresa}
                    onChange={(e) => setEmpresa(e.target.value)}
                    disabled={!canEditProfile}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="pf-cargo">
                    Cargo
                  </label>
                  <input
                    id="pf-cargo"
                    className="form-control"
                    value={cargo}
                    onChange={(e) => setCargo(e.target.value)}
                    disabled={!canEditProfile}
                  />
                </div>

                <div className="col-12 d-flex justify-content-end">
                  <button
                    className="btn btn-bia"
                    type="submit"
                    disabled={!canEditProfile || guardando}
                  >
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
                    <input
                      id="notifEmail"
                      className="form-check-input"
                      type="checkbox"
                      checked={notifEmail}
                      onChange={(e) => setNotifEmail(e.target.checked)}
                      disabled={!canEditProfile}
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
                      disabled={!canEditProfile}
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

          {/* Seguridad: cambiar contraseña */}
          <div className="card border-0 shadow-sm rounded-4 mb-4">
            <div className="card-body p-4">
              <div className="d-flex align-items-center justify-content-between">
                <h5 className="fw-semibold mb-3">
                  Seguridad{" "}
                  {!isEditingSelf && selUser ? (
                    <small className="text-secondary">
                      · Editando <code>{selUser.username}</code>
                    </small>
                  ) : null}
                </h5>
              </div>

              <form onSubmit={handleCambiarPassword} className="row g-3">
                {isEditingSelf ? (
                  <>
                    <div className="col-md-4">
                      <label className="form-label" htmlFor="pf-pass-actual">
                        Contraseña actual
                      </label>
                      <input
                        id="pf-pass-actual"
                        type="password"
                        className="form-control"
                        autoComplete="current-password"
                        value={passActual}
                        onChange={(e) => setPassActual(e.target.value)}
                        disabled={!canEditOwnProfile}
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label" htmlFor="pf-pass-nueva">
                        Nueva contraseña
                      </label>
                      <input
                        id="pf-pass-nueva"
                        type="password"
                        className="form-control"
                        autoComplete="new-password"
                        value={passNueva}
                        onChange={(e) => setPassNueva(e.target.value)}
                        disabled={!canEditOwnProfile}
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label" htmlFor="pf-pass-confirm">
                        Confirmar nueva
                      </label>
                      <input
                        id="pf-pass-confirm"
                        type="password"
                        className="form-control"
                        autoComplete="new-password"
                        value={passConfirm}
                        onChange={(e) => setPassConfirm(e.target.value)}
                        disabled={!canEditOwnProfile}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="pf-pass-nueva-2">
                        Nueva contraseña
                      </label>
                      <input
                        id="pf-pass-nueva-2"
                        type="password"
                        className="form-control"
                        autoComplete="new-password"
                        value={passNueva}
                        onChange={(e) => setPassNueva(e.target.value)}
                        disabled={!canEditOthers}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="pf-pass-confirm-2">
                        Confirmar nueva
                      </label>
                      <input
                        id="pf-pass-confirm-2"
                        type="password"
                        className="form-control"
                        autoComplete="new-password"
                        value={passConfirm}
                        onChange={(e) => setPassConfirm(e.target.value)}
                        disabled={!canEditOthers}
                      />
                    </div>
                  </>
                )}

                <div className="col-12 d-flex justify-content-end">
                  <button
                    className="btn btn-outline-bia"
                    type="submit"
                    disabled={guardando || (isEditingSelf ? !canEditOwnProfile : !canEditOthers)}
                  >
                    {guardando ? "Guardando..." : "Actualizar contraseña"}
                  </button>
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

          {/* Gestión de Usuarios (solo Admin/Superuser) */}
          {allowUserMgmt && (
            <div className="card border-0 shadow-sm rounded-4 mb-5">
              <div className="card-body p-4">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <h5 className="fw-semibold mb-0">Gestión de Usuarios</h5>
                  <span className="badge text-bg-light border">Solo Admin</span>
                </div>

                {/* Filtros */}
                <div className="row g-2 align-items-end mb-3">
                  <div className="col-md-3">
                    <label className="form-label" htmlFor="usr-filtro-rol">
                      Filtrar por grupo
                    </label>
                    <select
                      id="usr-filtro-rol"
                      className="form-select"
                      value={groupFilter}
                      onChange={(e) => setGroupFilter(e.target.value)}
                    >
                      <option value="">Todos</option>
                      {rolesDisponibles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-5">
                    <label className="form-label d-block">Filtrar por roles</label>
                    <div className="d-flex flex-wrap gap-3">
                      {rolesDisponibles.map((r) => (
                        <div className="form-check" key={`f-${r}`}>
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id={`f-role-${r}`}
                            checked={rolesFilter.has(r)}
                            onChange={() => toggleRoleFilter(r)}
                          />
                          <label className="form-check-label" htmlFor={`f-role-${r}`}>
                            {r}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="col-md-2">
                    <label className="form-label" htmlFor="usr-buscar">
                      Buscar
                    </label>
                    <input
                      id="usr-buscar"
                      className="form-control"
                      placeholder="usuario, email, nombre o apellido"
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      onKeyDown={(e) => (e.key === "Enter" ? buscarUsuarios() : null)}
                    />
                  </div>

                  <div className="col-md-2 d-flex gap-2">
                    <button
                      className="btn btn-outline-secondary w-100"
                      onClick={() => buscarUsuarios()}
                      disabled={cargando}
                    >
                      {cargando ? "Buscando..." : "Buscar"}
                    </button>
                    <button
                      className="btn btn-outline-bia w-100"
                      onClick={() => buscarUsuarios({ listAll: true })}
                      disabled={cargando}
                      title="Listar todos los usuarios"
                    >
                      {cargando ? "Cargando..." : "Todos"}
                    </button>
                  </div>

                  <div className="col-12 mt-2 d-flex justify-content-end">
                    <button
                      className="btn btn-link text-decoration-none"
                      type="button"
                      onClick={limpiarFiltros}
                    >
                      Limpiar filtros
                    </button>
                  </div>
                </div>

                {/* Toolbar crear/editar */}
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

                {/* Form de crear/editar */}
                <div className="row g-3 mb-4">
                  <div className="col-md-4">
                    <label className="form-label" htmlFor="usr-username">
                      Usuario
                    </label>
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
                    <label className="form-label" htmlFor="usr-email">
                      Email
                    </label>
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
                    <label className="form-label" htmlFor="usr-first">
                      Nombre
                    </label>
                    <input
                      id="usr-first"
                      className="form-control"
                      value={formUsuario.first_name}
                      onChange={(e) => onChangeUsuario("first_name", e.target.value)}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label" htmlFor="usr-last">
                      Apellido
                    </label>
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
                    <button className="btn btn-bia" onClick={guardarUsuario} disabled={guardando}>
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

                {/* Tabla de usuarios + roles */}
                {usuarios.length > 0 && (
                  <div className="table-responsive">
                    <table className="table align-middle">
                      <thead>
                        <tr>
                          <th style={{ minWidth: 140 }}>Usuario</th>
                          <th>Nombre</th>
                          <th>Email</th>
                          <th style={{ minWidth: 220 }}>Roles</th>
                          <th>Estado</th>
                          <th style={{ width: 1 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {usuarios.map((u) => (
                          <tr
                            key={u.id}
                            className={selUser?.id === u.id ? "table-active" : ""}
                          >
                            <td className="text-truncate">{u.username}</td>
                            <td className="text-truncate">
                              {u.first_name || u.last_name
                                ? `${u.first_name || ""} ${u.last_name || ""}`.trim()
                                : "-"}
                            </td>
                            <td className="text-truncate">{u.email || "-"}</td>
                            <td>
                              {Array.isArray(u._roles) && u._roles.length > 0 ? (
                                <div className="d-flex flex-wrap gap-1">
                                  {u._roles.map((r) => (
                                    <span
                                      key={`${u.id}-${r}`}
                                      className="badge text-bg-light border"
                                    >
                                      {r}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-secondary">—</span>
                              )}
                            </td>
                            <td>
                              {u.is_active === false ? (
                                <span className="badge text-bg-secondary">Inactivo</span>
                              ) : (
                                <span className="badge text-bg-success">Activo</span>
                              )}
                            </td>
                            <td>
                              <button
                                className="btn btn-sm btn-outline-bia"
                                onClick={() => seleccionarUsuario(u)}
                              >
                                Editar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {usuarios.length === 0 && (
                  <div className="text-secondary">Sin resultados.</div>
                )}
              </div>
            </div>
          )}

          {/* Gestión de Roles (solo superuser o admin) */}
          {allowRoleMgmt && selUser && (
            <div className="card border-0 shadow-sm rounded-4 mb-5">
              <div className="card-body p-4">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <h5 className="fw-semibold mb-0">Gestión de Roles</h5>
                  <span className="badge text-bg-light border">Solo superusuario / admin</span>
                </div>

                <div className="mb-2">
                  <strong>Asignar roles a:</strong>{" "}
                  <code>{selUser.username}</code>{" "}
                  {selUser.email ? (
                    <span className="text-muted ms-2">{selUser.email}</span>
                  ) : null}
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
                  <button
                    className="btn btn-outline-secondary"
                    onClick={() => setSelUser(null)}
                  >
                    Cancelar
                  </button>
                </div>

                {msg && <div className="alert alert-info mt-3 py-2 mb-0">{msg}</div>}
              </div>
            </div>
          )}

          {/* Zona peligrosa (opcional) */}
          {allowUserMgmt && (
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

          {msg && !allowRoleMgmt && !allowUserMgmt && (
            <div className="alert alert-warning">{msg}</div>
          )}
        </div>
      </div>
    </div>
  );
}
