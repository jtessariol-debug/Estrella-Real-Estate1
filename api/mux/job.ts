import type { ServerResponse } from 'node:http';
import { allowMethods, queryValue, safeErrorMessage, sendJson, type ApiRequest } from '../../server/http.js';
import { cancelMuxUpload, deleteMuxAsset } from '../../server/mux.js';
import { getSupabaseAdmin, requireStaff, statusFromError } from '../../server/supabase-admin.js';

export default async function handler(request: ApiRequest, response: ServerResponse) {
  if (!allowMethods(request, response, ['DELETE'])) return;
  try {
    const user = await requireStaff(request);
    const jobId = queryValue(request, 'job_id');
    if (!jobId) return sendJson(response, 400, { error: 'Falta el identificador de la subida.' });
    const supabase = getSupabaseAdmin();
    const result = await supabase.from('property_video_jobs')
      .select('id, status, mux_upload_id, mux_asset_id')
      .eq('id', jobId).eq('user_id', user.id).maybeSingle();
    if (result.error || !result.data) return sendJson(response, 404, { error: 'La subida no existe o no te pertenece.' });
    const claimed = await supabase.from('property_video_jobs')
      .update({ status: 'cancelled', error_code: null })
      .eq('id', jobId).eq('user_id', user.id)
      .in('status', ['selected', 'uploading', 'processing'])
      .select('id').maybeSingle();
    if (claimed.error) throw claimed.error;
    if (!claimed.data) return sendJson(response, 409, { error: 'El video ya terminó o fue cancelado.' });
    await cancelMuxUpload(result.data.mux_upload_id);
    await deleteMuxAsset(result.data.mux_asset_id);
    sendJson(response, 200, { cancelled: true });
  } catch (reason) {
    sendJson(response, statusFromError(reason), { error: safeErrorMessage(reason, 'No se pudo cancelar la subida.') });
  }
}
