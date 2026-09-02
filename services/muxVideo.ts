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

export type MuxUploadFailure = Error & {
  uploadStarted: boolean;
  lastProgress: number;
  requestCode: string;
  jobId?: string;
  muxUploadId?: string;
};

export function isInterruptedMuxUpload(reason: unknown): reason is MuxUploadFailure {
  return reason instanceof Error && 'uploadStarted' in reason && (reason as MuxUploadFailure).uploadStarted;
}

type DirectUploadResponse = { upload_url: string; job_id: string; mux_upload_id: string };
const API_TIMEOUT_MS = 20_000;
const SESSION_TIMEOUT_MS = 20_000;
const UPLOAD_START_TIMEOUT_MS = 20_000;
const UPLOAD_STALL_TIMEOUT_MS = 120_000;
const INITIAL_CHUNK_SIZE_KB = 5 * 1024;
const MIN_CHUNK_SIZE_KB = 1024;
const MAX_CHUNK_SIZE_KB = 20 * 1024;

const muxClientLog = (traceId: string | undefined, event: string, details: Record<string, unknown> = {}) => {
  console.info('[MUX CLIENT]', { traceId, event, ...details });
};

export function createMuxTraceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `mux-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error(message)), milliseconds); }),
    ]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

async function authHeaders(traceId?: string): Promise<Record<string, string>> {
  muxClientLog(traceId, 'session.request');
  const { data, error } = await withTimeout(
    requireSupabase().auth.getSession(),
    SESSION_TIMEOUT_MS,
    'No se pudo comprobar la sesión a tiempo. Inicia sesión nuevamente.',
  );
  if (error || !data.session?.access_token) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
  muxClientLog(traceId, 'session.ready', { authenticated: true });
  return { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' };
}

async function apiRequest<T>(url: string, init: RequestInit = {}, traceId?: string): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { ...(await authHeaders(traceId)), ...(traceId ? { 'X-Mux-Trace-Id': traceId } : {}), ...init.headers },
    });
    muxClientLog(traceId, 'api.response', { path: new URL(url, window.location.origin).pathname, status: response.status });
    const payload = await response.json().catch(() => ({})) as { error?: string; code?: string; reason?: string } & T;
    if (!response.ok) muxClientLog(traceId, 'api.error', { path: new URL(url, window.location.origin).pathname, status: response.status, code: payload.code, reason: payload.reason });
    if (!response.ok) throw new Error(payload.error || 'No se pudo completar la operación de video.');
    return payload;
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'AbortError') {
      throw new Error('La preparación del video tardó demasiado. Comprueba tu conexión e inténtalo nuevamente.');
    }
    throw reason;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function startMuxVideoUpload(
  propertyId: string,
  file: File,
  callbacks: {
    onProgress: (progress: number) => void;
    onProcessing: () => void;
    onController: (upload: UpChunk, jobId: string) => void;
    onStage: (message: string, traceId: string) => void;
  },
  traceId = createMuxTraceId(),
): Promise<{ jobId: string }> {
  muxClientLog(traceId, 'direct-upload.request', {
    propertyId,
    fileSize: file.size,
    fileType: file.type || 'unknown',
    requestingDirectUpload: true,
  });
  callbacks.onStage('Solicitando autorización para el video…', traceId);
  let prepared: DirectUploadResponse;
  try {
    prepared = await apiRequest<DirectUploadResponse>('/api/mux/direct-upload', {
      method: 'POST',
      body: JSON.stringify({ property_id: propertyId, filename: file.name, size: file.size }),
    }, traceId);
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : 'No se pudo solicitar la subida del video.';
    muxClientLog(traceId, 'direct-upload.error', { type: reason instanceof Error ? reason.name : typeof reason, message });
    throw new Error(`${message} Código ${traceId.slice(0, 8)}.`);
  }
  muxClientLog(traceId, 'direct-upload.received', {
    jobIdReceived: Boolean(prepared.job_id),
    uploadUrlReceived: Boolean(prepared.upload_url),
    muxUploadIdReceived: Boolean(prepared.mux_upload_id),
  });
  if (!prepared.job_id || !prepared.upload_url || !prepared.mux_upload_id) {
    throw new Error(`El servicio de video devolvió una respuesta incompleta. Código ${traceId.slice(0, 8)}.`);
  }

  const endpointHostname = new URL(prepared.upload_url).hostname;
  console.info('[MUX UPLOAD]', { requestCode: traceId, jobId: prepared.job_id, muxUploadId: prepared.mux_upload_id, uploadStarted: false, lastProgress: 0, endpointHostname });

  let upload: UpChunk;
  try {
    callbacks.onStage('Conectando con el servicio de video…', traceId);
    muxClientLog(traceId, 'upchunk.init', {
      upchunkInit: true,
      endpointHost: endpointHostname,
      chunkSize: INITIAL_CHUNK_SIZE_KB,
      minChunkSize: MIN_CHUNK_SIZE_KB,
      maxChunkSize: MAX_CHUNK_SIZE_KB,
      dynamicChunkSize: true,
    });
    upload = createUpload({
      endpoint: prepared.upload_url,
      file,
      chunkSize: INITIAL_CHUNK_SIZE_KB,
      minChunkSize: MIN_CHUNK_SIZE_KB,
      maxChunkSize: MAX_CHUNK_SIZE_KB,
      attempts: 5,
      dynamicChunkSize: true,
    });
  } catch (reason) {
    muxClientLog(traceId, 'upchunk.exception', {
      type: reason instanceof Error ? reason.name : typeof reason,
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    try { await apiRequest(`/api/mux/job?job_id=${encodeURIComponent(prepared.job_id)}`, { method: 'DELETE' }, traceId); }
    catch { /* El error original de inicio es el más útil para el usuario. */ }
    throw new Error(`No se pudo iniciar la subida del video. Código ${traceId.slice(0, 8)}.`);
  }

  return new Promise((resolve, reject) => {
    callbacks.onController(upload, prepared.job_id);
    let lastPersisted = -10;
    let lastLoggedProgress = -10;
    let hasProgress = false;
    let lastProgress = 0;
    let lastAttemptedChunk: number | undefined;
    let lastSuccessfulChunk: number | undefined;
    let lastHttpStatus: number | undefined;
    let settled = false;
    let stallTimer: number | undefined;
    const armStallTimer = (milliseconds = hasProgress ? UPLOAD_STALL_TIMEOUT_MS : UPLOAD_START_TIMEOUT_MS) => {
      if (stallTimer) window.clearTimeout(stallTimer);
      stallTimer = window.setTimeout(() => {
        const message = hasProgress
          ? 'La subida dejó de avanzar. Comprueba tu conexión e intenta el video nuevamente.'
          : 'No se pudo conectar con el servicio de video.';
        muxClientLog(traceId, 'upload.timeout', { hasProgress, timeoutMs: milliseconds });
        void fail(message, { errorEvent: 'timeout' });
      }, milliseconds);
    };
    const fail = async (message: string, details: Record<string, unknown> = {}) => {
      if (settled) return;
      settled = true;
      if (stallTimer) window.clearTimeout(stallTimer);
      upload.abort();
      const interrupted = hasProgress || lastProgress > 0;
      const userMessage = interrupted ? 'Se interrumpió la subida del video. Puedes reintentarlo.' : message;
      console.error('[MUX UPLOAD]', {
        requestCode: traceId,
        jobId: prepared.job_id,
        muxUploadId: prepared.mux_upload_id,
        uploadStarted: interrupted,
        lastProgress: Math.round(lastProgress),
        lastAttemptedChunk,
        lastSuccessfulChunk,
        httpStatus: lastHttpStatus,
        endpointHostname,
        ...details,
      });
      const failure = Object.assign(new Error(`${userMessage} Código ${traceId.slice(0, 8)}.`), {
        uploadStarted: interrupted,
        lastProgress,
        requestCode: traceId,
        jobId: prepared.job_id,
        muxUploadId: prepared.mux_upload_id,
      }) as MuxUploadFailure;
      reject(failure);
      void apiRequest(`/api/mux/job?job_id=${encodeURIComponent(prepared.job_id)}`, { method: 'DELETE' }, traceId)
        .catch((cleanupReason: unknown) => muxClientLog(traceId, 'upload.cleanup-error', { message: cleanupReason instanceof Error ? cleanupReason.message : String(cleanupReason) }));
    };
    armStallTimer();
    upload.on('attempt', (event) => {
      lastAttemptedChunk = event.detail?.chunkNumber;
      callbacks.onStage('Iniciando transferencia a Mux…', traceId);
      muxClientLog(traceId, 'upload.start', {
        chunkNumber: event.detail?.chunkNumber,
        chunkSize: event.detail?.chunkSize,
      });
      armStallTimer();
    });
    upload.on('progress', (event) => {
      hasProgress = true;
      armStallTimer();
      const progress = Math.max(0, Math.min(100, Number(event.detail) || 0));
      lastProgress = progress;
      callbacks.onProgress(progress);
      if (progress - lastLoggedProgress >= 5 || progress === 100) {
        lastLoggedProgress = progress;
        muxClientLog(traceId, 'upload.progress', { progress: Math.round(progress) });
      }
      if (progress - lastPersisted >= 5 || progress === 100) {
        lastPersisted = progress;
        void requireSupabase().rpc('update_own_video_job_upload_progress', { p_job_id: prepared.job_id, p_progress: progress });
      }
    });
    upload.on('success', () => {
      if (settled) return;
      settled = true;
      if (stallTimer) window.clearTimeout(stallTimer);
      callbacks.onProgress(100);
      callbacks.onProcessing();
      muxClientLog(traceId, 'upload.success', { jobId: prepared.job_id });
      console.info('[MUX UPLOAD]', { requestCode: traceId, jobId: prepared.job_id, muxUploadId: prepared.mux_upload_id, uploadStarted: true, lastProgress: 100, errorEvent: null, httpStatus: lastHttpStatus, endpointHostname });
      resolve({ jobId: prepared.job_id });
    });
    upload.on('chunkSuccess', (event) => {
      lastSuccessfulChunk = event.detail?.chunk;
      lastHttpStatus = event.detail?.response?.statusCode;
      muxClientLog(traceId, 'upload.chunk-success', { chunkNumber: lastSuccessfulChunk, status: lastHttpStatus, attempts: event.detail?.attempts });
    });
    upload.on('attemptFailure', (event) => {
      lastAttemptedChunk = event.detail?.chunkNumber;
      lastHttpStatus = event.detail?.response?.statusCode;
      muxClientLog(traceId, 'upload.attempt-failure', {
        message: event.detail?.message,
        chunkNumber: event.detail?.chunkNumber,
        attemptsLeft: event.detail?.attemptsLeft,
        status: event.detail?.response?.statusCode,
      });
    });
    upload.on('offline', () => {
      callbacks.onStage('Sin conexión. La subida continuará cuando vuelva internet.', traceId);
      muxClientLog(traceId, 'upload.offline');
    });
    upload.on('online', () => {
      callbacks.onStage('Conexión recuperada. Reanudando video…', traceId);
      muxClientLog(traceId, 'upload.online');
      armStallTimer();
    });
    upload.on('error', (event) => {
      lastHttpStatus = event.detail?.response?.statusCode;
      muxClientLog(traceId, 'upload.error', {
        type: event.type,
        message: event.detail?.message,
        status: event.detail?.response?.statusCode,
        chunk: event.detail?.chunk,
        attempts: event.detail?.attempts,
      });
      void fail(hasProgress ? 'Se interrumpió la subida del video. Puedes reintentarlo.' : 'No se pudo conectar con el servicio de video.', {
        errorEvent: event.type,
        message: event.detail?.message,
        chunkNumber: event.detail?.chunk,
        attempts: event.detail?.attempts,
        httpStatus: event.detail?.response?.statusCode,
        networkError: !event.detail?.response,
      });
    });
  });
}

export async function cancelMuxVideoUpload(jobId: string, upload?: UpChunk): Promise<void> {
  upload?.abort();
  await apiRequest(`/api/mux/job?job_id=${encodeURIComponent(jobId)}`, { method: 'DELETE' });
}

export async function getLatestMuxVideoJob(propertyId: string): Promise<MuxVideoJob | undefined> {
  const result = await requireSupabase().from('property_video_jobs')
    .select('id, property_id, status, progress, error_code, original_filename, updated_at')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle();
  if (result.error) throw new Error('No pudimos comprobar el estado del video en Mux.');
  if (!result.data) return undefined;
  const status = result.data.status as MuxVideoJobStatus;
  const selectedIsStale = status === 'selected'
    && Date.now() - new Date(String(result.data.updated_at)).getTime() > 5 * 60 * 1000;
  return {
    id: String(result.data.id),
    propertyId: String(result.data.property_id),
    status: selectedIsStale ? 'error' : status,
    progress: Number(result.data.progress),
    errorCode: selectedIsStale ? 'upload_not_started' : result.data.error_code ? String(result.data.error_code) : undefined,
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
