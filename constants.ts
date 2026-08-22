import type { PropertyType } from './types';

export const COMPANY_INFO = {
  name: 'Estrella Real Estate', phone: '809-924-3552', email: 'info@estrellarealestate.com',
  location: 'Santiago, República Dominicana', whatsappUrl: 'https://wa.me/18099243552',
  instagramUrl: 'https://instagram.com/estrellarealestate01', logoUrl: '/estrella-logo.jfif',
} as const;

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  apartment: 'Apartamentos', house: 'Casas', villa: 'Villas', penthouse: 'Penthouses', land: 'Solares', commercial: 'Locales comerciales',
};
