import type { ServerResponse } from 'node:http';
import { allowMethods, readJsonBody, safeErrorMessage, sendJson, type ApiRequest } from '../../server/http.js';
import { deleteMuxAsset } from '../../server/mux.js';
import { getSupabaseAdmin, requireStaff, statusFromError } from '../../server/supabase-admin.js';

type RequestBody = { property_id?: string; asset_id?: string };

export default async function handler(request: ApiRequest, response: ServerResponse) {
  if (!allowMethods(request, response, ['POST'])) return;
  try {
    await requireStaff(request);
    const body = await readJsonBody<RequestBody>(request);
    if (!body.property_id || !body.asset_id) return sendJson(response, 400, { error: 'Faltan datos del video anterior.' });
    const supabase = getSupabaseAdmin();
    const job = await supabase.from('property_video_jobs').select('id').eq('property_id', body.property_id).eq('mux_asset_id', body.asset_id).maybeSingle();
    if (job.error || !job.data) return sendJson(response, 403, { error: 'El asset no pertenece a esta propiedad.' });
    const property = await supabase.from('properties').select('mux_asset_id').eq('id', body.property_id).maybeSingle();
    if (property.error || !property.data) return sendJson(response, 404, { error: 'La propiedad no existe.' });
    if (property.data.mux_asset_id === body.asset_id) return sendJson(response, 409, { error: 'No se puede eliminar el video activo.' });
    await deleteMuxAsset(body.asset_id);
    sendJson(response, 200, { deleted: true });
  } catch (reason) {
    sendJson(response, statusFromError(reason), { error: safeErrorMessage(reason, 'No se pudo limpiar el video anterior de Mux.') });
  }
}
