export type OperationType = 'sale' | 'rent';

export type PropertyType = 'apartment' | 'house' | 'villa' | 'penthouse' | 'land' | 'commercial';

export type PropertyImage = { id: string; url: string; position: number; isCover: boolean };

export type PropertyStatus = 'draft' | 'available' | 'reserved' | 'sold' | 'rented' | 'inactive';

export type Property = {
  id: string;
  title: string;
  slug: string;
  description: string;
  price: number;
  currency: 'DOP' | 'USD';
  operationType: OperationType;
  propertyType: PropertyType;
  bedrooms?: number;
  bathrooms?: number;
  parkingSpaces?: number;
  areaM2?: number;
  city: string;
  sector?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  featured: boolean;
  published: boolean;
  status: PropertyStatus;
  videoStoragePath?: string;
  videoUrl?: string;
  images: PropertyImage[];
  amenities?: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type PropertyFilters = {
  operationType?: OperationType | '';
  propertyType?: PropertyType | '';
  location?: string;
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  bathrooms?: number;
  city?: string;
  sector?: string;
  featured?: boolean;
};

export type Profile = {
  id: string;
  fullName: string;
  role: 'admin' | 'editor';
  createdAt: string;
  updatedAt: string;
};

export type Amenity = { id: string; name: string; slug: string };

export type AdminPropertyImage = PropertyImage & { storagePath: string };

export type AdminProperty = Omit<Property, 'images' | 'amenities'> & {
  images: AdminPropertyImage[];
  amenityIds: string[];
};

export type PropertyInput = {
  title: string;
  slug: string;
  description: string;
  price: number;
  currency: 'DOP' | 'USD';
  operationType: OperationType;
  propertyType: PropertyType;
  status: PropertyStatus;
  bedrooms?: number;
  bathrooms?: number;
  parkingSpaces?: number;
  areaM2?: number;
  city: string;
  sector?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  published: boolean;
  featured: boolean;
};

export type ContactFormData = {
  name: string;
  phone: string;
  email: string;
  message: string;
  propertyInterest: string;
};
