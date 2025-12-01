// src/components/Descargas.jsx
import React from 'react';
import ExportDbBiaButton from './ExportDbBiaButton';

export default function Descargas() {
  return (
    <div className="container py-3">
      <h2 className="mb-3 text-bia">Centro de descargas</h2>

      <div className="card border-0 rounded-4 shadow-sm mb-4">
        <div className="card-header bg-white border-0">
          <h3 className="h6 m-0">Base de datos completa (CSV)</h3>
        </div>
        <div className="card-body">
          <p className="small text-muted">
            Genera un archivo CSV con todos los registros de la base de datos.
            La exportación se realiza de forma asíncrona en el servidor para
            evitar cortes de conexión.
          </p>

          {/* Botón asíncrono de exportación */}
          <ExportDbBiaButton />

          <p className="small text-muted mt-2 mb-0">
            Podés seguir trabajando mientras se genera el archivo. Una vez
            listo, aparecerá el botón para descargarlo.
          </p>
        </div>
      </div>

      {/* 🔹 Espacio para futuras descargas/filtros */}
      <div className="card border-0 rounded-4 shadow-sm">
        <div className="card-header bg-white border-0">
          <h3 className="h6 m-0">Otras posibles descargas</h3>
        </div>
        <div className="card-body">
          <p className="small text-muted mb-1">
            Se podrían agregar opciones para descargas filtradas o acotadas, tales como:
          </p>
          <ul className="small text-muted mb-0">
            <li>Descargas filtradas por <strong>Propietario</strong>, <strong>Entidad original</strong>, <strong>Entidad interna</strong>, <strong>Grupo</strong>, etc.</li>
            <li>Descargas por rango de fechas (fecha_apertura, fecha_deuda, etc.).</li>
            <li>Descargas acotadas por estado para análisis específicos.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
