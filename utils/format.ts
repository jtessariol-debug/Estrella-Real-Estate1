import type { Property } from '../types';

export const formatPrice = (price: number, currency: Property['currency']) => `${currency === 'DOP' ? 'RD$' : 'US$'}${new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
}).format(price)}`;

export const formatPriceInput = (value: string) => {
  if (!value) return '';
  const price = Number(value);
  if (!Number.isFinite(price)) return value;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(price);
};

export const normalizePriceInput = (value: string) => {
  const sanitized = value.replace(/[\s,]/g, '').replace(/[^\d.]/g, '');
  const [integer = '', ...decimals] = sanitized.split('.');
  return decimals.length ? `${integer}.${decimals.join('').slice(0, 2)}` : integer;
};

export const getCoverImage = (property: Property) => property.images.find((image) => image.isCover)?.url ?? property.images[0]?.url ?? '';
