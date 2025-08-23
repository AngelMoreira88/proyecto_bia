// frontend/src/components/EntidadDashboard/EntidadList.jsx
import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { isLoggedIn } from '../../services/auth';

export default function EntidadList({ onEdit }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Normaliza cualquier payload a un array de entidades
  const normalizeList = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.results)) return payload.results;
    if (payload && Array.isArray(payload.items)) return payload.items;
    return [];
    // si tu backend usa otra clave, agregala arriba
  };

  const fetchEntidades = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/entidades/', { params: { page: 1 } }); // page opcional
      setItems(normalizeList(res.data));
      setErr(null);
    } catch (e) {
      console.error('Error cargando entidades', e);
      setItems([]);
      setErr('No se pudo cargar el listado de entidades');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntidades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const list = Array.isArray(items) ? items : normalizeList(items);
    const term = String(q || '').toLowerCase().trim();
    if (!term) return list;
    const hay = (s) => (s ?? '').toString().toLowerCase();
    return list.filter((e) =>
      hay(e.nombre).includes(term) ||
      hay(e.responsable).includes(term) ||
      hay(e.cargo).includes(term) ||
      hay(e.razon_social).includes(term)
    );
  }, [items, q]);

  return (
    // ⬇️ La card se vuelve un contenedor flex vertical con altura limitada
    <div
      className="card shadow-sm"
      style={{
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '70vh',   // ajustá a gusto
        minHeight: 0,        // IMPORTANTE para que el hijo pueda scrollear
      }}
    >
      <div
        className="card-header d-flex flex-wrap gap-2 align-items-center justify-content-between"
        // El header ocupa su altura y NO scrollea
        style={{ flex: '0 0 auto' }}
      >
        <strong className="m-0">Entidades registradas</strong>
        <div className="d-flex gap-2">
          <input
            className="form-control form-control-sm"
            placeholder="Buscar por nombre, responsable, cargo…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ minWidth: 260 }}
          />
          <button className="btn btn-sm btn-outline-secondary" onClick={fetchEntidades}>
            Refrescar
          </button>
        </div>
      </div>

      {/* ⬇️ Este contenedor es el que scrollea */}
      <div
        className="card-body p-0"
        style={{
          flex: '1 1 auto',
          overflow: 'auto',  // hace scroll vertical
          minHeight: 0,      // clave en flexbox
        }}
      >
        {loading ? (
          <div className="p-3 text-muted">Cargando…</div>
        ) : err ? (
          <div className="p-3 text-danger">{err}</div>
        ) : filtered.length === 0 ? (
          <div className="p-3 text-muted">Sin resultados.</div>
        ) : (
          // table-responsive mantiene el scroll horizontal en mobile
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0">
              <thead className="table-light">
                <tr>
                  {/* Encabezados sticky para que queden fijos arriba */}
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
                  <tr key={ent.id ?? ent.nombre ?? idx}>
                    <td>{ent.nombre ?? '—'}</td>
                    <td>{ent.responsable ?? '—'}</td>
                    <td>{ent.cargo ?? '—'}</td>
                    <td>{ent.razon_social ?? '—'}</td>
                    <td>
                      {ent.logo ? (
                        <img
                          src={ent.logo}
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
                          src={ent.firma}
                          alt="firma"
                          style={{ height: 40, width: 80, objectFit: 'contain' }}
                        />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    {isLoggedIn() && onEdit && (
                      <td>
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => onEdit(ent)}
                        >
                          Editar
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
    </div>
  );
}
