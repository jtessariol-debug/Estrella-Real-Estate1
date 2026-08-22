import { useEffect, useState, type ReactNode } from 'react';
import type { Profile } from '../types';
import { getCurrentProfile, getCurrentUser, signOut } from '../services/auth';

export default function AdminGuard({ children }: { children: (profile: Profile) => ReactNode }) {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        const user = await getCurrentUser();
        if (!user) { window.location.replace('/admin/login'); return; }
        const currentProfile = await getCurrentProfile();
        if (!currentProfile || !['admin', 'editor'].includes(currentProfile.role)) { setProfile(null); return; }
        setProfile(currentProfile);
      } catch (reason: unknown) { setError(reason instanceof Error ? reason.message : 'No se pudo validar la sesión.'); }
    })();
  }, []);
  if (error) return <main className="admin-center"><div className="admin-auth-card"><h1>Configuración requerida</h1><p>{error}</p><a className="button" href="/">Volver al sitio</a></div></main>;
  if (profile === undefined) return <main className="admin-center"><p>Verificando acceso seguro…</p></main>;
  if (profile === null) return <main className="admin-center"><div className="admin-auth-card"><span className="eyebrow">Acceso restringido</span><h1>Tu cuenta todavía no tiene permisos</h1><p>Tu usuario está autenticado, pero todavía no tiene permisos administrativos. Solicita que se agregue tu perfil con rol admin o editor.</p><button className="button" onClick={() => void signOut().finally(() => window.location.replace('/admin/login'))}>Cerrar sesión</button></div></main>;
  return <>{children(profile)}</>;
}
