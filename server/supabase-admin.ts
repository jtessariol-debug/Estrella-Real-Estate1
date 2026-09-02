import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { IncomingMessage } from 'node:http';
import { bearerToken, requiredEnv } from './http.js';

let cachedClient: SupabaseClient | undefined;
const EXPECTED_SUPABASE_PROJECT_REF = 'rvqipvcyoedbztvegnlw';

type ServerKeyType = 'legacy_service_role' | 'secret_key';

function projectRefFromUrl(value: string): string | undefined {
  try {
    const [projectRef, ...domain] = new URL(value).hostname.split('.');
    return domain.join('.') === 'supabase.co' && projectRef ? projectRef : undefined;
  } catch { return undefined; }
}

function legacyKeyPayload(value: string): { role?: string; ref?: string } | undefined {
  if (value.startsWith('sb_')) return undefined;
  const payload = value.split('.')[1];
  if (!payload) return undefined;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { role?: string; ref?: string }; }
  catch { return undefined; }
}

function serverKeyType(value: string): ServerKeyType | undefined {
  if (value.startsWith('sb_secret_')) return 'secret_key';
  return legacyKeyPayload(value)?.role === 'service_role' ? 'legacy_service_role' : undefined;
}

function serverConfiguration() {
  const url = requiredEnv('SUPABASE_URL');
  const key = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const projectRef = projectRefFromUrl(url);
  const keyType = serverKeyType(key);
  const legacyRef = legacyKeyPayload(key)?.ref;
  if (projectRef !== EXPECTED_SUPABASE_PROJECT_REF) {
    throw Object.assign(new Error('SUPABASE_URL no corresponde al proyecto esperado.'), { statusCode: 500, code: 'supabase_project_mismatch' });
  }
  if (!keyType) {
    throw Object.assign(new Error('SUPABASE_SERVICE_ROLE_KEY no es una credencial administrativa compatible.'), { statusCode: 500, code: 'supabase_server_key_invalid' });
  }
  if (legacyRef && legacyRef !== projectRef) {
    throw Object.assign(new Error('La URL y la service role key pertenecen a proyectos diferentes.'), { statusCode: 500, code: 'supabase_key_project_mismatch' });
  }
  return { url, key, projectRef, keyType };
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!cachedClient) {
    const configuration = serverConfiguration();
    console.info('[SUPABASE SERVER]', { supabaseProjectRef: configuration.projectRef, serverKeyType: configuration.keyType });
    cachedClient = createClient(configuration.url, configuration.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      db: { schema: 'public' },
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
    console.warn('[MUX AUTH]', { requestCode: traceId, authenticated: false, userIdPrefix: null, supabaseProjectRef: EXPECTED_SUPABASE_PROJECT_REF, profileQueryExecuted: false, profileQueryError: null, profileFound: false, role: null, authorized: false });
    console.warn('[STAFF AUTH]', { traceId, endpoint, authenticated: false, profileFound: false, authorization: 'denied', status: 401 });
    throw Object.assign(new Error('Debes iniciar sesión nuevamente.'), { statusCode: 401, code: 'session_missing' });
  }
  const client = getSupabaseAdmin();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    console.warn('[MUX AUTH]', { requestCode: traceId, authenticated: false, userIdPrefix: null, supabaseProjectRef: EXPECTED_SUPABASE_PROJECT_REF, profileQueryExecuted: false, profileQueryError: null, profileFound: false, role: null, authorized: false, authError: error?.code });
    console.warn('[STAFF AUTH]', { traceId, endpoint, authenticated: false, profileFound: false, authorization: 'denied', status: 401, authError: error?.code });
    throw Object.assign(new Error('La sesión no es válida.'), { statusCode: 401, code: 'session_invalid' });
  }
  const profile = await client.schema('public').from('profiles').select('id, role').eq('id', data.user.id).maybeSingle();
  if (profile.error) {
    console.error('[MUX AUTH]', { requestCode: traceId, authenticated: true, userIdPrefix: data.user.id.slice(0, 8), supabaseProjectRef: EXPECTED_SUPABASE_PROJECT_REF, profileQueryExecuted: true, profileQueryError: profile.error.code, profileFound: false, role: null, authorized: false });
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
  console.info('[MUX AUTH]', { requestCode: traceId, authenticated: true, userIdPrefix: data.user.id.slice(0, 8), supabaseProjectRef: EXPECTED_SUPABASE_PROJECT_REF, profileQueryExecuted: true, profileQueryError: null, profileFound: Boolean(profile.data), role: role ?? null, authorized: allowed });
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
