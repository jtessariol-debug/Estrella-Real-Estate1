import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { IncomingMessage } from 'node:http';
import { bearerToken, requiredEnv } from './http.js';

let cachedClient: SupabaseClient | undefined;

export function getSupabaseAdmin(): SupabaseClient {
  if (!cachedClient) {
    cachedClient = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return cachedClient;
}

const partialUserId = (id?: string) => id ? `${id.slice(0, 8)}…` : undefined;

export async function requireStaff(
  request: IncomingMessage,
  endpoint = request.url?.split('?')[0] ?? 'unknown',
  traceId?: string,
): Promise<User> {
  const token = bearerToken(request);
  if (!token) {
    console.warn('[STAFF AUTH]', { traceId, endpoint, authenticated: false, profileFound: false, authorization: 'denied', status: 401 });
    throw Object.assign(new Error('Debes iniciar sesión nuevamente.'), { statusCode: 401, code: 'session_missing' });
  }
  const client = getSupabaseAdmin();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    console.warn('[STAFF AUTH]', { traceId, endpoint, authenticated: false, profileFound: false, authorization: 'denied', status: 401, authError: error?.code });
    throw Object.assign(new Error('La sesión no es válida.'), { statusCode: 401, code: 'session_invalid' });
  }
  const profile = await client.from('profiles').select('id, role').eq('id', data.user.id).maybeSingle();
  if (profile.error) {
    console.error('[STAFF AUTH]', {
      traceId,
      endpoint,
      userId: partialUserId(data.user.id),
      authenticated: true,
      profileFound: false,
      authorization: 'error',
      status: 500,
      databaseError: profile.error.code,
    });
    throw Object.assign(new Error('No se pudo verificar el perfil administrativo.'), { statusCode: 500, code: 'profile_lookup_failed' });
  }
  const role = profile.data?.role ? String(profile.data.role) : undefined;
  const allowed = Boolean(profile.data && role && ['admin', 'editor'].includes(role));
  console.info('[STAFF AUTH]', {
    traceId,
    endpoint,
    userId: partialUserId(data.user.id),
    authenticated: true,
    profileFound: Boolean(profile.data),
    role,
    authorization: allowed ? 'allowed' : 'denied',
    status: allowed ? 200 : 403,
  });
  if (!allowed) {
    throw Object.assign(new Error('No tienes permisos para administrar videos.'), {
      statusCode: 403,
      code: profile.data ? 'role_denied' : 'profile_missing',
    });
  }
  return data.user;
}

export function statusFromError(reason: unknown): number {
  if (reason && typeof reason === 'object' && 'statusCode' in reason) {
    const code = Number((reason as { statusCode?: unknown }).statusCode);
    if (Number.isInteger(code) && code >= 400 && code < 600) return code;
  }
  return 500;
}
