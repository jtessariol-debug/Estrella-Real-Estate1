import type { ServerResponse } from 'node:http';
import { allowMethods, readJsonBody, safeErrorMessage, sendJson, type ApiRequest } from '../../server/http.js';
import { cancelMuxUpload, deleteMuxAsset } from '../../server/mux.js';
import { getSupabaseAdmin, requireStaff, statusFromError } from '../../server/supabase-admin.js';

type RequestBody = { property_id?: string };

export default async function handler(request: ApiRequest, response: ServerResponse) {
  if (!allowMethods(request, response, ['POST'])) return;
  try {
    await requireStaff(request);
    const { property_id: propertyId } = await readJsonBody<RequestBody>(request);
    if (!propertyId) return sendJson(response, 400, { error: 'Falta la propiedad.' });
    const supabase = getSupabaseAdmin();
    const result = await supabase.from('properties')
      .select('video_provider, video_storage_path, mux_asset_id, mux_playback_id, video_status, video_aspect_ratio')
      .eq('id', propertyId).maybeSingle();
    if (result.error || !result.data) return sendJson(response, 404, { error: 'La propiedad no existe.' });
    const previous = result.data;
    const pendingJobs = await supabase.from('property_video_jobs')
      .select('id, mux_upload_id, mux_asset_id, status')
      .eq('property_id', propertyId).in('status', ['selected', 'uploading', 'processing']);
    if (pendingJobs.error) throw pendingJobs.error;
    for (const job of pendingJobs.data ?? []) {
      const claimed = await supabase.from('property_video_jobs').update({ status: 'cancelled', error_code: null })
        .eq('id', job.id).in('status', ['selected', 'uploading', 'processing']).select('id').maybeSingle();
      if (!claimed.data) continue;
      await cancelMuxUpload(job.mux_upload_id);
      if (job.mux_asset_id && job.mux_asset_id !== previous.mux_asset_id) await deleteMuxAsset(job.mux_asset_id);
    }
    const cleared = await supabase.from('properties').update({
      video_provider: null,
      video_storage_path: null,
      mux_asset_id: null,
      mux_playback_id: null,
      video_status: null,
      video_aspect_ratio: null,
    }).eq('id', propertyId).select('id').maybeSingle();
    if (cleared.error || !cleared.data) throw cleared.error ?? new Error('No se pudo desvincular el video.');

    try {
      if (previous.video_provider === 'mux') await deleteMuxAsset(previous.mux_asset_id);
      if (previous.video_provider !== 'mux' && previous.video_storage_path) {
        const removed = await supabase.storage.from('property-videos').remove([previous.video_storage_path]);
        if (removed.error) throw removed.error;
      }
    } catch (reason) {
      await supabase.from('properties').update(previous).eq('id', propertyId).is('video_provider', null);
      throw reason;
    }
    sendJson(response, 200, { deleted: true });
  } catch (reason) {
    sendJson(response, statusFromError(reason), { error: safeErrorMessage(reason, 'No se pudo eliminar el video. La referencia anterior se conservó.') });
  }
}
