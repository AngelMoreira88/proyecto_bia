import React, { useEffect, useState } from "react";
import axios from "axios";

export default function EntidadList({ onEdit }) {
  const [entidades, setEntidades] = useState([]);

  useEffect(() => {
    axios.get("/api/entidades/").then((res) => setEntidades(res.data));
  }, []);

  return (
    <div>
      <h3>Entidades registradas</h3>
      <ul>
        {entidades.map((ent) => (
          <li key={ent.id}>
            <strong>{ent.nombre}</strong> — {ent.responsable} ({ent.cargo})
            <button onClick={() => onEdit(ent)}>Editar</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
