import { COMPANY_INFO } from '../constants';
import WhatsAppIcon from './WhatsAppIcon';

const WHATSAPP_MESSAGE =
  'Hola, vi una propiedad en Estrella Real Estate y me gustaría recibir más información.';

export default function WhatsAppFloat() {
  const whatsappUrl = `${COMPANY_INFO.whatsappUrl}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

  return (
    <a
      className="whatsapp"
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contactar Estrella Real Estate por WhatsApp"
    >
      <WhatsAppIcon className="whatsapp-icon" />
    </a>
  );
}
