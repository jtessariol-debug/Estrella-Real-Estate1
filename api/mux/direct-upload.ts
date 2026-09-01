import type { ServerResponse } from 'node:http';
import { allowMethods, readJsonBody, requiredEnv, safeErrorMessage, sendJson, type ApiRequest } from '../../server/http.js';
import { createMuxDirectUpload } from '../../server/mux.js';
import { getSupabaseAdmin, requireStaff, statusFromError } from '../../server/supabase-admin.js';

type RequestBody = { property_id?: string; filename?: string; size?: number };
const VIDEO_MAX_SIZE_BYTES = 50 * 1024 * 1024;
const PUBLIC_UPLOAD_ORIGINS = [
  'https://www.estrellarealestate.site',
  'https://estrellarealestate.site',
  'https://estrella-real-estate1.vercel.app',
];

function normalizedOrigin(value?: string): string | undefined {
  if (!value) return undefined;
  try { return new URL(value).origin; }
  catch { return undefined; }
}

function allowedUploadOrigins(): Set<string> {
  const configured = normalizedOrigin(requiredEnv('APP_ORIGIN'));
  const vercelProduction = normalizedOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);
  return new Set([...PUBLIC_UPLOAD_ORIGINS, configured, vercelProduction].filter((value): value is string => Boolean(value)));
}

function getUploadOrigin(request: ApiRequest): string {
  const header = Array.isArray(request.headers.origin) ? request.headers.origin[0] : request.headers.origin;
  if (!header) throw Object.assign(new Error('La solicitud no incluye un origen válido.'), { statusCode: 400, code: 'origin_missing' });
  const requestOrigin = normalizedOrigin(header);
  if (!requestOrigin) throw Object.assign(new Error('El origen de la solicitud no es válido.'), { statusCode: 400, code: 'origin_invalid' });
  if (!allowedUploadOrigins().has(requestOrigin)) {
    throw Object.assign(new Error('El origen de la solicitud no está permitido.'), { statusCode: 400, code: 'origin_denied' });
  }
  return requestOrigin;
}

function reasonCode(reason: unknown): string | undefined {
  return reason && typeof reason === 'object' && 'code' in reason ? String((reason as { code?: unknown }).code) : undefined;
}

type DirectUploadErrorReason =
  | 'session_invalid'
  | 'profile_missing'
  | 'role_denied'
  | 'origin_denied'
  | 'profile_lookup_failed'
  | 'internal_error';

function errorResponse(reason: unknown, status: number): { error: string; code: string; reason: DirectUploadErrorReason } {
  const code = reasonCode(reason) ?? 'direct_upload_failed';
  if (status === 401) return { error: 'Tu sesión expiró. Inicia sesión nuevamente.', code, reason: 'session_invalid' };
  if (code === 'profile_missing') return { error: 'Tu cuenta no tiene un perfil administrativo.', code, reason: 'profile_missing' };
  if (code === 'role_denied') return { error: 'No tienes permisos para administrar videos.', code, reason: 'role_denied' };
  if (code === 'origin_missing' || code === 'origin_invalid' || code === 'origin_denied') {
    return { error: 'Esta página no está autorizada para iniciar la subida del video.', code, reason: 'origin_denied' };
  }
  if (code === 'profile_lookup_failed') {
    return { error: 'No se pudo verificar tu acceso. Intenta nuevamente.', code, reason: 'profile_lookup_failed' };
  }
  return {
    error: safeErrorMessage(reason, 'No se pudo preparar la subida del video. Inténtalo nuevamente.'),
    code,
    reason: 'internal_error',
  };
}

export default async function handler(request: ApiRequest, response: ServerResponse) {
  if (!allowMethods(request, response, ['POST'])) return;
  let jobId: string | undefined;
  const traceHeader = Array.isArray(request.headers['x-mux-trace-id']) ? request.headers['x-mux-trace-id'][0] : request.headers['x-mux-trace-id'];
  const traceId = traceHeader && /^[a-z0-9-]{8,80}$/i.test(traceHeader) ? traceHeader : 'untracked';
  try {
    const origin = Array.isArray(request.headers.origin) ? request.headers.origin[0] : request.headers.origin;
    const forwardedHost = Array.isArray(request.headers['x-forwarded-host']) ? request.headers['x-forwarded-host'][0] : request.headers['x-forwarded-host'];
    console.info('[MUX DIRECT UPLOAD]', {
      traceId,
      stage: 'request.received',
      status: 'started',
      origin,
      host: request.headers.host,
      forwardedHost,
      appOrigin: normalizedOrigin(process.env.APP_ORIGIN),
    });
    const user = await requireStaff(request, '/api/mux/direct-upload', traceId);
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
    sendJson(response, status, errorResponse(reason, status));
  }
}
