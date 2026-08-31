import type { ServerResponse } from 'node:http';
import { allowMethods, readJsonBody, safeErrorMessage, sendJson, type ApiRequest } from '../../server/http.js';
import { createMuxDirectUpload } from '../../server/mux.js';
import { getSupabaseAdmin, requireStaff, statusFromError } from '../../server/supabase-admin.js';

type RequestBody = { property_id?: string; filename?: string; size?: number };
const VIDEO_MAX_SIZE_BYTES = 50 * 1024 * 1024;

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

    const upload = await createMuxDirectUpload(jobId, user.id);
    const linked = await supabase.from('property_video_jobs').update({ mux_upload_id: upload.id }).eq('id', jobId);
    if (linked.error) {
      await supabase.from('property_video_jobs').update({ status: 'error', error_code: 'job_link_failed' }).eq('id', jobId);
      throw linked.error;
    }

    sendJson(response, 201, { upload_url: upload.url, job_id: jobId, mux_upload_id: upload.id });
  } catch (reason) {
    if (jobId) await getSupabaseAdmin().from('property_video_jobs').update({ status: 'error', error_code: 'direct_upload_failed' }).eq('id', jobId);
    sendJson(response, statusFromError(reason), { error: safeErrorMessage(reason, 'No se pudo preparar la subida del video.') });
  }
}
