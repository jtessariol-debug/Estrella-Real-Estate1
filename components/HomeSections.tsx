import { ArrowRight, Building2, Compass, Handshake, Home, KeyRound, Map, ShieldCheck } from 'lucide-react';
import { PROPERTY_TYPE_LABELS } from '../constants';
import type { PropertyType } from '../types';

const categoryIcons: Record<PropertyType, typeof Home> = { apartment: Building2, house: Home, villa: KeyRound, penthouse: Building2, land: Map, commercial: Building2 };

export function PropertyCategories() {
  return <section className="section"><div className="container">
    <div className="section-head"><div><span className="eyebrow">Explora a tu manera</span><h2>Propiedades para cada visión</h2></div><p>Desde residencias urbanas hasta espacios para nuevos proyectos, encuentra la categoría que mejor responde a tus planes.</p></div>
    <div className="categories">{Object.entries(PROPERTY_TYPE_LABELS).map(([type, label]) => { const Icon = categoryIcons[type as PropertyType]; return <a className="category" href={`/propiedades?propertyType=${type}`} key={type}><Icon size={27} strokeWidth={1.4} /><div><strong>{label}</strong><ArrowRight size={17} style={{ float: 'right', marginTop: 7 }} /></div></a>; })}</div>
  </div></section>;
}

export function OperationBlocks() {
  return <section className="split-cta">
    <div className="split-panel sale-panel" style={{ backgroundImage: "url('/images/home/home-venta.jpeg')" }}><span className="eyebrow">Propiedades en venta</span><h3>Compra tu próxima propiedad</h3><p>Descubre oportunidades seleccionadas para vivir o invertir con confianza.</p><a className="button outline" href="/propiedades/venta">Ver propiedades en venta</a></div>
    <div className="split-panel rent-panel" style={{ backgroundImage: "url('/images/home/home-alquiler.jpeg')" }}><span className="eyebrow">Propiedades en alquiler</span><h3>Encuentra un lugar que se sienta tuyo</h3><p>Opciones de alquiler pensadas para tu estilo de vida y tus próximos pasos.</p><a className="button outline" href="/propiedades/alquiler">Ver alquileres</a></div>
  </section>;
}

const benefits = [
  [Handshake, 'Atención personalizada', 'Te escuchamos y acompañamos durante cada decisión de compra, venta o alquiler.'],
  [ShieldCheck, 'Propiedades seleccionadas', 'Presentamos opciones cuidadosamente elegidas y comunicadas con claridad.'],
  [Compass, 'Conocimiento del mercado', 'Te orientamos con una mirada cercana al mercado inmobiliario dominicano.'],
  [KeyRound, 'Acompañamiento integral', 'Coordinamos contigo cada etapa para que el proceso resulte claro y eficiente.'],
] as const;

export function Benefits() {
  return <section className="section benefits"><div className="container"><span className="eyebrow">Nuestra forma de trabajar</span><div className="section-head"><h2>Una experiencia inmobiliaria a tu altura</h2></div><div className="benefit-grid">{benefits.map(([Icon, title, text]) => <div className="benefit" key={title}><Icon size={30} strokeWidth={1.4} /><h3>{title}</h3><p>{text}</p></div>)}</div></div></section>;
}

export function About() {
  return <section className="section" id="nosotros"><div className="container about">
    <img className="about-image" src="https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1400&q=85" alt="Interior de una residencia moderna" loading="lazy" />
    <div className="about-copy"><span className="eyebrow">Sobre nosotros</span><h2>Tu aliado inmobiliario</h2><p>En Estrella Real Estate conectamos personas con oportunidades inmobiliarias en Santiago y República Dominicana. Nuestro enfoque combina atención cercana, criterio y una presentación profesional de cada propiedad.</p><p>Ya sea que desees comprar, vender, alquilar o evaluar una inversión, te acompañamos para que avances con información clara y una estrategia alineada con tus objetivos.</p><div className="about-note"><Map size={30} color="#b59a63" /><div><strong>Santiago, República Dominicana</strong><br /><span className="muted">Conectados con el mercado local.</span></div></div></div>
  </div></section>;
}

export function CallToAction() {
  return <section className="wide-cta"><div className="container"><h2>¿Buscas comprar, vender o alquilar una propiedad?</h2><p>Permítenos ayudarte a encontrar la mejor oportunidad inmobiliaria para ti.</p><a className="button light" href="https://wa.me/18099243552" target="_blank" rel="noreferrer">Hablar por WhatsApp <ArrowRight size={17} /></a></div></section>;
}
