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
    const [propertyResult, imagesResult, jobsResult] = await Promise.all([
      supabase.from('properties').select('video_provider, video_storage_path, mux_asset_id').eq('id', propertyId).maybeSingle(),
      supabase.from('property_images').select('storage_path').eq('property_id', propertyId),
      supabase.from('property_video_jobs').select('id, mux_upload_id, mux_asset_id, status').eq('property_id', propertyId),
    ]);
    if (propertyResult.error || !propertyResult.data) return sendJson(response, 404, { error: 'La propiedad no existe.' });
    if (imagesResult.error || jobsResult.error) throw imagesResult.error ?? jobsResult.error;

    for (const job of jobsResult.data ?? []) {
      if (!['completed', 'cancelled', 'error'].includes(String(job.status))) {
        const claimed = await supabase.from('property_video_jobs').update({ status: 'cancelled', error_code: null })
          .eq('id', job.id)
          .in('status', ['selected', 'uploading', 'processing']).select('id').maybeSingle();
        if (claimed.data) await cancelMuxUpload(job.mux_upload_id);
      }
      if (job.mux_asset_id && job.mux_asset_id !== propertyResult.data.mux_asset_id) await deleteMuxAsset(job.mux_asset_id);
    }
    const refreshedProperty = await supabase.from('properties').select('video_provider, video_storage_path, mux_asset_id').eq('id', propertyId).maybeSingle();
    if (refreshedProperty.error || !refreshedProperty.data) throw refreshedProperty.error ?? new Error('La propiedad dejó de estar disponible durante la eliminación.');
    if (refreshedProperty.data.video_provider === 'mux') await deleteMuxAsset(refreshedProperty.data.mux_asset_id);
    if (refreshedProperty.data.video_storage_path) {
      const removedVideo = await supabase.storage.from('property-videos').remove([refreshedProperty.data.video_storage_path]);
      if (removedVideo.error) throw removedVideo.error;
    }
    const imagePaths = (imagesResult.data ?? []).map((item) => String(item.storage_path));
    if (imagePaths.length) {
      const removedImages = await supabase.storage.from('property-images').remove(imagePaths);
      if (removedImages.error) throw removedImages.error;
    }
    const deleted = await supabase.from('properties').delete().eq('id', propertyId).select('id').maybeSingle();
    if (deleted.error || !deleted.data) throw deleted.error ?? new Error('No se pudo borrar la propiedad.');
    sendJson(response, 200, { deleted: true });
  } catch (reason) {
    sendJson(response, statusFromError(reason), { error: safeErrorMessage(reason, 'No se pudo completar la limpieza. La propiedad no fue eliminada.') });
  }
}
