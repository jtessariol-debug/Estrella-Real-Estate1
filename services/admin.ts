import { requireSupabase } from '../lib/supabase';
import type { AdminProperty, AdminPropertyImage, Amenity, PropertyInput, PropertyStatus, PropertyType } from '../types';
import { getStorageErrorDiagnostic, getVideoContentType, getVideoUploadErrorMessage, validatePropertyVideo } from '../utils/video';

export type AdminPropertySummary = {
  id: string; title: string; slug: string; price: number; currency: 'DOP' | 'USD';
  operationType: 'sale' | 'rent'; propertyType: PropertyType; status: PropertyStatus;
  published: boolean; featured: boolean; createdAt: string; coverUrl?: string;
};
export type DashboardStats = { properties: number; published: number; drafts: number; featured: number };

type ImageRow = { id: string; storage_path: string; image_url: string | null; position: number; is_cover: boolean };
type AdminRow = {
  id: string; title: string; slug: string; description: string; price: number | string;
  currency: 'DOP' | 'USD'; operation_type: 'sale' | 'rent'; property_type: PropertyType;
  bedrooms: number | null; bathrooms: number | string | null; parking_spaces: number | null;
  area_m2: number | string | null; city: string; sector: string | null; address: string | null;
  latitude: number | string | null; longitude: number | string | null; featured: boolean;
  published: boolean; status: PropertyStatus; created_at: string; updated_at: string;
  video_storage_path: string | null;
  property_images: ImageRow[] | null; property_amenities: Array<{ amenity_id: string }> | null;
};

const toOptionalNumber = (value: number | string | null) => value === null ? undefined : Number(value);
const propertyPayload = (input: PropertyInput) => ({
  title: input.title.trim(), slug: input.slug.trim(), description: input.description.trim(), price: input.price,
  currency: input.currency, operation_type: input.operationType, property_type: input.propertyType,
  bedrooms: input.bedrooms ?? null, bathrooms: input.bathrooms ?? null, parking_spaces: input.parkingSpaces ?? null,
  area_m2: input.areaM2 ?? null, city: input.city.trim(), sector: input.sector?.trim() || null,
  address: input.address?.trim() || null, latitude: input.latitude ?? null, longitude: input.longitude ?? null,
  featured: input.featured, published: input.published, status: input.status,
});

function adminError(error: { code?: string; message: string }, fallback: string): Error {
  if (error.code === '23505' && error.message.includes('slug')) return new Error('Ya existe una propiedad con este slug.');
  if (import.meta.env.DEV) console.error('Supabase admin error:', error.code, error.message);
  return new Error(fallback);
}

async function signImageRows(rows: ImageRow[]): Promise<AdminPropertyImage[]> {
  const ordered = [...rows].sort((a, b) => a.position - b.position);
  if (!ordered.length) return [];
  const { data, error } = await requireSupabase().storage.from('property-images').createSignedUrls(ordered.map((image) => image.storage_path), 3600);
  if (error) throw adminError(error, 'No pudimos cargar las fotografías.');
  const signed = new Map(data.map((item) => [item.path, item.signedUrl]));
  return ordered.map((image) => ({ id: image.id, storagePath: image.storage_path, url: signed.get(image.storage_path) ?? image.image_url ?? '', position: image.position, isCover: image.is_cover }));
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const client = requireSupabase();
  const results = await Promise.all([
    client.from('properties').select('*', { count: 'exact', head: true }),
    client.from('properties').select('*', { count: 'exact', head: true }).eq('published', true),
    client.from('properties').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
    client.from('properties').select('*', { count: 'exact', head: true }).eq('featured', true),
  ]);
  const error = results.find((result) => result.error)?.error;
  if (error) throw adminError(error, 'No pudimos cargar las métricas.');
  return { properties: results[0].count ?? 0, published: results[1].count ?? 0, drafts: results[2].count ?? 0, featured: results[3].count ?? 0 };
}

export async function getAdminProperties(): Promise<AdminPropertySummary[]> {
  const { data, error } = await requireSupabase().from('properties')
    .select('id, title, slug, price, currency, operation_type, property_type, status, published, featured, created_at, property_images(storage_path, image_url, is_cover, position)')
    .order('created_at', { ascending: false }).order('position', { referencedTable: 'property_images', ascending: true });
  if (error) throw adminError(error, 'No pudimos cargar las propiedades.');
  type Row = Omit<AdminRow, 'description' | 'bedrooms' | 'bathrooms' | 'parking_spaces' | 'area_m2' | 'city' | 'sector' | 'address' | 'latitude' | 'longitude' | 'video_storage_path' | 'updated_at' | 'property_amenities'>;
  const rows = (data ?? []) as unknown as Row[];
  const paths = rows.flatMap((row) => { const cover = row.property_images?.find((image) => image.is_cover) ?? row.property_images?.[0]; return cover ? [cover.storage_path] : []; });
  const signed = new Map<string, string>();
  if (paths.length) {
    const response = await requireSupabase().storage.from('property-images').createSignedUrls(paths, 3600);
    if (response.error) throw adminError(response.error, 'No pudimos cargar las portadas.');
    response.data.forEach((item) => signed.set(item.path, item.signedUrl));
  }
  return rows.map((row) => { const cover = row.property_images?.find((image) => image.is_cover) ?? row.property_images?.[0]; return { id: row.id, title: row.title, slug: row.slug, price: Number(row.price), currency: row.currency, operationType: row.operation_type, propertyType: row.property_type, status: row.status, published: row.published, featured: row.featured, createdAt: row.created_at, coverUrl: cover ? signed.get(cover.storage_path) ?? cover.image_url ?? undefined : undefined }; });
}

export async function getAdminPropertyById(id: string): Promise<AdminProperty | undefined> {
  const { data, error } = await requireSupabase().from('properties').select(`
    id, title, slug, description, price, currency, operation_type, property_type, bedrooms, bathrooms,
    parking_spaces, area_m2, city, sector, address, latitude, longitude, featured, published, status,
    video_storage_path, created_at, updated_at, property_images(id, storage_path, image_url, position, is_cover),
    property_amenities(amenity_id)
  `).eq('id', id).order('position', { referencedTable: 'property_images', ascending: true }).maybeSingle();
  if (error) throw adminError(error, 'No pudimos cargar la propiedad.');
  if (!data) return undefined;
  const row = data as unknown as AdminRow;
  return { id: row.id, title: row.title, slug: row.slug, description: row.description, price: Number(row.price), currency: row.currency, operationType: row.operation_type, propertyType: row.property_type, bedrooms: toOptionalNumber(row.bedrooms), bathrooms: toOptionalNumber(row.bathrooms), parkingSpaces: toOptionalNumber(row.parking_spaces), areaM2: toOptionalNumber(row.area_m2), city: row.city, sector: row.sector ?? undefined, address: row.address ?? undefined, latitude: toOptionalNumber(row.latitude), longitude: toOptionalNumber(row.longitude), featured: row.featured, published: row.published, status: row.status, videoStoragePath: row.video_storage_path ?? undefined, videoUrl: row.video_storage_path ? await getPropertyVideoSignedUrl(row.video_storage_path) : undefined, images: await signImageRows(row.property_images ?? []), amenityIds: (row.property_amenities ?? []).map((item) => item.amenity_id), createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function createProperty(input: PropertyInput): Promise<string> {
  const { data: userData, error: userError } = await requireSupabase().auth.getUser();
  if (userError || !userData.user) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
  const { data, error } = await requireSupabase().from('properties').insert({ ...propertyPayload(input), created_by: userData.user.id }).select('id').single();
  if (error) throw adminError(error, 'No pudimos crear la propiedad.');
  return (data as { id: string }).id;
}

export async function updateProperty(id: string, input: PropertyInput): Promise<void> {
  const { error } = await requireSupabase().from('properties').update(propertyPayload(input)).eq('id', id);
  if (error) throw adminError(error, 'No pudimos guardar los cambios.');
}

export async function getAmenities(): Promise<Amenity[]> {
  const { data, error } = await requireSupabase().from('amenities').select('id, name, slug').order('name');
  if (error) throw adminError(error, 'No pudimos cargar las amenidades.');
  return (data ?? []) as Amenity[];
}

export async function setPropertyAmenities(propertyId: string, amenityIds: string[]): Promise<void> {
  const client = requireSupabase();
  const currentResult = await client.from('property_amenities').select('amenity_id').eq('property_id', propertyId);
  if (currentResult.error) throw adminError(currentResult.error, 'No pudimos comprobar las amenidades actuales.');
  const current = ((currentResult.data ?? []) as Array<{ amenity_id: string }>).map((item) => item.amenity_id);
  const toAdd = amenityIds.filter((id) => !current.includes(id));
  const toRemove = current.filter((id) => !amenityIds.includes(id));
  if (toAdd.length) {
    const inserted = await client.from('property_amenities').insert(toAdd.map((amenityId) => ({ property_id: propertyId, amenity_id: amenityId })));
    if (inserted.error) throw adminError(inserted.error, 'La propiedad se guardó, pero no pudimos asociar todas las amenidades.');
  }
  if (toRemove.length) {
    const deleted = await client.from('property_amenities').delete().eq('property_id', propertyId).in('amenity_id', toRemove);
    if (deleted.error) throw adminError(deleted.error, 'Añadimos las nuevas amenidades, pero no pudimos retirar algunas selecciones anteriores.');
  }
}

const sanitizeFileName = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');

export async function uploadPropertyImage(propertyId: string, file: File, position: number, isCover: boolean): Promise<void> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const base = sanitizeFileName(file.name.replace(/\.[^.]+$/, '')) || 'property-image';
  const path = `properties/${propertyId}/${Date.now()}-${crypto.randomUUID()}-${base}.${extension}`;
  const storage = requireSupabase().storage.from('property-images');
  const uploaded = await storage.upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (uploaded.error) throw adminError(uploaded.error, `No pudimos subir ${file.name}.`);
  const inserted = await requireSupabase().from('property_images').insert({ property_id: propertyId, storage_path: path, image_url: null, position, is_cover: isCover });
  if (inserted.error) { await storage.remove([path]); throw adminError(inserted.error, `La imagen ${file.name} se subió, pero no pudimos registrarla.`); }
}

export async function getPropertyVideoSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await requireSupabase().storage.from('property-videos').createSignedUrl(storagePath, 3600);
  if (error) throw adminError(error, 'No pudimos cargar el video de la propiedad.');
  return data.signedUrl;
}

export async function uploadPropertyVideo(propertyId: string, file: File, previousPath?: string): Promise<{ storagePath: string; signedUrl: string; cleanupWarning?: string }> {
  const extension = validatePropertyVideo(file);
  const contentType = getVideoContentType(extension);
  const base = sanitizeFileName(file.name.replace(/\.[^.]+$/, '')) || 'property-tour';
  const path = `properties/${propertyId}/${Date.now()}-${crypto.randomUUID()}-${base}.${extension}`;
  const storage = requireSupabase().storage.from('property-videos');
  const uploaded = await storage.upload(path, file, { cacheControl: '3600', upsert: false, contentType });
  if (uploaded.error) {
    const diagnostic = getStorageErrorDiagnostic(uploaded.error);
    console.error('Supabase property video upload failed', { bucket: 'property-videos', path, contentType, ...diagnostic });
    throw new Error(getVideoUploadErrorMessage(diagnostic, extension));
  }
  let signedUrl: string;
  try {
    signedUrl = await getPropertyVideoSignedUrl(path);
  } catch (reason) {
    await storage.remove([path]);
    throw reason;
  }
  const updated = await requireSupabase().from('properties').update({ video_storage_path: path }).eq('id', propertyId).select('id').maybeSingle();
  if (updated.error || !updated.data) { await storage.remove([path]); throw adminError(updated.error ?? new Error('No se encontró la propiedad.'), 'El video se subió, pero no pudimos asociarlo a la propiedad.'); }
  let cleanupWarning: string | undefined;
  if (previousPath && previousPath !== path) {
    const removed = await storage.remove([previousPath]);
    if (removed.error) cleanupWarning = 'El nuevo video quedó asociado correctamente, pero el archivo anterior no pudo limpiarse de Storage.';
  }
  return { storagePath: path, signedUrl, cleanupWarning };
}

export async function replacePropertyVideo(propertyId: string, oldPath: string, newFile: File) {
  return uploadPropertyVideo(propertyId, newFile, oldPath);
}

export async function deletePropertyVideo(propertyId: string, storagePath: string): Promise<void> {
  const storage = requireSupabase().storage.from('property-videos');
  const client = requireSupabase();
  const updated = await client.from('properties').update({ video_storage_path: null }).eq('id', propertyId).eq('video_storage_path', storagePath).select('id').maybeSingle();
  if (updated.error || !updated.data) throw adminError(updated.error ?? new Error('No se encontró el video asociado.'), 'No pudimos desvincular el video de la propiedad. No se eliminó ningún archivo.');
  const removed = await storage.remove([storagePath]);
  if (!removed.error) return;
  const restored = await client.from('properties').update({ video_storage_path: storagePath }).eq('id', propertyId).is('video_storage_path', null);
  if (restored.error) throw adminError(restored.error, 'No pudimos eliminar el video y tampoco restaurar su referencia. Revisa la propiedad antes de continuar.');
  throw adminError(removed.error, 'No pudimos eliminar el video de Storage. La propiedad conserva el video anterior.');
}

export async function setCoverImage(propertyId: string, imageId: string): Promise<void> {
  const client = requireSupabase();
  const cleared = await client.from('property_images').update({ is_cover: false }).eq('property_id', propertyId);
  if (cleared.error) throw adminError(cleared.error, 'No pudimos cambiar la portada.');
  const selected = await client.from('property_images').update({ is_cover: true }).eq('id', imageId).eq('property_id', propertyId);
  if (selected.error) throw adminError(selected.error, 'La portada anterior se desmarcó, pero no pudimos asignar la nueva.');
}

export async function reorderPropertyImages(propertyId: string, orderedImageIds: string[]): Promise<void> {
  const client = requireSupabase();
  const results = await Promise.all(orderedImageIds.map((id, position) => client.from('property_images').update({ position }).eq('id', id).eq('property_id', propertyId)));
  const error = results.find((result) => result.error)?.error;
  if (error) throw adminError(error, 'No pudimos guardar el nuevo orden de fotografías.');
}

export async function deletePropertyImage(propertyId: string, image: AdminPropertyImage): Promise<void> {
  const storageResult = await requireSupabase().storage.from('property-images').remove([image.storagePath]);
  if (storageResult.error) throw adminError(storageResult.error, 'No pudimos eliminar el archivo de Storage. No se modificó el registro.');
  const dbResult = await requireSupabase().from('property_images').delete().eq('id', image.id).eq('property_id', propertyId);
  if (dbResult.error) throw adminError(dbResult.error, 'El archivo se eliminó, pero no pudimos eliminar su registro. Revisa la propiedad antes de continuar.');
  const { data, error } = await requireSupabase().from('property_images').select('id, is_cover').eq('property_id', propertyId).order('position');
  if (error) throw adminError(error, 'La imagen se eliminó, pero no pudimos normalizar la galería.');
  const remaining = (data ?? []) as Array<{ id: string; is_cover: boolean }>;
  await reorderPropertyImages(propertyId, remaining.map((item) => item.id));
  if (remaining.length && !remaining.some((item) => item.is_cover)) await setCoverImage(propertyId, remaining[0].id);
}

export async function archiveProperty(id: string): Promise<void> {
  const { error } = await requireSupabase().from('properties').update({ status: 'inactive', published: false }).eq('id', id);
  if (error) throw adminError(error, 'No pudimos archivar la propiedad.');
}

export async function deleteProperty(id: string): Promise<void> {
  const client = requireSupabase();
  const [images, propertyResult] = await Promise.all([
    client.from('property_images').select('storage_path').eq('property_id', id),
    client.from('properties').select('video_storage_path').eq('id', id).maybeSingle(),
  ]);
  if (images.error) throw adminError(images.error, 'No pudimos preparar la eliminación.');
  if (propertyResult.error) throw adminError(propertyResult.error, 'No pudimos comprobar el video de la propiedad.');
  const paths = ((images.data ?? []) as Array<{ storage_path: string }>).map((image) => image.storage_path);
  if (paths.length) {
    const removed = await client.storage.from('property-images').remove(paths);
    if (removed.error) throw adminError(removed.error, 'No pudimos eliminar los archivos. La propiedad no fue eliminada.');
  }
  const videoPath = (propertyResult.data as { video_storage_path: string | null } | null)?.video_storage_path;
  if (videoPath) {
    const removedVideo = await client.storage.from('property-videos').remove([videoPath]);
    if (removedVideo.error) throw adminError(removedVideo.error, 'Las imágenes se eliminaron, pero no pudimos borrar el video. La propiedad se conserva para revisión.');
  }
  const deleted = await client.from('properties').delete().eq('id', id);
  if (deleted.error) throw adminError(deleted.error, 'Los archivos se eliminaron, pero no pudimos borrar la propiedad. Revisa el catálogo.');
}
