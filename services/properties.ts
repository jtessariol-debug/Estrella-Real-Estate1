import { requireSupabase, isSupabaseConfigured } from '../lib/supabase';
import type { OperationType, Property, PropertyFilters, PropertyImage, PropertyStatus, PropertyType, VideoProvider, VideoStatus } from '../types';

type PropertyQueryRow = {
  id: string; title: string; slug: string; description: string; price: number | string;
  currency: 'DOP' | 'USD'; operation_type: OperationType; property_type: PropertyType;
  bedrooms: number | null; bathrooms: number | string | null; parking_spaces: number | null;
  area_m2: number | string | null; city: string; sector: string | null; address: string | null;
  latitude: number | string | null; longitude: number | string | null; featured: boolean;
  published: boolean; status: PropertyStatus; created_at: string; updated_at: string;
  video_storage_path: string | null;
  video_provider: VideoProvider | null; mux_asset_id: string | null; mux_playback_id: string | null;
  video_status: VideoStatus | null; video_aspect_ratio: string | null;
  property_images: Array<{ id: string; storage_path: string; image_url: string | null; position: number; is_cover: boolean }> | null;
  property_amenities: Array<{ amenities: { name: string } | null }> | null;
};

const PROPERTY_SELECT = `
  id, title, slug, description, price, currency, operation_type, property_type,
  bedrooms, bathrooms, parking_spaces, area_m2, city, sector, address, latitude,
  longitude, featured, published, status, video_storage_path, video_provider, mux_asset_id,
  mux_playback_id, video_status, video_aspect_ratio, created_at, updated_at,
  property_images (id, storage_path, image_url, position, is_cover),
  property_amenities (amenities (name))
`;

const optionalNumber = (value: number | string | null): number | undefined => value === null ? undefined : Number(value);

export function mapSupabasePropertyToProperty(row: PropertyQueryRow): Property {
  const images: PropertyImage[] = [...(row.property_images ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((image) => ({ id: image.id, url: image.image_url ?? '', position: image.position, isCover: image.is_cover }));
  images.sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.position - b.position);

  return {
    id: row.id, title: row.title, slug: row.slug, description: row.description,
    price: Number(row.price), currency: row.currency, operationType: row.operation_type,
    propertyType: row.property_type, bedrooms: optionalNumber(row.bedrooms),
    bathrooms: optionalNumber(row.bathrooms), parkingSpaces: optionalNumber(row.parking_spaces),
    areaM2: optionalNumber(row.area_m2), city: row.city, sector: row.sector ?? undefined,
    address: row.address ?? undefined, latitude: optionalNumber(row.latitude), longitude: optionalNumber(row.longitude),
    featured: row.featured, published: row.published, status: row.status, videoStoragePath: row.video_storage_path ?? undefined,
    videoProvider: row.video_provider ?? (row.video_storage_path ? 'supabase' : undefined),
    muxAssetId: row.mux_asset_id ?? undefined, muxPlaybackId: row.mux_playback_id ?? undefined,
    videoStatus: row.video_status ?? undefined, videoAspectRatio: row.video_aspect_ratio ?? undefined, images,
    amenities: (row.property_amenities ?? []).flatMap((item) => item.amenities?.name ? [item.amenities.name] : []),
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function withSignedImageUrls(rows: PropertyQueryRow[]): Promise<PropertyQueryRow[]> {
  const paths = rows.flatMap((row) => row.property_images ?? []).map((image) => image.storage_path);
  if (!paths.length) return rows;
  const { data, error } = await requireSupabase().storage.from('property-images').createSignedUrls(paths, 3600);
  if (error) throw new Error(`No se pudieron autorizar las imágenes: ${error.message}`);
  const signedByPath = new Map(data.map((item) => [item.path, item.signedUrl]));
  return rows.map((row) => ({ ...row, property_images: row.property_images?.map((image) => ({ ...image, image_url: signedByPath.get(image.storage_path) ?? image.image_url })) ?? null }));
}

async function getSignedVideoUrl(storagePath: string): Promise<string> {
  const { data, error } = await requireSupabase().storage.from('property-videos').createSignedUrl(storagePath, 3600);
  if (error) throw new Error(`No se pudo autorizar el video: ${error.message}`);
  return data.signedUrl;
}

async function filterMocks(filters: PropertyFilters): Promise<Property[]> {
  const { MOCK_PROPERTIES } = await import('../data/mockProperties');
  const location = filters.location?.trim().toLocaleLowerCase('es');
  return MOCK_PROPERTIES.filter((property) => property.published && !['draft', 'inactive'].includes(property.status)).filter((property) => {
    const searchableLocation = `${property.sector ?? ''} ${property.city}`.toLocaleLowerCase('es');
    return (!filters.operationType || property.operationType === filters.operationType)
      && (!filters.propertyType || property.propertyType === filters.propertyType)
      && (!location || searchableLocation.includes(location))
      && (!filters.city || property.city.toLocaleLowerCase('es').includes(filters.city.toLocaleLowerCase('es')))
      && (!filters.sector || property.sector?.toLocaleLowerCase('es').includes(filters.sector.toLocaleLowerCase('es')))
      && (filters.featured === undefined || property.featured === filters.featured)
      && (filters.minPrice === undefined || property.price >= filters.minPrice)
      && (filters.maxPrice === undefined || property.price <= filters.maxPrice)
      && (filters.bedrooms === undefined || (property.bedrooms ?? 0) >= filters.bedrooms)
      && (filters.bathrooms === undefined || (property.bathrooms ?? 0) >= filters.bathrooms);
  });
}

async function useDevelopmentFallback(filters: PropertyFilters): Promise<Property[] | null> {
  return !isSupabaseConfigured && import.meta.env.DEV ? filterMocks(filters) : null;
}

export async function searchProperties(filters: PropertyFilters = {}): Promise<Property[]> {
  const fallback = await useDevelopmentFallback(filters);
  if (fallback) return fallback;
  const client = requireSupabase();
  let query = client.from('properties').select(PROPERTY_SELECT)
    .eq('published', true).in('status', ['available', 'reserved', 'sold', 'rented'])
    .order('created_at', { ascending: false })
    .order('position', { referencedTable: 'property_images', ascending: true });
  if (filters.operationType) query = query.eq('operation_type', filters.operationType);
  if (filters.propertyType) query = query.eq('property_type', filters.propertyType);
  if (filters.city) query = query.ilike('city', `%${filters.city}%`);
  if (filters.sector) query = query.ilike('sector', `%${filters.sector}%`);
  if (filters.featured !== undefined) query = query.eq('featured', filters.featured);
  if (filters.location) {
    const safeLocation = filters.location.replace(/[%(),]/g, '').trim();
    if (safeLocation) query = query.or(`city.ilike.%${safeLocation}%,sector.ilike.%${safeLocation}%`);
  }
  if (filters.minPrice !== undefined) query = query.gte('price', filters.minPrice);
  if (filters.maxPrice !== undefined) query = query.lte('price', filters.maxPrice);
  if (filters.bedrooms !== undefined) query = query.gte('bedrooms', filters.bedrooms);
  if (filters.bathrooms !== undefined) query = query.gte('bathrooms', filters.bathrooms);
  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron cargar las propiedades: ${error.message}`);
  return (await withSignedImageUrls((data ?? []) as unknown as PropertyQueryRow[])).map(mapSupabasePropertyToProperty);
}

export const getProperties = searchProperties;

export async function getFeaturedProperties(): Promise<Property[]> {
  return searchProperties({ featured: true });
}

export async function getPropertyBySlug(slug: string): Promise<Property | undefined> {
  if (!isSupabaseConfigured && import.meta.env.DEV) return (await filterMocks({})).find((property) => property.slug === slug);
  const { data, error } = await requireSupabase().from('properties').select(PROPERTY_SELECT)
    .eq('slug', slug).eq('published', true).in('status', ['available', 'reserved', 'sold', 'rented'])
    .order('position', { referencedTable: 'property_images', ascending: true }).maybeSingle();
  if (error) throw new Error(`No se pudo cargar la propiedad: ${error.message}`);
  if (!data) return undefined;
  const [row] = await withSignedImageUrls([data as unknown as PropertyQueryRow]);
  const property = mapSupabasePropertyToProperty(row);
  if ((row.video_provider === 'supabase' || (!row.video_provider && row.video_storage_path)) && row.video_storage_path) property.videoUrl = await getSignedVideoUrl(row.video_storage_path);
  return property;
}

export async function getPropertiesByOperation(operation: OperationType): Promise<Property[]> {
  return searchProperties({ operationType: operation });
}

export async function getPropertiesByType(propertyType: PropertyType): Promise<Property[]> {
  return searchProperties({ propertyType });
}
