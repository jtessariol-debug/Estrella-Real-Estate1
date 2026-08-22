import { lazy, Suspense } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import WhatsAppFloat from './components/WhatsAppFloat';
import Contact from './components/Contact';
import { About, CallToAction } from './components/HomeSections';
import HomePage from './pages/HomePage';
import PropertiesPage from './pages/PropertiesPage';

const PropertyDetailPage = lazy(() => import('./pages/PropertyDetailPage'));
const AdminLoginPage = lazy(() => import('./pages/AdminLoginPage'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));
const AdminPropertiesPage = lazy(() => import('./pages/AdminPropertiesPage'));
const AdminPropertyFormPage = lazy(() => import('./pages/AdminPropertyFormPage'));

const loadingFallback = <div className="route-loader" role="status"><span /> Cargando experiencia…</div>;

function resolvePage(path: string) {
  if (path === '/') return <HomePage />;
  if (path === '/propiedades') return <PropertiesPage />;
  if (path === '/propiedades/venta') return <PropertiesPage operation="sale" />;
  if (path === '/propiedades/alquiler') return <PropertiesPage operation="rent" />;
  if (path.startsWith('/propiedad/')) return <PropertyDetailPage slug={decodeURIComponent(path.slice('/propiedad/'.length))} />;
  if (path === '/nosotros') return <main style={{ paddingTop: 70 }}><About /><CallToAction /></main>;
  if (path === '/contacto') return <main style={{ paddingTop: 70 }}><Contact /></main>;
  return <main className="not-found"><h1 className="serif">Página no encontrada</h1><p className="muted">La dirección que buscas no está disponible.</p><a className="button" href="/">Volver al inicio</a></main>;
}

export default function App() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path === '/admin/login') return <Suspense fallback={loadingFallback}><AdminLoginPage /></Suspense>;
  if (path === '/admin/properties/new') return <Suspense fallback={loadingFallback}><AdminPropertyFormPage /></Suspense>;
  const adminEditMatch = path.match(/^\/admin\/properties\/([^/]+)\/edit$/);
  if (adminEditMatch) return <Suspense fallback={loadingFallback}><AdminPropertyFormPage id={decodeURIComponent(adminEditMatch[1])} /></Suspense>;
  if (path === '/admin/properties') return <Suspense fallback={loadingFallback}><AdminPropertiesPage /></Suspense>;
  if (path === '/admin') return <Suspense fallback={loadingFallback}><AdminDashboardPage /></Suspense>;
  return <><Header inner={path !== '/'} /><Suspense fallback={loadingFallback}>{resolvePage(path)}</Suspense><Footer /><WhatsAppFloat /></>;
}
