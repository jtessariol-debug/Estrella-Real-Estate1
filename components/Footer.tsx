import { COMPANY_INFO } from '../constants';

export default function Footer() {
  return <footer className="footer"><div className="container"><div className="footer-grid">
    <div className="footer-brand-column"><a className="logo footer-brand" href="/"><img src={COMPANY_INFO.logoUrl} alt="Estrella Real Estate" /><span>ESTRELLA<br />REAL ESTATE</span></a><p className="footer-description">Propiedades seleccionadas y acompañamiento inmobiliario en República Dominicana.</p><p className="footer-location">{COMPANY_INFO.location}</p></div>
    <div><h4>Navegación</h4><a href="/">Inicio</a><a href="/nosotros">Nosotros</a><a href="/contacto">Contacto</a></div>
    <div><h4>Propiedades</h4><a href="/propiedades">Todas</a><a href="/propiedades/venta">En venta</a><a href="/propiedades/alquiler">En alquiler</a></div>
    <div><h4>Contacto</h4><a href={COMPANY_INFO.whatsappUrl}>{COMPANY_INFO.phone}</a><a href={`mailto:${COMPANY_INFO.email}`}>{COMPANY_INFO.email}</a></div>
  </div><div className="footer-bottom">© {new Date().getFullYear()} Estrella Real Estate. Todos los derechos reservados.</div></div></footer>;
}
