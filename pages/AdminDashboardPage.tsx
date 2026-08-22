import { useEffect, useState } from 'react';
import AdminGuard from '../components/AdminGuard';
import AdminLayout from '../components/AdminLayout';
import { getDashboardStats, type DashboardStats } from '../services/admin';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { void getDashboardStats().then(setStats).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo cargar el resumen.')); }, []);
  return <AdminGuard>{(profile) => <AdminLayout profile={profile}><header className="admin-page-head"><div><span className="eyebrow">Estrella Real Estate</span><h1>Panel administrativo</h1><p>Bienvenido, {profile.fullName}.</p></div><a className="button" href="/admin/properties">Gestionar propiedades</a></header>{error && <div className="form-error">{error}</div>}<div className="stat-grid">{([['Propiedades', stats?.properties], ['Publicadas', stats?.published], ['Borradores', stats?.drafts], ['Destacadas', stats?.featured]] as const).map(([label, value]) => <article className="stat-card" key={label}><small>{label}</small><strong>{value ?? '—'}</strong></article>)}</div><section className="admin-note"><h2>Tu catálogo, en un solo lugar</h2><p>Crea propiedades, gestiona fotografías y amenidades, controla su estado y decide cuáles aparecen en el sitio público.</p><a className="button" href="/admin/properties/new">Crear propiedad</a></section></AdminLayout>}</AdminGuard>;
}
