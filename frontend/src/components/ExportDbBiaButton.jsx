// frontend/src/components/ExportDbBiaButton.jsx
import React from 'react';
import axios from 'axios';
import api from '../services/api';
import { useDbBiaExport } from '../hooks/useDbBiaExport';

export default function ExportDbBiaButton({ dni, idPagoUnico }) {
  const {
    job,
    isLoading,
    progressPercent,
    startExport,
    reset,
  } = useDbBiaExport(5000); // poll cada 5 segundos

  const handleClick = () => {
    const filters = {};
    if (dni) filters.dni = dni;
    if (idPagoUnico) filters.id_pago_unico = idPagoUnico;
    startExport(filters);
  };

  const isDisabled =
    isLoading || job.status === 'creating' || job.status === 'running';

  const getLabel = () => {
    if (job.status === 'idle') return 'Descargar base (CSV)';
    if (job.status === 'creating') return 'Creando exportación...';
    if (job.status === 'running') return 'Generando archivo...';
    if (job.status === 'completed') return 'Generar nueva exportación';
    if (job.status === 'failed') return 'Reintentar exportación';
    return 'Descargar base (CSV)';
  };

  // ---- DESCARGA REAL DEL CSV (sin abrir pestañas nuevas) ----
  const handleDownloadCsv = async () => {
    const relativeUrl = job.downloadUrl || job.fileUrl;
    if (!relativeUrl) return;

    try {
      // Base del backend (solo origen, sin path)
      const base = (() => {
        try {
          const baseUrl = api.defaults.baseURL || window.location.origin;
          return new URL(baseUrl).origin; // ej: http://localhost:8000
        } catch {
          return window.location.origin;
        }
      })();

      // Construimos URL absoluta al backend
      const finalUrl = new URL(relativeUrl, base).toString();

      // Tomamos el mismo Authorization que usa el cliente api
      const authHeader = api.defaults.headers.common['Authorization'];

      const response = await axios.get(finalUrl, {
        responseType: 'blob',
        headers: authHeader ? { Authorization: authHeader } : {},
      });

      // Nombre de archivo desde Content-Disposition (si viene)
      let filename = 'db_bia_export.csv';
      const dispo = response.headers['content-disposition'];
      if (dispo) {
        const m = dispo.match(/filename="?([^"]+)"?/i);
        if (m && m[1]) filename = m[1];
      }

      const blob = new Blob([response.data], {
        type: 'text/csv; charset=utf-8;',
      });
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error al descargar el CSV de exportación:', error);
      alert('No se pudo descargar el CSV. Revisá la consola para más detalles.');
    }
  };

  return (
    <div className="d-flex flex-column gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        className="btn btn-sm btn-outline-primary btn-outline-bia w-100"
        title="Generar y descargar la base completa (CSV) desde el servidor"
      >
        {getLabel()}
      </button>

      {/* Estado / progreso / errores */}
      <div className="small text-muted">
        {job.status === 'creating' && (
          <span>Iniciando la exportación, por favor esperá...</span>
        )}

        {job.status === 'running' && (
          <>
            <span>La exportación está en curso en el servidor.</span>
            {progressPercent !== null && job.totalRows ? (
              <div className="mt-1">
                <div
                  className="progress"
                  style={{ height: '6px', maxWidth: '220px' }}
                >
                  <div
                    className="progress-bar"
                    role="progressbar"
                    style={{ width: `${progressPercent}%` }}
                    aria-valuenow={progressPercent}
                    aria-valuemin="0"
                    aria-valuemax="100"
                  />
                </div>
                <div>
                  {progressPercent}% (
                  {job.processedRows != null ? job.processedRows : 0} /{' '}
                  {job.totalRows} filas)
                </div>
              </div>
            ) : (
              <div className="mt-1">Preparando datos...</div>
            )}
          </>
        )}

        {job.status === 'completed' && (job.fileUrl || job.downloadUrl) && (
          <div className="mt-1 d-flex flex-column gap-1">
            <span className="text-success">
              ✔ Exportación lista para descargar.
            </span>
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="btn btn-xs btn-outline-secondary"
            >
              Descargar CSV
            </button>
            <button
              type="button"
              onClick={reset}
              className="btn btn-link p-0 text-decoration-underline text-muted"
              style={{ fontSize: '11px', textAlign: 'left' }}
            >
              Limpiar estado
            </button>
          </div>
        )}

        {job.status === 'failed' && (
          <div className="mt-1 text-danger">
            <div>❌ Error en la exportación.</div>
            {job.errorMessage && (
              <div style={{ fontSize: '11px' }}>{job.errorMessage}</div>
            )}
            <button
              type="button"
              onClick={reset}
              className="btn btn-link p-0 text-decoration-underline text-muted"
              style={{ fontSize: '11px' }}
            >
              Limpiar estado
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
