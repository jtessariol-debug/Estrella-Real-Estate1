import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { COMPANY_INFO } from '../constants';
import BrandLogo from './BrandLogo';

const links = [
  ['Inicio', '/'], ['Propiedades', '/propiedades'], ['Venta', '/propiedades/venta'],
  ['Alquiler', '/propiedades/alquiler'], ['Nosotros', '/nosotros'], ['Contacto', '/contacto'],
];

export default function Header({ inner = false }: { inner?: boolean }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll(); window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => { document.body.classList.toggle('menu-open', open); return () => document.body.classList.remove('menu-open'); }, [open]);

  return <header className={`header ${inner ? 'inner' : ''} ${scrolled ? 'scrolled' : ''}`}>
    <div className="container nav">
      <a className="logo" href="/" aria-label="Estrella Real Estate, inicio">
        <BrandLogo className="brand-logo-header" transparent />
      </a>
      <nav className={`nav-links ${open ? 'open' : ''}`} aria-label="Navegación principal">
        {links.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>)}
        <a className="button" href={COMPANY_INFO.whatsappUrl} target="_blank" rel="noreferrer">Contáctanos</a>
      </nav>
      <button className="menu-toggle" onClick={() => setOpen(!open)} aria-label={open ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={open}>
        {open ? <X /> : <Menu />}
      </button>
    </div>
  </header>;
}
