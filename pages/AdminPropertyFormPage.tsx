import { useEffect, useState } from 'react';
import AdminGuard from '../components/AdminGuard';
import AdminLayout from '../components/AdminLayout';
import PropertyForm from '../components/admin/PropertyForm';
import { getAdminPropertyById } from '../services/admin';
import type { AdminProperty, Profile } from '../types';

function NewProperty({ profile }: { profile: Profile }) {
  return <AdminLayout profile={profile}><header className="admin-page-head"><div><span className="eyebrow">Nueva propiedad</span><h1>Crear propiedad</h1><p>Completa la información y guárdala como borrador o publícala.</p></div></header><PropertyForm /></AdminLayout>;
}

function EditProperty({ profile, id }: { profile: Profile; id: string }) {
  const [property, setProperty] = useState<AdminProperty | null | undefined>(undefined); const [error, setError] = useState<string | null>(null);
  useEffect(() => { void getAdminPropertyById(id).then((result) => setProperty(result ?? null)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No pudimos cargar la propiedad.')); }, [id]);
  return <AdminLayout profile={profile}>{error ? <div className="admin-not-found"><h1>No pudimos cargar la propiedad</h1><p>{error}</p><a className="button" href="/admin/properties">Volver al listado</a></div> : property === undefined ? <p>Cargando propiedad…</p> : property === null ? <div className="admin-not-found"><h1>Propiedad no encontrada</h1><p>El registro solicitado no existe o ya fue eliminado.</p><a className="button" href="/admin/properties">Volver al listado</a></div> : <><header className="admin-page-head"><div><span className="eyebrow">Editar propiedad</span><h1>{property.title}</h1><p>Actualiza el contenido, la visibilidad y las fotografías.</p></div></header><PropertyForm initial={property} /></>}</AdminLayout>;
}

export default function AdminPropertyFormPage({ id }: { id?: string }) {
  return <AdminGuard>{(profile) => id ? <EditProperty profile={profile} id={id} /> : <NewProperty profile={profile} />}</AdminGuard>;
}
