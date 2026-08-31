import type { ServerResponse } from 'node:http';
import { createMuxPlaybackToken } from '../../server/mux.js';
import { allowMethods, queryValue, safeErrorMessage, sendJson, type ApiRequest } from '../../server/http.js';
import { getSupabaseAdmin, requireStaff } from '../../server/supabase-admin.js';

export default async function handler(request: ApiRequest, response: ServerResponse) {
  if (!allowMethods(request, response, ['GET'])) return;
  try {
    const propertyId = queryValue(request, 'property_id');
    if (!propertyId) return sendJson(response, 400, { error: 'Falta la propiedad.' });
    const result = await getSupabaseAdmin().from('properties')
      .select('mux_playback_id, published, status, video_provider, video_status')
      .eq('id', propertyId).maybeSingle();
    const property = result.data;
    if (result.error || !property) {
      return sendJson(response, 404, { error: 'La propiedad no está disponible.' });
    }
    const publiclyVisible = property.published && ['available', 'reserved', 'sold', 'rented'].includes(String(property.status));
    if (!publiclyVisible) await requireStaff(request);
    if (property.video_provider !== 'mux' || property.video_status !== 'ready' || !property.mux_playback_id) {
      return sendJson(response, 404, { error: 'El video no está disponible.' });
    }
    const signed = createMuxPlaybackToken(String(property.mux_playback_id));
    response.setHeader('Cache-Control', 'private, no-store');
    sendJson(response, 200, signed);
  } catch (reason) {
    sendJson(response, 500, { error: safeErrorMessage(reason, 'No se pudo autorizar la reproducción.') });
  }
}
