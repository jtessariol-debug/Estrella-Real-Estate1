import { useState, type FormEvent } from 'react';
import { getCurrentProfile, signIn, signOut } from '../services/auth';
import { isSupabaseConfigured } from '../lib/supabase';
import BrandLogo from '../components/BrandLogo';

export default function AdminLoginPage() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError(null);
    try {
      await signIn(email, password);
      const profile = await getCurrentProfile();
      if (!profile || !['admin', 'editor'].includes(profile.role)) { await signOut(); throw new Error('Esta cuenta no tiene permisos administrativos.'); }
      window.location.replace('/admin');
    } catch (reason: unknown) { setError(reason instanceof Error ? reason.message : 'No fue posible iniciar sesión.'); setLoading(false); }
  };
  return <main className="admin-login"><section className="admin-login-brand"><a className="logo" href="/" aria-label="Estrella Real Estate, inicio"><BrandLogo className="admin-login-logo" /></a><div><span className="eyebrow">Administración segura</span><h1>Gestiona cada propiedad desde un solo lugar.</h1><p>Acceso exclusivo para el equipo autorizado de Estrella Real Estate.</p></div></section><section className="admin-login-form"><a className="admin-login-mobile-logo" href="/" aria-label="Estrella Real Estate, inicio"><BrandLogo /></a><form className="admin-auth-card" onSubmit={submit}><span className="eyebrow">Panel administrativo</span><h2>Iniciar sesión</h2>{!isSupabaseConfigured && <div className="form-error">Configura las variables de Supabase antes de iniciar sesión.</div>}{error && <div className="form-error" role="alert">{error}</div>}<div className="input-group"><label htmlFor="admin-email">Email</label><input id="admin-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div><div className="input-group"><label htmlFor="admin-password">Contraseña</label><input id="admin-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div><button className="button" type="submit" disabled={loading || !isSupabaseConfigured}>{loading ? 'Verificando…' : 'Iniciar sesión'}</button><a className="back-link" href="/">← Volver al sitio web</a></form></section></main>;
}
