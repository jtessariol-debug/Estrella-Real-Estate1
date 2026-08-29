import { useEffect, useState } from 'react';
import type { Property } from '../types';
import { getFeaturedProperties } from '../services/properties';
import Hero from '../components/Hero';
import PropertySearch from '../components/PropertySearch';
import PropertyGrid from '../components/PropertyGrid';
import { Benefits, CallToAction, OperationBlocks, PropertyCategories } from '../components/HomeSections';
import Contact from '../components/Contact';
import DataState from '../components/DataState';
import AgentSection from '../components/AgentSection';

export default function HomePage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void getFeaturedProperties().then(setProperties).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.')).finally(() => setLoading(false)); }, []);
  return <>
    <Hero /><PropertySearch compactMobile />
    <section className="section featured-section" id="propiedades"><div className="container"><div className="section-head"><div><span className="eyebrow">Selección Estrella</span><h2>Propiedades<br />destacadas</h2></div><p>Una selección de espacios con ubicación, diseño y potencial para encontrar la opción que encaje contigo.</p></div><DataState loading={loading} error={error} />{!loading && !error && <PropertyGrid properties={properties} />}<div className="featured-footer"><a className="card-link" href="/propiedades">Ver todas las propiedades <span>→</span></a></div></div></section>
    <PropertyCategories /><OperationBlocks /><Benefits /><AgentSection /><CallToAction /><Contact />
  </>;
}
