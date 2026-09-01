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
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)?.split(',')[0]?.trim() ?? request.headers.host;
  if (requestOrigin.protocol !== 'https:' || (requestOrigin.host !== host && requestOrigin.origin !== configuredOrigin)) {
    throw Object.assign(new Error('Origen de subida no autorizado.'), { statusCode: 403 });
  }
  return requestOrigin.origin;
}

export default async function handler(request: ApiRequest, response: ServerResponse) {
  if (!allowMethods(request, response, ['POST'])) return;
  let jobId: string | undefined;
  try {
    const user = await requireStaff(request);
    const body = await readJsonBody<RequestBody>(request);
    const propertyId = body.property_id?.trim();
    const filename = body.filename?.trim() ?? '';
    const size = Number(body.size);
    if (!propertyId || !/^[0-9a-f-]{36}$/i.test(propertyId)) return sendJson(response, 400, { error: 'La propiedad no es válida.' });
    if (!/\.(mp4|mov)$/i.test(filename)) return sendJson(response, 400, { error: 'Solo puedes subir videos MP4 o MOV.' });
    if (!Number.isSafeInteger(size) || size <= VIDEO_MAX_SIZE_BYTES) return sendJson(response, 400, { error: 'Este endpoint está reservado para videos mayores de 50 MB.' });

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

    const upload = await createMuxDirectUpload(jobId, user.id, getUploadOrigin(request));
    const linked = await supabase.from('property_video_jobs').update({ mux_upload_id: upload.id }).eq('id', jobId);
    if (linked.error) {
      await supabase.from('property_video_jobs').update({ status: 'error', error_code: 'job_link_failed' }).eq('id', jobId);
      throw linked.error;
    }

    console.info('Mux direct upload created', { jobId, propertyId, muxUploadId: upload.id });
    sendJson(response, 201, { upload_url: upload.url, job_id: jobId, mux_upload_id: upload.id });
  } catch (reason) {
    if (jobId) await getSupabaseAdmin().from('property_video_jobs').update({ status: 'error', error_code: 'direct_upload_failed' }).eq('id', jobId);
    const status = statusFromError(reason);
    console.error('Mux direct upload failed', { jobId, status, reason: reason instanceof Error ? reason.message : String(reason) });
    const error = status === 401
      ? 'Tu sesión expiró. Inicia sesión nuevamente.'
      : status === 403
        ? 'No tienes permisos para subir este video.'
        : safeErrorMessage(reason, 'No se pudo preparar la subida del video. Inténtalo nuevamente.');
    sendJson(response, status, { error });
  }
}
