import { ArrowUpRight, Bath, BedDouble, Car, MapPin, Ruler } from 'lucide-react';
import type { Property } from '../types';
import { formatPrice, getCoverImage } from '../utils/format';

export default function PropertyCard({ property }: { property: Property }) {
  const statusLabel = property.status === 'reserved' ? 'Reservada' : property.status === 'sold' ? 'Vendida' : property.status === 'rented' ? 'Alquilada' : null;
  return <article className="card">
    <a className="card-image" href={`/propiedad/${property.slug}`} aria-label={`Ver ${property.title}`}>
      <img src={getCoverImage(property)} alt={property.title} loading="lazy" />
      <div className="badges"><span className="badge">{property.operationType === 'sale' ? 'Venta' : 'Alquiler'}</span>{property.featured && <span className="badge gold">Destacada</span>}{statusLabel && <span className="badge status">{statusLabel}</span>}</div>
    </a>
    <div className="card-body">
      <p className="card-price">{formatPrice(property.price, property.currency)}{property.operationType === 'rent' && <small> / mes</small>}</p>
      <h3><a href={`/propiedad/${property.slug}`}>{property.title}</a></h3>
      <div className="location"><MapPin size={15} /> {[property.sector, property.city].filter(Boolean).join(', ')}</div>
      <div className="features">
        {property.bedrooms !== undefined && <span><BedDouble size={17} /> {property.bedrooms} hab.</span>}
        {property.bathrooms !== undefined && <span><Bath size={17} /> {property.bathrooms} baños</span>}
        {property.parkingSpaces !== undefined && <span><Car size={17} /> {property.parkingSpaces} pq.</span>}
        {property.areaM2 !== undefined && <span><Ruler size={17} /> {property.areaM2} m²</span>}
      </div>
      <a className="card-link" href={`/propiedad/${property.slug}`}>Ver propiedad <ArrowUpRight size={17} /></a>
    </div>
  </article>;
}
