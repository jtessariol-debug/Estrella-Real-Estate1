import type { ServerResponse } from 'node:http';
import { allowMethods, readRawBody, sendJson, type ApiRequest } from '../../server/http.js';
import { deleteMuxAsset, verifyMuxWebhook } from '../../server/mux.js';
import { getSupabaseAdmin } from '../../server/supabase-admin.js';

export const config = { api: { bodyParser: false } };

type PlaybackId = { id?: string; policy?: string };
type MuxEventData = {
  id?: string;
  asset_id?: string;
  aspect_ratio?: string;
  playback_ids?: PlaybackId[];
  errors?: { messages?: string[] };
  meta?: { external_id?: string };
};
type MuxEvent = { type?: string; data?: MuxEventData };
type CompletionRow = {
  activated: boolean;
  property_id: string;
  previous_provider: string | null;
  previous_storage_path: string | null;
  previous_mux_asset_id: string | null;
};

async function findJobId(data: MuxEventData): Promise<string | undefined> {
  if (data.meta?.external_id) return data.meta.external_id;
  const supabase = getSupabaseAdmin();
  if (data.asset_id || data.id) {
    const column = data.asset_id ? 'mux_upload_id' : 'mux_asset_id';
    const value = data.asset_id ? data.id : data.id;
    if (value) {
      const result = await supabase.from('property_video_jobs').select('id').eq(column, value).maybeSingle();
      return result.data?.id ? String(result.data.id) : undefined;
    }
  }
  return undefined;
}

async function cleanPreviousVideo(row: CompletionRow, jobId: string): Promise<void> {
  try {
    if (row.previous_provider === 'supabase' && row.previous_storage_path) {
      const removed = await getSupabaseAdmin().storage.from('property-videos').remove([row.previous_storage_path]);
      if (removed.error) throw removed.error;
    }
    if (row.previous_provider === 'mux' && row.previous_mux_asset_id) await deleteMuxAsset(row.previous_mux_asset_id);
  } catch (reason) {
    console.error('Previous property video cleanup failed', { jobId, reason: reason instanceof Error ? reason.message : String(reason) });
    await getSupabaseAdmin().from('property_video_jobs').update({ error_code: 'cleanup_failed' }).eq('id', jobId);
  }
}

export default async function handler(request: ApiRequest, response: ServerResponse) {
  if (!allowMethods(request, response, ['POST'])) return;
  const rawBody = await readRawBody(request);
  const signature = Array.isArray(request.headers['mux-signature']) ? request.headers['mux-signature'][0] : request.headers['mux-signature'];
  if (!verifyMuxWebhook(rawBody, signature)) return sendJson(response, 401, { error: 'Firma de webhook inválida.' });

  try {
    const event = JSON.parse(rawBody) as MuxEvent;
    const data = event.data ?? {};
    const supabase = getSupabaseAdmin();
    console.info('Mux webhook received', { type: event.type, objectId: data.id, assetId: data.asset_id });

    if (event.type === 'video.upload.asset_created') {
      const job = await supabase.from('property_video_jobs').select('id, status').eq('mux_upload_id', data.id).maybeSingle();
      if (job.data?.status === 'cancelled') {
        await deleteMuxAsset(data.asset_id);
      } else if (job.data && ['selected', 'uploading'].includes(String(job.data.status))) {
        await supabase.from('property_video_jobs').update({ mux_asset_id: data.asset_id, status: 'processing', progress: 100 }).eq('id', job.data.id);
      }
    } else if (event.type === 'video.asset.ready') {
      const jobId = await findJobId(data);
      const playbackId = data.playback_ids?.find((item) => item.policy === 'signed')?.id;
      if (!jobId || !data.id || !playbackId) throw new Error('Mux ready event is missing job, asset, or signed playback ID.');
      const currentJob = await supabase.from('property_video_jobs').select('status').eq('id', jobId).maybeSingle();
      if (currentJob.data?.status === 'cancelled') {
        await deleteMuxAsset(data.id);
        return sendJson(response, 200, { received: true });
      }
      const aspectRatio = /^[1-9]\d*:[1-9]\d*$/.test(data.aspect_ratio ?? '') ? String(data.aspect_ratio) : '16:9';
      const completed = await supabase.rpc('complete_property_mux_video_job', {
        p_job_id: jobId,
        p_asset_id: data.id,
        p_playback_id: playbackId,
        p_aspect_ratio: aspectRatio,
      });
      if (completed.error) throw completed.error;
      const row = (completed.data as CompletionRow[] | null)?.[0];
      if (row?.activated) await cleanPreviousVideo(row, jobId);
    } else if (event.type === 'video.asset.errored') {
      const jobId = await findJobId(data);
      if (jobId) await supabase.from('property_video_jobs').update({ status: 'error', error_code: 'mux_processing_failed' }).eq('id', jobId).neq('status', 'completed');
    } else if (event.type === 'video.asset.deleted' && data.id) {
      await supabase.from('properties').update({ video_status: 'error' }).eq('video_provider', 'mux').eq('mux_asset_id', data.id);
      await supabase.from('property_video_jobs').update({ status: 'error', error_code: 'mux_asset_deleted' }).eq('mux_asset_id', data.id).in('status', ['selected', 'uploading', 'processing']);
    }

    console.info('Mux webhook processed', { type: event.type, objectId: data.id });
    sendJson(response, 200, { received: true });
  } catch (reason) {
    console.error('Mux webhook processing failed', reason instanceof Error ? reason.message : reason);
    sendJson(response, 500, { error: 'No se pudo procesar el evento.' });
  }
}
