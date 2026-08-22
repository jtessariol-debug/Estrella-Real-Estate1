import type { ReactNode } from 'react';
import { Building2, LayoutDashboard, LogOut } from 'lucide-react';
import { COMPANY_INFO } from '../constants';
import { signOut } from '../services/auth';
import type { Profile } from '../types';

export default function AdminLayout({ profile, children }: { profile: Profile; children: ReactNode }) {
  const logout = () => void signOut().finally(() => window.location.replace('/admin/login'));
  return <div className="admin-shell"><aside className="admin-sidebar"><a className="admin-brand" href="/admin"><img src={COMPANY_INFO.logoUrl} alt="Estrella Real Estate" /><span>ESTRELLA<br />ADMIN</span></a><nav><a href="/admin"><LayoutDashboard /> Resumen</a><a href="/admin/properties"><Building2 /> Propiedades</a></nav><div className="admin-account"><small>{profile.role}</small><strong>{profile.fullName}</strong><button onClick={logout}><LogOut size={17} /> Cerrar sesión</button></div></aside><main className="admin-content">{children}</main></div>;
}
