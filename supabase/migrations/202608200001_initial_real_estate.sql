begin;

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('admin', 'editor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 180),
  slug text not null unique check (slug = lower(slug)),
  description text not null default '',
  price numeric(15,2) not null check (price >= 0),
  currency text not null check (currency in ('DOP', 'USD')),
  operation_type text not null check (operation_type in ('sale', 'rent')),
  property_type text not null check (property_type in ('apartment', 'house', 'villa', 'penthouse', 'land', 'commercial')),
  bedrooms integer check (bedrooms >= 0),
  bathrooms numeric(4,1) check (bathrooms >= 0),
  parking_spaces integer check (parking_spaces >= 0),
  area_m2 numeric(12,2) check (area_m2 > 0),
  city text not null,
  sector text,
  address text,
  latitude numeric(9,6) check (latitude between -90 and 90),
  longitude numeric(9,6) check (longitude between -180 and 180),
  featured boolean not null default false,
  published boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'available', 'reserved', 'sold', 'rented', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null
);

create table public.property_images (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  storage_path text not null unique,
  image_url text,
  position integer not null default 0 check (position >= 0),
  is_cover boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.amenities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug = lower(slug)),
  created_at timestamptz not null default now()
);

create table public.property_amenities (
  property_id uuid not null references public.properties(id) on delete cascade,
  amenity_id uuid not null references public.amenities(id) on delete cascade,
  primary key (property_id, amenity_id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger properties_set_updated_at before update on public.properties
for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create index properties_published_idx on public.properties (published) where published = true;
create index properties_featured_idx on public.properties (featured) where featured = true;
create index properties_status_idx on public.properties (status);
create index properties_operation_type_idx on public.properties (operation_type);
create index properties_property_type_idx on public.properties (property_type);
create index properties_city_idx on public.properties (lower(city));
create index properties_sector_idx on public.properties (lower(sector)) where sector is not null;
create index properties_created_at_idx on public.properties (created_at desc);
create index property_images_property_position_idx on public.property_images (property_id, position);
create unique index property_images_one_cover_idx on public.property_images (property_id) where is_cover = true;
create index property_amenities_amenity_idx on public.property_amenities (amenity_id);

insert into public.amenities (name, slug) values
  ('Piscina', 'piscina'), ('Ascensor', 'ascensor'), ('Gimnasio', 'gimnasio'),
  ('Planta eléctrica', 'planta-electrica'), ('Seguridad 24/7', 'seguridad-24-7'),
  ('Balcón', 'balcon'), ('Amueblado', 'amueblado'), ('Área social', 'area-social'),
  ('Terraza', 'terraza'), ('Patio', 'patio'), ('Walk-in closet', 'walk-in-closet'),
  ('Cuarto de servicio', 'cuarto-de-servicio'), ('Portón eléctrico', 'porton-electrico'),
  ('Lobby', 'lobby'), ('Gas común', 'gas-comun'), ('Cisterna', 'cisterna')
on conflict (slug) do nothing;

alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.property_images enable row level security;
alter table public.amenities enable row level security;
alter table public.property_amenities enable row level security;

grant select on public.properties, public.property_images, public.amenities, public.property_amenities to anon;
grant select, insert, update, delete on public.properties, public.property_images, public.amenities, public.property_amenities to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;

create or replace function public.is_admin_or_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('admin', 'editor')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke all on function public.is_admin_or_editor() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin_or_editor() to anon, authenticated;
grant execute on function public.is_admin() to authenticated;

create policy "Users read own profile" on public.profiles for select to authenticated
using (id = (select auth.uid()));
create policy "Admins read all profiles" on public.profiles for select to authenticated
using ((select public.is_admin()));
create policy "Admins insert profiles" on public.profiles for insert to authenticated
with check ((select public.is_admin()));
create policy "Admins update profiles" on public.profiles for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins delete profiles" on public.profiles for delete to authenticated
using ((select public.is_admin()));

create policy "Public reads visible properties" on public.properties for select to anon, authenticated
using (published = true and status in ('available', 'reserved', 'sold', 'rented'));
create policy "Staff reads all properties" on public.properties for select to authenticated
using ((select public.is_admin_or_editor()));
create policy "Staff inserts properties" on public.properties for insert to authenticated
with check ((select public.is_admin_or_editor()) and created_by = (select auth.uid()));
create policy "Staff updates properties" on public.properties for update to authenticated
using ((select public.is_admin_or_editor())) with check ((select public.is_admin_or_editor()));
create policy "Staff deletes properties" on public.properties for delete to authenticated
using ((select public.is_admin_or_editor()));

create policy "Public reads images for visible properties" on public.property_images for select to anon, authenticated
using (exists (select 1 from public.properties p where p.id = property_id and p.published = true and p.status in ('available', 'reserved', 'sold', 'rented')));
create policy "Staff reads all property images" on public.property_images for select to authenticated
using ((select public.is_admin_or_editor()));
create policy "Staff inserts property images" on public.property_images for insert to authenticated
with check ((select public.is_admin_or_editor()));
create policy "Staff updates property images" on public.property_images for update to authenticated
using ((select public.is_admin_or_editor())) with check ((select public.is_admin_or_editor()));
create policy "Staff deletes property images" on public.property_images for delete to authenticated
using ((select public.is_admin_or_editor()));

create policy "Public reads amenities" on public.amenities for select to anon, authenticated using (true);
create policy "Staff inserts amenities" on public.amenities for insert to authenticated with check ((select public.is_admin_or_editor()));
create policy "Staff updates amenities" on public.amenities for update to authenticated using ((select public.is_admin_or_editor())) with check ((select public.is_admin_or_editor()));
create policy "Staff deletes amenities" on public.amenities for delete to authenticated using ((select public.is_admin_or_editor()));

create policy "Public reads amenities for visible properties" on public.property_amenities for select to anon, authenticated
using (exists (select 1 from public.properties p where p.id = property_id and p.published = true and p.status in ('available', 'reserved', 'sold', 'rented')));
create policy "Staff reads all property amenities" on public.property_amenities for select to authenticated using ((select public.is_admin_or_editor()));
create policy "Staff inserts property amenities" on public.property_amenities for insert to authenticated with check ((select public.is_admin_or_editor()));
create policy "Staff deletes property amenities" on public.property_amenities for delete to authenticated using ((select public.is_admin_or_editor()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-images', 'property-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Public reads published property files" on storage.objects for select to anon, authenticated
using (bucket_id = 'property-images' and exists (
  select 1 from public.property_images pi join public.properties p on p.id = pi.property_id
  where pi.storage_path = name and p.published = true and p.status in ('available', 'reserved', 'sold', 'rented')
));
create policy "Staff reads property files" on storage.objects for select to authenticated
using (bucket_id = 'property-images' and (select public.is_admin_or_editor()));
create policy "Staff uploads property files" on storage.objects for insert to authenticated
with check (bucket_id = 'property-images' and (storage.foldername(name))[1] = 'properties' and (select public.is_admin_or_editor()));
create policy "Staff updates property files" on storage.objects for update to authenticated
using (bucket_id = 'property-images' and (select public.is_admin_or_editor()))
with check (bucket_id = 'property-images' and (storage.foldername(name))[1] = 'properties' and (select public.is_admin_or_editor()));
create policy "Staff deletes property files" on storage.objects for delete to authenticated
using (bucket_id = 'property-images' and (select public.is_admin_or_editor()));

commit;
