import { useEffect, useMemo, useState } from 'react';
import PropertyGrid from '../components/PropertyGrid';
import PropertySearch from '../components/PropertySearch';
import { getProperties } from '../services/properties';
import type { OperationType, Property, PropertyFilters, PropertyType } from '../types';
import DataState from '../components/DataState';

export default function PropertiesPage({ operation }: { operation?: OperationType }) {
  const queryFilters = useMemo<PropertyFilters>(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      operationType: operation ?? (params.get('operationType') as OperationType | null) ?? '',
      propertyType: (params.get('propertyType') as PropertyType | null) ?? '',
      location: params.get('location') ?? '',
      minPrice: params.get('minPrice') ? Number(params.get('minPrice')) : undefined,
      maxPrice: params.get('maxPrice') ? Number(params.get('maxPrice')) : undefined,
    };
  }, [operation]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [filters, setFilters] = useState(queryFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setLoading(true); setError(null); void getProperties(filters).then(setProperties).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.')).finally(() => setLoading(false)); }, [filters]);
  const title = operation === 'sale' ? 'Propiedades en venta' : operation === 'rent' ? 'Propiedades en alquiler' : 'Encuentra tu propiedad';
  return <><section className="listing-hero"><div className="container"><span className="eyebrow">Estrella Real Estate</span><h1>{title}</h1><p className="muted">Explora nuestra selección y filtra según lo que necesitas.</p></div></section><PropertySearch initialFilters={queryFilters} onSearch={(next) => setFilters({ ...next, operationType: operation ?? next.operationType })} /><section className="listing-grid"><div className="container"><DataState loading={loading} error={error} />{!loading && !error && <><div className="results-bar"><p>{properties.length} {properties.length === 1 ? 'propiedad disponible' : 'propiedades disponibles'}</p><span>Catálogo actualizado</span></div><PropertyGrid properties={properties} onClear={() => { window.location.href = window.location.pathname; }} /></>}</div></section></>;
}
