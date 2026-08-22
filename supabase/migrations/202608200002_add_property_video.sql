begin;

alter table public.properties
add column if not exists video_storage_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-videos', 'property-videos', false, 209715200, array['video/mp4'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public reads published property videos" on storage.objects for select to anon, authenticated
using (
  bucket_id = 'property-videos'
  and exists (
    select 1 from public.properties p
    where p.video_storage_path = name
      and p.published = true
      and p.status in ('available', 'reserved', 'sold', 'rented')
  )
);

create policy "Staff reads property videos" on storage.objects for select to authenticated
using (bucket_id = 'property-videos' and (select public.is_admin_or_editor()));

create policy "Staff uploads property videos" on storage.objects for insert to authenticated
with check (
  bucket_id = 'property-videos'
  and (storage.foldername(name))[1] = 'properties'
  and (select public.is_admin_or_editor())
);

create policy "Staff updates property videos" on storage.objects for update to authenticated
using (bucket_id = 'property-videos' and (select public.is_admin_or_editor()))
with check (
  bucket_id = 'property-videos'
  and (storage.foldername(name))[1] = 'properties'
  and (select public.is_admin_or_editor())
);

create policy "Staff deletes property videos" on storage.objects for delete to authenticated
using (bucket_id = 'property-videos' and (select public.is_admin_or_editor()));

commit;
