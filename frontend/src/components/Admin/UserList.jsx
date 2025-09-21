// frontend/src/components/admin/UserList.jsx
import React, { useEffect, useMemo, useState } from "react";
import { adminSearchUsers, adminGetUserRoles } from "../../services/api";

/**
 * Tabla de usuarios con:
 * - Búsqueda por texto (usuario/email/nombre)
 * - Filtro por roles (Admin, Supervisor, Operador)
 * - Paginación (page, pageSize)
 * - Carga de roles por fila (fetch paralelo por página)
 *
 * Props:
 *  - rolesUI: [{value:"Admin", label:"Admin"}, ...]  // cat. de roles para filtros
 *  - onSelect: (user) => void                        // callback al hacer click en "Editar"
 *  - refreshKey: number                              // forzar recarga externa
 */
export default function UserList({ rolesUI = [], onSelect, refreshKey = 0 }) {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState(new Set());

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((count || 0) / (pageSize || 10))),
    [count, pageSize]
  );

  const rolesCsv = useMemo(() => Array.from(roleFilter).join(","), [roleFilter]);

  const toggleRole = (value) => {
    setRoleFilter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
    setPage(1);
  };

  const clearFilters = () => {
    setRoleFilter(new Set());
    setSearch("");
    setPage(1);
  };

  async function fetchData() {
    try {
      setLoading(true);
      setErr("");

      // Compatibilidad con tu servicio:
      // adminSearchUsers(q, page?, rolesCsv?, pageSize?)
      // Si tu implementación usa objeto/params, igual suele ignorar extras no usados.
      const q = (search || "").trim();
      const { data } = await adminSearchUsers(q, page, rolesCsv || undefined, pageSize);

      // DRF: {count, results}  |  o arreglo simple
      let list = [];
      let total = 0;
      if (Array.isArray(data)) {
        list = data;
        total = data.length;
      } else {
        list = Array.isArray(data?.results) ? data.results : [];
        total =
          typeof data?.count === "number"
            ? data.count
            : (data?.results ?? []).length;
      }

      // Cargar roles por usuario de la página
      const withRoles = await Promise.all(
        list.map(async (u) => {
          if (Array.isArray(u._roles)) return u;
          try {
            const r = await adminGetUserRoles(u.id);
            const roles = Array.isArray(r?.data?.roles) ? r.data.roles : [];
            return { ...u, _roles: roles };
          } catch {
            return { ...u, _roles: [] };
          }
        })
      );

      setRows(withRoles);
      setCount(total);
    } catch (e) {
      console.error("Error listando usuarios:", e);
      setErr("No se pudo cargar el listado de usuarios.");
    } finally {
      setLoading(false);
    }
  }

  // fetch inicial y cuando cambian page/pageSize/refreshKey/rolesCsv
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, refreshKey, rolesCsv]);

  // ✅ debounce de 300 ms al escribir en search
  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1); // resetear a primera página
      fetchData();
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const submitSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchData();
  };

  return (
    <div className="card shadow-sm border-0 rounded-4">
      <div className="card-header">
        <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center">
          <strong>Usuarios</strong>
          <form className="d-flex flex-wrap gap-2" onSubmit={submitSearch}>
            <input
              className="form-control"
              placeholder="Buscá por usuario, email, nombre o apellido…"
              title="Buscar por usuario, email, nombre o apellido"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ minWidth: 380, width: "clamp(320px, 40vw, 640px)" }}
            />
            <button className="btn btn-outline-secondary" type="submit" disabled={loading}>
              Buscar
            </button>
          </form>
        </div>

        {/* Filtros por rol */}
        <div className="mt-3 d-flex flex-wrap align-items-center gap-3">
          <div className="small text-secondary">Filtrar por rol:</div>
          <div className="d-flex flex-wrap gap-3">
            {rolesUI.map((r) => (
              <div className="form-check" key={`f-${r.value}`}>
                <input
                  className="form-check-input"
                  type="checkbox"
                  id={`f-role-${r.value}`}
                  checked={roleFilter.has(r.value)}
                  onChange={() => toggleRole(r.value)}
                />
                <label className="form-check-label" htmlFor={`f-role-${r.value}`}>
                  {r.label}
                </label>
              </div>
            ))}
          </div>
          {(roleFilter.size > 0 || (search ?? "").trim()) && (
            <button className="btn btn-link btn-sm text-decoration-none" onClick={clearFilters} type="button">
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      <div className="card-body p-0">
        {err && (
          <div className="alert alert-danger m-3" role="alert">
            {err}
          </div>
        )}

        <div style={{ overflowX: "auto" }}>
          <table className="table table-hover align-middle m-0">
            <thead className="table-light">
              <tr>
                <th style={{ width: 44 }}></th>
                <th>Usuario</th>
                <th>Nombre</th>
                <th>Apellido</th>
                <th>Email</th>
                <th style={{ minWidth: 220 }}>Roles</th>
                <th>Estado</th>
                <th className="text-end" style={{ width: 160 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-4">Cargando…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-4 text-muted">
                    No hay usuarios para mostrar.
                  </td>
                </tr>
              ) : (
                rows.map((u, i) => (
                  <tr key={u.id ?? i}>
                    <td className="text-muted small">{(page - 1) * pageSize + i + 1}</td>
                    <td className="text-truncate">{u.username}</td>
                    <td className="text-truncate">{u.first_name || "—"}</td>
                    <td className="text-truncate">{u.last_name || "—"}</td>
                    <td className="text-truncate">{u.email || "—"}</td>
                    <td>
                      {Array.isArray(u._roles) && u._roles.length > 0 ? (
                        <div className="d-flex flex-wrap gap-1">
                          {u._roles.map((r) => (
                            <span key={`${u.id}-${r}`} className="badge text-bg-light border">
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
                    <td className="text-end">
                      <div className="btn-group btn-group-sm">
                        <button
                          type="button"
                          className="btn btn-outline-primary"
                          title="Editar / Ver"
                          onClick={() => onSelect && onSelect(u)}
                        >
                          Editar
                        </button>
                        {/* Si querés agregar "Desactivar/Activar" o "Reset pass", podés sumar más botones acá */}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación */}
      <div className="card-footer d-flex flex-wrap gap-2 justify-content-between align-items-center">
        <div className="text-muted small">
          {count} usuario{count === 1 ? "" : "s"} · Página {page} de {totalPages}
        </div>
        <div className="d-flex align-items-center gap-2">
          <select
            className="form-select form-select-sm"
            style={{ width: 110 }}
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>{n} / pág.</option>
            ))}
          </select>
          <div className="btn-group btn-group-sm">
            <button
              className="btn btn-outline-secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹ Anterior
            </button>
            <button
              className="btn btn-outline-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Siguiente ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
