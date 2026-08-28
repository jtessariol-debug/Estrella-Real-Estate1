import { useState, type ReactNode } from 'react';
import { Building2, LayoutDashboard, LogOut, Menu, X } from 'lucide-react';
import { signOut } from '../services/auth';
import type { Profile } from '../types';
import BrandLogo from './BrandLogo';

export default function AdminLayout({ profile, children }: { profile: Profile; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const logout = () => void signOut().finally(() => window.location.replace('/admin/login'));
  return <div className="admin-shell"><header className="admin-mobile-bar"><a className="admin-brand" href="/admin"><BrandLogo className="admin-brand-logo" /><span className="admin-brand-label">ADMIN</span></a><button type="button" onClick={() => setMenuOpen(true)} aria-label="Abrir menú administrativo" aria-expanded={menuOpen}><Menu /></button></header>{menuOpen && <button className="admin-drawer-backdrop" type="button" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" />}<aside className={`admin-sidebar ${menuOpen ? 'is-open' : ''}`} aria-label="Navegación administrativa"><button className="admin-drawer-close" type="button" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><X /></button><a className="admin-brand" href="/admin"><BrandLogo className="admin-brand-logo" /><span className="admin-brand-label">ADMIN</span></a><nav><a href="/admin" onClick={() => setMenuOpen(false)}><LayoutDashboard /> Resumen</a><a href="/admin/properties" onClick={() => setMenuOpen(false)}><Building2 /> Propiedades</a></nav><div className="admin-account"><small>{profile.role}</small><strong>{profile.fullName}</strong><button onClick={logout}><LogOut size={17} /> Cerrar sesión</button></div></aside><main className="admin-content">{children}</main></div>;
}
