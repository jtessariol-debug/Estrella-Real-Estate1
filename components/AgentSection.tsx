import { ArrowRight } from 'lucide-react';
import { COMPANY_INFO } from '../constants';
import WhatsAppIcon from './WhatsAppIcon';

const WHATSAPP_MESSAGE =
  'Hola Alexis, vi una propiedad en Estrella Real Estate y me gustaría recibir más información.';

export default function AgentSection() {
  const whatsappUrl = `${COMPANY_INFO.whatsappUrl}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

  return (
    <section className="agent-section" aria-labelledby="agent-title">
      <div className="container agent-layout">
        <div className="agent-portrait-wrap">
          <img
            className="agent-portrait"
            src="/images/alexis-estrella-agent.jpeg"
            alt="Alexis Estrella, asesor inmobiliario de Estrella Real Estate"
            loading="lazy"
            width="1086"
            height="1448"
          />
          <span className="agent-image-accent" aria-hidden="true" />
        </div>

        <div className="agent-content">
          <span className="eyebrow">Tu agente</span>
          <h2 id="agent-title">Alexis Estrella</h2>
          <p className="agent-role">Asesor Inmobiliario</p>

          <div className="agent-copy">
            <p>
              Con un enfoque cercano, profesional y orientado a resultados, Alexis Estrella acompaña a cada cliente durante todo el proceso de compra, venta o alquiler de su propiedad.
            </p>
            <p>
              Su objetivo es ayudarte a encontrar oportunidades que realmente se ajusten a tus necesidades, ofreciéndote orientación personalizada y acompañamiento en cada etapa de tu inversión inmobiliaria.
            </p>
          </div>

          <p className="agent-quote">Tu próxima propiedad comienza con una buena decisión.</p>

          <div className="agent-actions">
            <a
              className="button agent-whatsapp"
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Hablar con Alexis Estrella por WhatsApp"
            >
              <WhatsAppIcon className="agent-whatsapp-icon" />
              Hablar con Alexis
            </a>
            <a className="button outline agent-secondary" href="/propiedades">
              Ver propiedades
              <ArrowRight size={17} aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
