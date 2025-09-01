// frontend/src/components/EntidadDashboard/EntidadList.jsx
import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { isLoggedIn } from '../../services/auth';

const ENTIDADES_BASE = '/api/certificado/entidades/';
const API_BASE = process.env.REACT_APP_API_BASE || '/';

// Une base + path evitando dobles /
// Si el path ya es absoluto (http/https), lo devuelve igual.
const resolveMediaUrl = (url) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (API_BASE.endsWith('/') && url.startsWith('/')) return API_BASE + url.slice(1);
  return API_BASE + url;
};

// Convierte payload a {items, count, next, previous}
const normalizeResponse = (data) => {
  if (Array.isArray(data)) {
    return { items: data, count: data.length, next: null, previous: null };
  }
  return {
    items: Array.isArray(data?.results) ? data.results
          : Array.isArray(data?.items)   ? data.items
          : [],
    count: typeof data?.count === 'number'
      ? data.count
      : (Array.isArray(data?.results) ? data.results.length : 0),
    next: data?.next ?? null,
    previous: data?.previous ?? null,
  };
};

export default function EntidadList({ onEdit }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20); // ajustá si tu DRF usa otro PAGE_SIZE
  const [count, setCount] = useState(0);
  const [next, setNext] = useState(null);
  const [previous, setPrevious] = useState(null);

  // Debounce de la búsqueda (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const fetchEntidades = async (opts = {}) => {
    const { pageArg = page, searchArg = debouncedQ } = opts;
    try {
      setLoading(true);
      setErr(null);

      const params = { page: pageArg };
      // Si tu ViewSet tiene SearchFilter, esto permitirá server-side search.
      // Si no, igual hacemos filter client-side más abajo.
      if (searchArg) params.search = searchArg;
      if (pageSize) params.page_size = pageSize;

      const res = await api.get(ENTIDADES_BASE, { params });
      const n = normalizeResponse(res.data);

      setItems(n.items);
      setCount(n.count);
      setNext(n.next);
      setPrevious(n.previous);
    } catch (e) {
      console.error('Error cargando entidades', e);
      setItems([]);
      setCount(0);
      setNext(null);
      setPrevious(null);
      setErr('No se pudo cargar el listado de entidades');
    } finally {
      setLoading(false);
    }
  };

  // 🔴 Eliminar con confirmación
  const handleDelete = async (ent) => {
    if (!ent?.id) {
      alert('Entidad inválida (sin ID).');
      return;
    }
    const ok = window.confirm(`¿Seguro que querés eliminar la entidad "${ent.nombre ?? ent.id}"?`);
    if (!ok) return;

    try {
      // Eliminación en backend
      await api.delete(`${ENTIDADES_BASE}${ent.id}/`);
      // Refresco desde el backend para mantener paginado/contador correctos
      await fetchEntidades({ pageArg: page, searchArg: debouncedQ });
    } catch (e) {
      console.error('Error eliminando entidad', e);
      alert('No se pudo eliminar la entidad');
    }
  };

  // Carga inicial y cuando cambia página o debouncedQ
  useEffect(() => {
    fetchEntidades({ pageArg: page, searchArg: debouncedQ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedQ]);

  // Si cambia el término de búsqueda, vuelve a la página 1
  useEffect(() => {
    setPage(1);
  }, [debouncedQ]);

  // Filtro client-side (fallback si el backend no tiene SearchFilter)
  const filtered = useMemo(() => {
    const list = Array.isArray(items) ? items : [];
    const term = String(debouncedQ || '').toLowerCase();
    if (!term) return list;
    const hay = (s) => (s ?? '').toString().toLowerCase();
    return list.filter((e) =>
      hay(e.nombre).includes(term) ||
      hay(e.responsable).includes(term) ||
      hay(e.cargo).includes(term) ||
      hay(e.razon_social).includes(term)
    );
  }, [items, debouncedQ]);

  // UI helpers de paginación
  const totalPages = count && pageSize ? Math.max(1, Math.ceil(count / pageSize)) : null;
  const showingStart = count ? (page - 1) * pageSize + 1 : 0;
  const showingEnd = count ? Math.min(page * pageSize, count) : 0;

  return (
    <div
      className="card shadow-sm"
      style={{
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '70vh',
        minHeight: 0,
      }}
    >
      <div
        className="card-header d-flex flex-wrap gap-2 align-items-center justify-content-between"
        style={{ flex: '0 0 auto' }}
      >
        <strong className="m-0">Entidades registradas</strong>
        <div className="d-flex gap-2 align-items-center">
          <input
            className="form-control form-control-sm"
            placeholder="Buscar por nombre, responsable, cargo…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ minWidth: 260 }}
          />
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => fetchEntidades({ pageArg: 1, searchArg: debouncedQ })}
          >
            Refrescar
          </button>
        </div>
      </div>

      <div
        className="card-body p-0"
        style={{
          flex: '1 1 auto',
          overflow: 'auto',
          minHeight: 0,
        }}
      >
        {loading ? (
          <div className="p-3 text-muted">Cargando…</div>
        ) : err ? (
          <div className="p-3 text-danger">{err}</div>
        ) : filtered.length === 0 ? (
          <div className="p-3 text-muted">Sin resultados.</div>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0">
              <thead className="table-light">
                <tr>
                  {['Nombre', 'Responsable', 'Cargo', 'Razón social', 'Logo', 'Firma'].map((h) => (
                    <th
                      key={h}
                      style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 2,
                        background: 'var(--bs-light, #f8f9fa)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                  {isLoggedIn() && onEdit && (
                    <th
                      style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 2,
                        background: 'var(--bs-light, #f8f9fa)',
                        width: 1,
                      }}
                    >
                      Acciones
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((ent, idx) => (
                  <tr key={ent.id ?? `${ent.nombre ?? 'row'}-${idx}`}>
                    <td>{ent.nombre ?? '—'}</td>
                    <td>{ent.responsable ?? '—'}</td>
                    <td>{ent.cargo ?? '—'}</td>
                    <td>{ent.razon_social ?? '—'}</td>
                    <td>
                      {ent.logo ? (
                        <img
                          src={resolveMediaUrl(ent.logo)}
                          alt="logo"
                          style={{ height: 40, width: 80, objectFit: 'contain' }}
                        />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {ent.firma ? (
                        <img
                          src={resolveMediaUrl(ent.firma)}
                          alt="firma"
                          style={{ height: 40, width: 80, objectFit: 'contain' }}
                        />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    {isLoggedIn() && onEdit && (
                      <td className="d-flex gap-2">
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => onEdit(ent)}
                        >
                          Editar
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => handleDelete(ent)}
                          title="Eliminar entidad"
                        >
                          Eliminar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer con paginación */}
      <div
        className="card-footer d-flex flex-wrap gap-2 align-items-center justify-content-between"
        style={{ flex: '0 0 auto' }}
      >
        <div className="text-muted small">
          {count ? `Mostrando ${showingStart}–${showingEnd} de ${count}` : '—'}
        </div>
        <div className="d-flex align-items-center gap-2">
          <button
            className="btn btn-sm btn-outline-secondary"
            disabled={!previous && page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ◀ Anterior
          </button>
          <span className="small">
            Página {page}{totalPages ? ` / ${totalPages}` : ''}
          </span>
          <button
            className="btn btn-sm btn-outline-secondary"
            disabled={!next && (totalPages ? page >= totalPages : filtered.length < pageSize)}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente ▶
          </button>
        </div>
      </div>
    </div>
  );
}
