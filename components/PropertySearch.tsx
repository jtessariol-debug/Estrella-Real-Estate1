import { useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { PROPERTY_TYPE_LABELS } from '../constants';
import type { OperationType, PropertyFilters, PropertyType } from '../types';

export default function PropertySearch({ onSearch, initialFilters = {} }: { onSearch?: (filters: PropertyFilters) => void; initialFilters?: PropertyFilters }) {
  const [filters, setFilters] = useState<PropertyFilters>({ ...initialFilters, operationType: initialFilters.operationType || 'sale' });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (onSearch) return onSearch(filters);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value !== '' && value !== undefined) params.set(key, String(value)); });
    window.location.href = `/propiedades?${params.toString()}`;
  };
  return <div className="search-wrap"><div className="container">
    <form className="search-panel" onSubmit={submit}>
      <div className="field"><label htmlFor="operation">Operación</label><select id="operation" value={filters.operationType} onChange={(e) => setFilters({ ...filters, operationType: e.target.value as OperationType })}><option value="sale">Comprar</option><option value="rent">Alquilar</option></select></div>
      <div className="field"><label htmlFor="type">Tipo</label><select id="type" value={filters.propertyType ?? ''} onChange={(e) => setFilters({ ...filters, propertyType: e.target.value as PropertyType | '' })}><option value="">Todos</option>{Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="field"><label htmlFor="location">Ciudad o sector</label><input id="location" placeholder="Ej. Santiago" value={filters.location ?? ''} onChange={(e) => setFilters({ ...filters, location: e.target.value })} /></div>
      <div className="field"><label htmlFor="min">Precio mínimo</label><input id="min" type="number" min="0" placeholder="Sin mínimo" onChange={(e) => setFilters({ ...filters, minPrice: e.target.value ? Number(e.target.value) : undefined })} /></div>
      <div className="field"><label htmlFor="max">Precio máximo</label><input id="max" type="number" min="0" placeholder="Sin máximo" onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value ? Number(e.target.value) : undefined })} /></div>
      <button className="button" type="submit"><Search size={16} /> Buscar</button>
    </form>
  </div></div>;
}
