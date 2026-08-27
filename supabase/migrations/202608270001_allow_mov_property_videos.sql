begin;

update storage.buckets
set
  public = false,
  file_size_limit = 209715200,
  allowed_mime_types = array['video/mp4', 'video/quicktime']
where id = 'property-videos';

commit;
