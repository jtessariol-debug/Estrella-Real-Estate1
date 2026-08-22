import { AlertCircle } from 'lucide-react';

export default function DataState({ loading, error }: { loading: boolean; error: string | null }) {
  if (!loading && !error) return null;
  if (loading) return <div className="cards skeleton-grid" role="status" aria-label="Cargando propiedades">{[0, 1, 2].map((item) => <div className="property-skeleton" key={item}><span className="skeleton-image" /><span className="skeleton-line price" /><span className="skeleton-line title" /><span className="skeleton-line meta" /><span className="skeleton-line features-line" /></div>)}</div>;
  return <div className={`data-state ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
    <AlertCircle />
    <div><strong>No pudimos cargar las propiedades</strong><p>{error}</p></div>
  </div>;
}
