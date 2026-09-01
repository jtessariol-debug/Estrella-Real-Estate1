import { createHmac, createSign, timingSafeEqual } from 'node:crypto';
import { requiredEnv } from './http.js';

type MuxResponse<T> = { data: T; error?: { messages?: string[]; type?: string } };

function muxAuthorization(): string {
  return `Basic ${Buffer.from(`${requiredEnv('MUX_TOKEN_ID')}:${requiredEnv('MUX_TOKEN_SECRET')}`).toString('base64')}`;
}

export async function muxRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://api.mux.com${path}`, {
    ...init,
    headers: { Authorization: muxAuthorization(), 'Content-Type': 'application/json', ...init.headers },
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json() as MuxResponse<T>;
  if (!response.ok) {
    const message = payload.error?.messages?.join('. ') || payload.error?.type || `Mux respondió ${response.status}`;
    throw Object.assign(new Error(message), { statusCode: response.status });
  }
  return payload.data;
}

export type DirectUpload = { id: string; url: string; status: string };

export function createMuxDirectUpload(jobId: string, userId: string, corsOrigin: string): Promise<DirectUpload> {
  return muxRequest<DirectUpload>('/video/v1/uploads', {
    method: 'POST',
    body: JSON.stringify({
      cors_origin: corsOrigin,
      timeout: 86400,
      new_asset_settings: {
        playback_policies: ['signed'],
        video_quality: 'basic',
        max_resolution_tier: '1080p',
        meta: { external_id: jobId, creator_id: userId },
      },
    }),
  });
}

export async function deleteMuxAsset(assetId?: string | null): Promise<void> {
  if (!assetId) return;
  try {
    await muxRequest<void>(`/video/v1/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' });
  } catch (reason) {
    if (reason && typeof reason === 'object' && Number((reason as { statusCode?: unknown }).statusCode) === 404) return;
    throw reason;
  }
}

export async function cancelMuxUpload(uploadId?: string | null): Promise<void> {
  if (!uploadId) return;
  try {
    await muxRequest<void>(`/video/v1/uploads/${encodeURIComponent(uploadId)}`, { method: 'DELETE' });
  } catch (reason) {
    if (reason && typeof reason === 'object' && [404, 409].includes(Number((reason as { statusCode?: unknown }).statusCode))) return;
    throw reason;
  }
}

const base64Url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

export function createMuxPlaybackToken(playbackId: string, expiresInSeconds = 3600): { token: string; expiresAt: number } {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + expiresInSeconds;
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: requiredEnv('MUX_SIGNING_KEY_ID') }));
  const payload = base64Url(JSON.stringify({ sub: playbackId, aud: 'v', iat: now, exp: expiresAt }));
  const unsigned = `${header}.${payload}`;
  const configuredKey = requiredEnv('MUX_SIGNING_PRIVATE_KEY').replace(/\\n/g, '\n');
  const privateKey = configuredKey.includes('BEGIN PRIVATE KEY')
    ? configuredKey
    : Buffer.from(configuredKey, 'base64').toString('utf8');
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  return { token: `${unsigned}.${base64Url(signer.sign(privateKey))}`, expiresAt };
}

export function verifyMuxWebhook(rawBody: string, signatureHeader: string | undefined): boolean {
  if (!signatureHeader) return false;
  const values = new Map(signatureHeader.split(',').map((part) => {
    const [key, ...rest] = part.trim().split('=');
    return [key, rest.join('=')];
  }));
  const timestamp = values.get('t');
  const signature = values.get('v1');
  if (!timestamp || !signature || !/^\d+$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false;
  const expected = createHmac('sha256', requiredEnv('MUX_WEBHOOK_SECRET')).update(`${timestamp}.${rawBody}`).digest('hex');
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
}
