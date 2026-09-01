import type { ServerResponse } from 'node:http';
import { allowMethods, readJsonBody, requiredEnv, safeErrorMessage, sendJson, type ApiRequest } from '../../server/http.js';
import { createMuxDirectUpload } from '../../server/mux.js';
import { getSupabaseAdmin, requireStaff, statusFromError } from '../../server/supabase-admin.js';

type RequestBody = { property_id?: string; filename?: string; size?: number };
const VIDEO_MAX_SIZE_BYTES = 50 * 1024 * 1024;

function getUploadOrigin(request: ApiRequest): string {
  const configuredOrigin = new URL(requiredEnv('APP_ORIGIN')).origin;
  const header = Array.isArray(request.headers.origin) ? request.headers.origin[0] : request.headers.origin;
  if (!header) return configuredOrigin;

  let requestOrigin: URL;
  try { requestOrigin = new URL(header); }
  catch { throw Object.assign(new Error('Origen de subida inválido.'), { statusCode: 403 }); }

  const forwardedHost = request.headers['x-forwarded-host'];
  const forwardedHosts = (Array.isArray(forwardedHost) ? forwardedHost : [forwardedHost])
    .flatMap((value) => value?.split(',') ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
  const requestHosts = new Set([request.headers.host, ...forwardedHosts].filter((value): value is string => Boolean(value)));
  if (requestOrigin.protocol !== 'https:' || (!requestHosts.has(requestOrigin.host) && requestOrigin.origin !== configuredOrigin)) {
    throw Object.assign(new Error('Origen de subida no autorizado.'), { statusCode: 403, code: 'upload_origin_forbidden' });
  }
  return requestOrigin.origin;
}

function reasonCode(reason: unknown): string | undefined {
  return reason && typeof reason === 'object' && 'code' in reason ? String((reason as { code?: unknown }).code) : undefined;
}

export default async function handler(request: ApiRequest, response: ServerResponse) {
  if (!allowMethods(request, response, ['POST'])) return;
  let jobId: string | undefined;
  const traceHeader = Array.isArray(request.headers['x-mux-trace-id']) ? request.headers['x-mux-trace-id'][0] : request.headers['x-mux-trace-id'];
  const traceId = traceHeader && /^[a-z0-9-]{8,80}$/i.test(traceHeader) ? traceHeader : 'untracked';
  try {
    console.info('[MUX DIRECT UPLOAD]', { traceId, stage: 'request.received', status: 'started' });
    const user = await requireStaff(request, '/api/mux/direct-upload');
    console.info('[MUX DIRECT UPLOAD]', { traceId, stage: 'request.authenticated', status: 'ok' });
    const body = await readJsonBody<RequestBody>(request);
    const propertyId = body.property_id?.trim();
    const filename = body.filename?.trim() ?? '';
    const size = Number(body.size);
    if (!propertyId || !/^[0-9a-f-]{36}$/i.test(propertyId)) return sendJson(response, 400, { error: 'La propiedad no es válida.' });
    if (!/\.(mp4|mov)$/i.test(filename)) return sendJson(response, 400, { error: 'Solo puedes subir videos MP4 o MOV.' });
    if (!Number.isSafeInteger(size) || size <= VIDEO_MAX_SIZE_BYTES) return sendJson(response, 400, { error: 'Este endpoint está reservado para videos mayores de 50 MB.' });
    const uploadOrigin = getUploadOrigin(request);

    const supabase = getSupabaseAdmin();
    const property = await supabase.from('properties').select('id').eq('id', propertyId).maybeSingle();
    if (property.error || !property.data) return sendJson(response, 404, { error: 'La propiedad no existe.' });

    const inserted = await supabase.from('property_video_jobs').insert({
      property_id: propertyId,
      user_id: user.id,
      original_filename: filename,
      original_size: size,
      status: 'selected',
      progress: 0,
    }).select('id').single();
    if (inserted.error) throw inserted.error;
    jobId = String(inserted.data.id);
    console.info('[MUX DIRECT UPLOAD]', { traceId, stage: 'job.inserted', status: 'ok', jobId, propertyId });

    const upload = await createMuxDirectUpload(jobId, user.id, uploadOrigin);
    console.info('[MUX DIRECT UPLOAD]', { traceId, stage: 'mux-upload.created', status: 'ok', jobId, muxUploadId: upload.id });
    const linked = await supabase.from('property_video_jobs').update({ mux_upload_id: upload.id }).eq('id', jobId);
    if (linked.error) {
      await supabase.from('property_video_jobs').update({ status: 'error', error_code: 'job_link_failed' }).eq('id', jobId);
      throw linked.error;
    }

    console.info('[MUX DIRECT UPLOAD]', { traceId, stage: 'response.sent', status: 201, jobId, muxUploadId: upload.id, uploadUrlReturned: Boolean(upload.url) });
    sendJson(response, 201, { upload_url: upload.url, job_id: jobId, mux_upload_id: upload.id });
  } catch (reason) {
    if (jobId) await getSupabaseAdmin().from('property_video_jobs').update({ status: 'error', error_code: 'direct_upload_failed' }).eq('id', jobId);
    const status = statusFromError(reason);
    const code = reasonCode(reason);
    console.error('[MUX DIRECT UPLOAD]', { traceId, stage: 'request.failed', jobId, status, code, reason: reason instanceof Error ? reason.message : String(reason) });
    const error = status === 401
      ? 'Tu sesión expiró. Inicia sesión nuevamente.'
      : code === 'access_verification_failed'
        ? 'No se pudo verificar tu acceso. Intenta nuevamente.'
        : status === 403
          ? 'No tienes permisos para administrar videos.'
        : safeErrorMessage(reason, 'No se pudo preparar la subida del video. Inténtalo nuevamente.');
    sendJson(response, status, { error });
  }
}
