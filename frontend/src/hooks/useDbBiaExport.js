// frontend/src/hooks/useDbBiaExport.js
import { useCallback, useEffect, useRef, useState } from 'react';
import { createExportJob, getExportJob } from '../services/dbBiaExport';

/**
 * Maneja el flujo completo de exportación asíncrona de db_bia:
 * - startExport(filters)
 * - polling automático
 * - estados internos: idle/creating/running/completed/failed
 * - progreso (processedRows / totalRows) si el backend lo expone
 *
 * Backend actual:
 *  - createExportJob  → GET /api/carga-datos/export/crear-job/
 *  - getExportJob     → GET /api/carga-datos/export/job-status/?job_id=...
 *
 * Donde `estado` suele ser: PENDIENTE / EN_PROCESO / COMPLETADO / ERROR
 */
export function useDbBiaExport(pollIntervalMs = 5000) {
  const [job, setJob] = useState({
    job_id: null,
    status: 'idle', // 'idle' | 'creating' | 'running' | 'completed' | 'failed'
    backendEstado: null, // texto tal cual viene del backend (COMPLETADO, ERROR, etc.)
    fileUrl: null,       // compat: file_url o download_url
    downloadUrl: null,   // download_url explícito
    fileName: null,
    totalRows: null,
    processedRows: null,
    errorMessage: null,
  });

  const [isPolling, setIsPolling] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastFilters, setLastFilters] = useState(null);
  const intervalRef = useRef(null);

  // ---------- helpers polling ----------
  const stopPolling = useCallback(() => {
    setIsPolling(false);
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const mapBackendEstadoToStatus = (estado) => {
    const e = (estado || '').toString().toUpperCase();

    if (['COMPLETADO', 'DONE', 'FINISHED', 'OK'].includes(e)) {
      return 'completed';
    }
    if (['ERROR', 'FAILED', 'FALLIDO'].includes(e)) {
      return 'failed';
    }
    if (['PENDIENTE', 'EN_PROCESO', 'RUNNING'].includes(e)) {
      return 'running';
    }
    // fallback
    return 'running';
  };

  const startPolling = useCallback(
    (jobId) => {
      if (!jobId) return;

      // limpiar intervalo previo si hubiera
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
      }

      setIsPolling(true);

      intervalRef.current = window.setInterval(async () => {
        try {
          const data = await getExportJob(jobId);
          const backendEstado = data.estado || data.status || 'EN_PROCESO';
          const mappedStatus = mapBackendEstadoToStatus(backendEstado);

          setJob((prev) => ({
            ...prev,
            job_id: data.job_id ?? jobId,
            status: mappedStatus,
            backendEstado,
            // compat: algunos backends exponen file_url; el nuevo usa download_url
            fileUrl: data.file_url || data.download_url || null,
            downloadUrl: data.download_url || null,
            fileName: data.file_name || null,
            totalRows:
              typeof data.total_rows === 'number' ? data.total_rows : null,
            processedRows:
              typeof data.processed_rows === 'number'
                ? data.processed_rows
                : null,
            errorMessage: data.error_message || null,
          }));

          if (mappedStatus === 'completed' || mappedStatus === 'failed') {
            stopPolling();
          }
        } catch (error) {
          console.error('Error al consultar export job:', error);
          setJob((prev) => ({
            ...prev,
            status: 'failed',
            errorMessage:
              'Error al consultar el estado de la exportación. Intentá nuevamente.',
          }));
          stopPolling();
        }
      }, pollIntervalMs);
    },
    [pollIntervalMs, stopPolling]
  );

  // ---------- iniciar export ----------
  const startExport = useCallback(
    async (filters = {}) => {
      setIsLoading(true);
      setLastFilters(filters);
      try {
        // estado inicial: creando
        setJob({
          job_id: null,
          status: 'creating',
          backendEstado: null,
          fileUrl: null,
          downloadUrl: null,
          fileName: null,
          totalRows: null,
          processedRows: null,
          errorMessage: null,
        });

        const data = await createExportJob(filters);

        const jobId = data.job_id;
        const backendEstado = data.estado || data.status || 'PENDIENTE';
        const mappedStatus = mapBackendEstadoToStatus(backendEstado);

        // tras crear el job lo consideramos "running" (aunque el backend diga PENDIENTE)
        setJob((prev) => ({
          ...prev,
          job_id: jobId,
          status: mappedStatus || 'running',
          backendEstado,
          fileUrl: data.file_url || data.download_url || null,
          downloadUrl: data.download_url || null,
          fileName: data.file_name || null,
          totalRows:
            typeof data.total_rows === 'number' ? data.total_rows : null,
          processedRows:
            typeof data.processed_rows === 'number'
              ? data.processed_rows
              : null,
          errorMessage: data.error_message || null,
        }));

        // arrancar polling si el job existe
        if (jobId) {
          startPolling(jobId);
        } else {
          // si por alguna razón no hay job_id, marcamos error
          setJob((prev) => ({
            ...prev,
            status: 'failed',
            errorMessage:
              'El servidor no devolvió un identificador de exportación (job_id).',
          }));
        }
      } catch (error) {
        console.error('Error al crear export job:', error);
        const detail =
          error?.response?.data?.detail ||
          error?.response?.data?.error ||
          'No se pudo iniciar la exportación. Intentá nuevamente.';
        setJob({
          job_id: null,
          status: 'failed',
          backendEstado: null,
          fileUrl: null,
          downloadUrl: null,
          fileName: null,
          totalRows: null,
          processedRows: null,
          errorMessage: detail,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [startPolling]
  );

  // ---------- reset ----------
  const reset = useCallback(() => {
    stopPolling();
    setJob({
      job_id: null,
      status: 'idle',
      backendEstado: null,
      fileUrl: null,
      downloadUrl: null,
      fileName: null,
      totalRows: null,
      processedRows: null,
      errorMessage: null,
    });
    setLastFilters(null);
  }, [stopPolling]);

  // limpiar intervalo al desmontar
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  const progressPercent =
    job.totalRows && job.totalRows > 0 && job.processedRows != null
      ? Math.min(100, Math.round((job.processedRows / job.totalRows) * 100))
      : null;

  return {
    job,
    isLoading,
    isPolling,
    progressPercent,
    lastFilters,
    startExport,
    reset,
  };
}
