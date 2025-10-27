import { useEffect, useMemo, useState } from 'react';
import { listarEntidades, eliminarEntidad } from '../../services/api';

export default function EntidadList({ onEdit, refreshKey = 0 }) {
  const [rows, setRows]     = useState([]);
  const [count, setCount]   = useState(0);
  const [page, setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((count || 0) / (pageSize || 10))),
    [count, pageSize]
  );

  // normalizador para búsqueda (sin acentos, minúsculas)
  const norm = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  async function fetchData() {
    try {
      setLoading(true);
      setErr('');

      const q = (search || '').trim();

      // Si hay búsqueda, pedimos muchos resultados y paginamos localmente
      const effectivePage     = q ? 1 : page;
      const effectivePageSize = q ? 1000 : pageSize;

      const { data } = await listarEntidades({
        search: q || undefined,
        page: effectivePage,
        page_size: effectivePageSize,
      });

      // Normalizamos la forma del payload (soporta results o array plano)
      const sourceRows = Array.isArray(data)
        ? data
        : (data?.results ?? []);

      if (q) {
        // Filtro en front: busca en nombre, responsable, cargo, razón social
        const tokens = norm(q).split(/\s+/).filter(Boolean);
        const matches = (r) => {
          const hay = norm(
            [r?.nombre, r?.responsable, r?.cargo, r?.razon_social].join(' ')
          );
          return tokens.every(t => hay.includes(t));
        };
        const filtered = sourceRows.filter(matches);

        // Paginación local sobre el resultado filtrado
        const start = (page - 1) * pageSize;
        const paged = filtered.slice(start, start + pageSize);

        setRows(paged);
        setCount(filtered.length);
      } else {
        // Sin búsqueda: usamos lo que devuelva el backend
        setRows(sourceRows);
        setCount(
          typeof data?.count === 'number'
            ? data.count
            : sourceRows.length
        );
      }
    } catch (e) {
      console.error('Error listando entidades:', e);
      setErr('No se pudo cargar el listado de entidades.');
    } finally {
      setLoading(false);
    }
  }

  // fetch inicial y cuando cambian page/pageSize/refreshKey
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, refreshKey]);

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

  const handleDelete = async (id) => {
    const ok = window.confirm('¿Eliminar esta entidad? Esta acción no se puede deshacer.');
    if (!ok) return;
    try {
      await eliminarEntidad(id);
      const nextCount = Math.max(0, count - 1);
      const nextTotalPages = Math.max(1, Math.ceil(nextCount / pageSize));
      if (page > nextTotalPages) setPage(nextTotalPages);
      fetchData();
    } catch (e) {
      console.error('Error eliminando entidad:', e);
      alert('No se pudo eliminar la entidad.');
    }
  };

  return (
    <div className="card shadow-sm border-0 rounded-4">
      <div className="card-header">
        <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center">
          <strong>Entidades registradas</strong>
          <form className="d-flex gap-2" onSubmit={submitSearch}>
            <input
              className="form-control"
              placeholder="Buscá por Nombre, Responsable, Cargo o Razon Social..."
              title="Buscá por Nombre, Responsable, Cargo o Razón Social"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ minWidth: 380, width: 'clamp(320px, 40vw, 640px)' }}
            />
            <button className="btn btn-outline-secondary" type="submit" disabled={loading}>
              Buscar
            </button>
          </form>
        </div>
      </div>

      <div className="card-body p-0">
        {err && (
          <div className="alert alert-danger m-3" role="alert">
            {err}
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table className="table table-hover align-middle m-0">
            <thead className="table-light">
              <tr>
                <th style={{ width: 44 }}></th>
                <th>Nombre</th>
                <th>Responsable</th>
                <th>Cargo</th>
                <th>Razón social</th>
                <th>Logo</th>
                <th>Firma</th>
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
                    No hay entidades para mostrar.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const logoURL  = r.logo_url  || (typeof r.logo  === 'string' ? r.logo  : null);
                  const firmaURL = r.firma_url || (typeof r.firma === 'string' ? r.firma : null);
                  return (
                    <tr key={r.id ?? i}>
                      <td className="text-muted small">{(page - 1) * pageSize + i + 1}</td>
                      <td>{r.nombre}</td>
                      <td>{r.responsable}</td>
                      <td>{r.cargo}</td>
                      <td>{r.razon_social}</td>
                      <td>
                        {logoURL ? (
                          <img
                            src={logoURL}
                            alt="logo"
                            style={{ height: 28, width: 'auto', objectFit: 'contain', background: '#fff', border: '1px dashed #ccc', padding: 2 }}
                          />
                        ) : <span className="text-muted small">—</span>}
                      </td>
                      <td>
                        {firmaURL ? (
                          <img
                            src={firmaURL}
                            alt="firma"
                            style={{ height: 28, width: 'auto', objectFit: 'contain', background: '#fff', border: '1px dashed #ccc', padding: 2 }}
                          />
                        ) : <span className="text-muted small">—</span>}
                      </td>
                      <td className="text-end">
                        <div className="btn-group btn-group-sm">
                          <button
                            type="button"
                            className="btn btn-outline-primary"
                            title="Editar"
                            onClick={() => onEdit && onEdit(r)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-danger"
                            title="Eliminar"
                            onClick={() => handleDelete(r.id)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación */}
      <div className="card-footer d-flex flex-wrap gap-2 justify-content-between align-items-center">
        <div className="text-muted small">
          {count} registro{count === 1 ? '' : 's'} · Página {page} de {totalPages}
        </div>
        <div className="d-flex align-items-center gap-2">
          <select
            className="form-select form-select-sm"
            style={{ width: 110 }}
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
          >
            {[10, 20, 50].map(n => <option key={n} value={n}>{n} / pág.</option>)}
          </select>
          <div className="btn-group btn-group-sm">
            <button
              className="btn btn-outline-secondary"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              ‹ Anterior
            </button>
            <button
              className="btn btn-outline-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              Siguiente ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
