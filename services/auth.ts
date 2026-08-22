import type { User } from '@supabase/supabase-js';
import { requireSupabase } from '../lib/supabase';
import type { Profile } from '../types';

type ProfileRow = { id: string; full_name: string; role: 'admin' | 'editor'; created_at: string; updated_at: string };

function readableAuthError(code?: string): string {
  if (code === 'invalid_credentials') return 'El email o la contraseña no son correctos.';
  if (code === 'email_not_confirmed') return 'Debes confirmar tu email antes de iniciar sesión.';
  if (code === 'over_request_rate_limit') return 'Demasiados intentos. Espera un momento y vuelve a intentarlo.';
  return 'No fue posible iniciar sesión. Verifica tu conexión e inténtalo nuevamente.';
}

export async function signIn(email: string, password: string): Promise<User> {
  const { data, error } = await requireSupabase().auth.signInWithPassword({ email, password });
  if (error) {
    if (import.meta.env.DEV) console.error('Supabase sign-in error:', error.code, error.message);
    throw new Error(readableAuthError(error.code));
  }
  return data.user;
}

export async function signOut(): Promise<void> {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw new Error(error.message);
}

export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await requireSupabase().auth.getUser();
  if (error) throw new Error(error.message);
  return data.user;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await requireSupabase().from('profiles').select('id, full_name, role, created_at, updated_at').eq('id', user.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as ProfileRow;
  return { id: row.id, fullName: row.full_name, role: row.role, createdAt: row.created_at, updatedAt: row.updated_at };
}
