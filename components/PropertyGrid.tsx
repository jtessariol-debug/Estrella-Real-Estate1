import type { Property } from '../types';
import PropertyCard from './PropertyCard';

export default function PropertyGrid({ properties, onClear }: { properties: Property[]; onClear?: () => void }) {
  if (!properties.length) return <div className="empty property-empty"><h3 className="serif">No encontramos propiedades con estos filtros</h3><p className="muted">Prueba cambiando la ubicación o el rango de precio.</p>{onClear && <button className="button outline dark" type="button" onClick={onClear}>Limpiar filtros</button>}</div>;
  return <div className={`cards ${properties.length === 1 ? 'single' : ''}`}>{properties.map((property) => <PropertyCard key={property.id} property={property} />)}</div>;
}
