import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Mail, MapPin, Phone } from 'lucide-react';
import { COMPANY_INFO } from '../constants';
import { getProperties } from '../services/properties';
import type { ContactFormData, Property } from '../types';

export default function Contact() {
  const [data, setData] = useState<ContactFormData>({ name: '', phone: '', email: '', message: '', propertyInterest: '' });
  const [properties, setProperties] = useState<Property[]>([]);
  useEffect(() => { void getProperties().then(setProperties).catch(() => setProperties([])); }, []);
  const change = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setData({ ...data, [event.target.name]: event.target.value });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const message = [`Hola, soy ${data.name}.`, `Teléfono: ${data.phone}`, `Email: ${data.email}`, `Interés: ${data.propertyInterest || 'Consulta general'}`, data.message].join('\n');
    window.open(`${COMPANY_INFO.whatsappUrl}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };
  return <section className="section" id="contacto"><div className="container contact">
    <div className="contact-copy"><span className="eyebrow">Hablemos</span><h2>Contáctanos</h2><p className="muted">Estamos listos para ayudarte a realizar la mejor inversión. Escríbenos o llámanos hoy mismo.</p><div className="contact-list">
      <a className="contact-row" href={COMPANY_INFO.whatsappUrl} target="_blank" rel="noreferrer"><Phone /><div><small>Teléfono / WhatsApp</small><strong>{COMPANY_INFO.phone}</strong></div></a>
      <a className="contact-row" href={`mailto:${COMPANY_INFO.email}`}><Mail /><div><small>Email</small><strong>{COMPANY_INFO.email}</strong></div></a>
      <div className="contact-row"><MapPin /><div><small>Ubicación</small><strong>{COMPANY_INFO.location}</strong></div></div>
    </div></div>
    <form className="contact-form" onSubmit={submit}><div className="form-grid">
      <div className="input-group"><label htmlFor="name">Nombre completo</label><input id="name" name="name" required value={data.name} onChange={change} /></div>
      <div className="input-group"><label htmlFor="phone">Teléfono</label><input id="phone" name="phone" type="tel" required value={data.phone} onChange={change} /></div>
      <div className="input-group full"><label htmlFor="email">Correo electrónico</label><input id="email" name="email" type="email" required value={data.email} onChange={change} /></div>
      <div className="input-group full"><label htmlFor="propertyInterest">Propiedad de interés</label><select id="propertyInterest" name="propertyInterest" value={data.propertyInterest} onChange={change}><option value="">Consulta general</option>{properties.map((p) => <option key={p.id}>{p.title}</option>)}</select></div>
      <div className="input-group full"><label htmlFor="message">Mensaje</label><textarea id="message" name="message" rows={5} required value={data.message} onChange={change} /></div>
      <button className="button" type="submit">Enviar por WhatsApp</button>
    </div></form>
  </div></section>;
}
