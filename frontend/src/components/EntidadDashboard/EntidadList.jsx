import { useEffect, useState } from 'react';
import axios from 'axios';
import { isLoggedIn } from '../../services/auth';

export default function EntidadList({ onEdit }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const fetchEntidades = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/entidades/');
      setItems(res.data);
      setErr(null);
    } catch (e) {
      setErr('No se pudo cargar el listado de entidades');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntidades();
  }, []);

  const filtered = items.filter((e) => {
    const hay = (s) => (s || '').toString().toLowerCase();
    const term = hay(q);
    return (
      hay(e.nombre).includes(term) ||
      hay(e.responsable).includes(term) ||
      hay(e.cargo).includes(term) ||
      hay(e.razon_social).includes(term)
    );
  });

  return (
    <div className="card shadow-sm">
      <div className="card-header d-flex flex-wrap gap-2 align-items-center justify-content-between">
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

      <div className="card-body p-0">
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
                  <th>Nombre</th>
                  <th>Responsable</th>
                  <th>Cargo</th>
                  <th>Razón social</th>
                  <th>Logo</th>
                  <th>Firma</th>
                  {isLoggedIn() && onEdit && <th style={{width: 1}}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id}>
                    <td>{e.nombre}</td>
                    <td>{e.responsable}</td>
                    <td>{e.cargo}</td>
                    <td>{e.razon_social}</td>
                    <td>
                      {e.logo ? (
                        <img src={e.logo} alt="logo" style={{ height: 40, objectFit: 'contain' }} />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {e.firma ? (
                        <img src={e.firma} alt="firma" style={{ height: 40, objectFit: 'contain' }} />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    {isLoggedIn() && onEdit && (
                      <td>
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => onEdit(e)}
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
