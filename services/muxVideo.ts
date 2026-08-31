import { createUpload, type UpChunk } from '@mux/upchunk';
import { requireSupabase } from '../lib/supabase';

export type MuxVideoJobStatus = 'selected' | 'uploading' | 'processing' | 'completed' | 'error' | 'cancelled';
export type MuxVideoJob = {
  id: string;
  propertyId: string;
  status: MuxVideoJobStatus;
  progress: number;
  errorCode?: string;
  originalFilename: string;
};

type DirectUploadResponse = { upload_url: string; job_id: string; mux_upload_id: string };

async function authHeaders(): Promise<Record<string, string>> {
  const { data, error } = await requireSupabase().auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
  return { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' };
}

async function apiRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...(await authHeaders()), ...init.headers } });
  const payload = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(payload.error || 'No se pudo completar la operación de video.');
  return payload;
}

export async function startMuxVideoUpload(
  propertyId: string,
  file: File,
  callbacks: {
    onProgress: (progress: number) => void;
    onProcessing: () => void;
    onController: (upload: UpChunk, jobId: string) => void;
  },
): Promise<{ jobId: string }> {
  const prepared = await apiRequest<DirectUploadResponse>('/api/mux/direct-upload', {
    method: 'POST',
    body: JSON.stringify({ property_id: propertyId, filename: file.name, size: file.size }),
  });

  return new Promise((resolve, reject) => {
    const upload = createUpload({ endpoint: prepared.upload_url, file, chunkSize: 16, attempts: 5, dynamicChunkSize: true });
    callbacks.onController(upload, prepared.job_id);
    let lastPersisted = -10;
    upload.on('progress', (event) => {
      const progress = Math.max(0, Math.min(100, Number(event.detail) || 0));
      callbacks.onProgress(progress);
      if (progress - lastPersisted >= 5 || progress === 100) {
        lastPersisted = progress;
        void requireSupabase().rpc('update_own_video_job_upload_progress', { p_job_id: prepared.job_id, p_progress: progress });
      }
    });
    upload.on('success', () => {
      callbacks.onProgress(100);
      callbacks.onProcessing();
      resolve({ jobId: prepared.job_id });
    });
    upload.on('error', (event) => reject(new Error(event.detail?.message || 'No se pudo subir el video a Mux.')));
  });
}

export async function cancelMuxVideoUpload(jobId: string, upload?: UpChunk): Promise<void> {
  upload?.abort();
  await apiRequest(`/api/mux/job?job_id=${encodeURIComponent(jobId)}`, { method: 'DELETE' });
}

export async function getLatestMuxVideoJob(propertyId: string): Promise<MuxVideoJob | undefined> {
  const result = await requireSupabase().from('property_video_jobs')
    .select('id, property_id, status, progress, error_code, original_filename')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle();
  if (result.error) throw new Error('No pudimos comprobar el estado del video en Mux.');
  if (!result.data) return undefined;
  return {
    id: String(result.data.id),
    propertyId: String(result.data.property_id),
    status: result.data.status as MuxVideoJobStatus,
    progress: Number(result.data.progress),
    errorCode: result.data.error_code ? String(result.data.error_code) : undefined,
    originalFilename: String(result.data.original_filename),
  };
}

export async function cleanupMuxAsset(propertyId: string, assetId: string): Promise<void> {
  await apiRequest('/api/mux/cleanup-asset', { method: 'POST', body: JSON.stringify({ property_id: propertyId, asset_id: assetId }) });
}

export async function deleteHybridPropertyVideo(propertyId: string): Promise<void> {
  await apiRequest('/api/admin/delete-video', { method: 'POST', body: JSON.stringify({ property_id: propertyId }) });
}

export async function deleteHybridProperty(propertyId: string): Promise<void> {
  await apiRequest('/api/admin/delete-property', { method: 'POST', body: JSON.stringify({ property_id: propertyId }) });
}

export async function getMuxPlaybackToken(propertyId: string, admin = false): Promise<string> {
  const headers = admin ? await authHeaders() : undefined;
  const response = await fetch(`/api/mux/playback-token?property_id=${encodeURIComponent(propertyId)}`, { headers });
  const payload = await response.json().catch(() => ({})) as { token?: string; error?: string };
  if (!response.ok || !payload.token) throw new Error(payload.error || 'No se pudo autorizar el video.');
  return payload.token;
}
