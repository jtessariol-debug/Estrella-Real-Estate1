import type { Property } from '../types';

export const formatPrice = (price: number, currency: Property['currency']) => `${currency === 'DOP' ? 'RD$' : 'US$'} ${new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
}).format(price)}`;

export const getCoverImage = (property: Property) => property.images.find((image) => image.isCover)?.url ?? property.images[0]?.url ?? '';
