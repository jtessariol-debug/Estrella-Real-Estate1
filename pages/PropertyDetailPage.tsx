import { useEffect, useState } from 'react';
import { Bath, BedDouble, Car, Check, MapPin, Ruler } from 'lucide-react';
import type { Property } from '../types';
import { getPropertyBySlug } from '../services/properties';
import { formatPrice } from '../utils/format';
import { COMPANY_INFO, PROPERTY_TYPE_LABELS } from '../constants';
import PropertyGallery from '../components/PropertyGallery';

const videoMimeType = (path?: string) => path?.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4';

export default function PropertyDetailPage({ slug }: { slug: string }) {
  const [property, setProperty] = useState<Property | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [videoDimensions, setVideoDimensions] = useState({ width: 9, height: 16 });
  useEffect(() => { void getPropertyBySlug(slug).then((result) => setProperty(result ?? null)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.')); }, [slug]);
  if (error) return <div className="not-found"><h1 className="serif">No pudimos cargar la propiedad</h1><p className="muted">{error}</p><a className="button" href="/propiedades">Volver a propiedades</a></div>;
  if (property === undefined) return <div className="not-found">Cargando propiedad…</div>;
  if (property === null) return <div className="not-found"><h1 className="serif">Propiedad no encontrada</h1><a className="button" href="/propiedades">Ver propiedades</a></div>;
  const message = encodeURIComponent(`Hola, me interesa la propiedad: ${property.title}`);
  return <main className="detail"><div className="container">
    <PropertyGallery images={property.images} propertyTitle={property.title} />
    {property.videoUrl && <section className="property-video"><div className="property-video-copy"><span className="eyebrow">Conoce cada espacio</span><h2>Recorrido en video</h2><p>Explora esta propiedad con mayor detalle antes de coordinar tu visita.</p></div><div className="property-video-media" style={{ aspectRatio: `${videoDimensions.width} / ${videoDimensions.height}`, width: videoDimensions.width > videoDimensions.height ? 'min(100%, 720px)' : undefined }}><video controls playsInline preload="metadata" onLoadedMetadata={(event) => { const video = event.currentTarget; if (video.videoWidth && video.videoHeight) setVideoDimensions({ width: video.videoWidth, height: video.videoHeight }); }} aria-label={`Recorrido en video de ${property.title}`}><source src={property.videoUrl} type={videoMimeType(property.videoStoragePath)} />Tu navegador no puede reproducir este video.</video></div></section>}
    <div className="detail-main"><div><span className="eyebrow">{PROPERTY_TYPE_LABELS[property.propertyType]} · {property.operationType === 'sale' ? 'Venta' : 'Alquiler'}</span><h1>{property.title}</h1><div className="location"><MapPin size={17} /> {[property.sector, property.city].filter(Boolean).join(', ')}</div><div className="features"><span><BedDouble /> {property.bedrooms} habitaciones</span><span><Bath /> {property.bathrooms} baños</span><span><Car /> {property.parkingSpaces} parqueos</span><span><Ruler /> {property.areaM2} m²</span></div><h2 className="serif">Sobre esta propiedad</h2><p>{property.description}</p><h2 className="serif">Amenidades</h2><div className="amenities">{property.amenities?.map((item) => <span key={item}><Check size={16} color="#b59a63" /> {item}</span>)}</div></div>
      <aside className="inquiry"><span className="eyebrow">Precio</span><h2 className="serif">{formatPrice(property.price, property.currency)}</h2><p>¿Quieres conocer más detalles o coordinar una visita?</p><a className="button" style={{ width: '100%' }} href={`${COMPANY_INFO.whatsappUrl}?text=${message}`} target="_blank" rel="noreferrer">Consultar por WhatsApp</a></aside>
    </div>
  </div></main>;
}
