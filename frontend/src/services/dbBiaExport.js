import api from './api';

// Crea job → GET /carga-datos/export/crear-job/?dni=...&id_pago_unico=...
export function createExportJob(filters = {}) {
  return api
    .post('/api/carga-datos/export/crear-job/', filters)
    .then((res) => res.data);
}

// Consulta estado → GET /api/carga-datos/export/job-status/?job_id=...
export function getExportJob(jobId) {
  return api
  .get('/api/carga-datos/export/job-status/', { params: { job_id: jobId } })
  .then((res) => res.data);
}
