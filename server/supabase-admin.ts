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

export async function requireStaff(request: IncomingMessage): Promise<User> {
  const token = bearerToken(request);
  if (!token) throw Object.assign(new Error('Debes iniciar sesión nuevamente.'), { statusCode: 401 });
  const client = getSupabaseAdmin();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('La sesión no es válida.'), { statusCode: 401 });
  const profile = await client.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  if (profile.error || !profile.data || !['admin', 'editor'].includes(String(profile.data.role))) {
    throw Object.assign(new Error('No tienes permisos para administrar videos.'), { statusCode: 403 });
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
