begin;

alter table public.properties
  add column if not exists video_provider text,
  add column if not exists mux_asset_id text,
  add column if not exists mux_playback_id text,
  add column if not exists video_status text,
  add column if not exists video_aspect_ratio text;

alter table public.properties
  drop constraint if exists properties_video_provider_check,
  add constraint properties_video_provider_check
    check (video_provider is null or video_provider in ('supabase', 'mux')),
  drop constraint if exists properties_video_status_check,
  add constraint properties_video_status_check
    check (video_status is null or video_status in ('processing', 'ready', 'error')),
  drop constraint if exists properties_video_aspect_ratio_check,
  add constraint properties_video_aspect_ratio_check
    check (video_aspect_ratio is null or video_aspect_ratio ~ '^[1-9][0-9]*:[1-9][0-9]*$');

update public.properties
set video_provider = 'supabase', video_status = 'ready'
where video_storage_path is not null and video_provider is null;

create table if not exists public.property_video_jobs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mux_upload_id text unique,
  mux_asset_id text unique,
  mux_playback_id text,
  status text not null default 'selected'
    check (status in ('selected', 'uploading', 'processing', 'completed', 'error', 'cancelled')),
  progress numeric(5,2) not null default 0 check (progress between 0 and 100),
  error_code text,
  original_filename text not null,
  original_size bigint not null check (original_size > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists property_video_jobs_property_idx
  on public.property_video_jobs (property_id, created_at desc);
create index if not exists property_video_jobs_user_idx
  on public.property_video_jobs (user_id, created_at desc);
create index if not exists property_video_jobs_status_idx
  on public.property_video_jobs (status) where status in ('selected', 'uploading', 'processing');

drop trigger if exists property_video_jobs_set_updated_at on public.property_video_jobs;
create trigger property_video_jobs_set_updated_at
before update on public.property_video_jobs
for each row execute function public.set_updated_at();

alter table public.property_video_jobs enable row level security;

grant select on public.property_video_jobs to authenticated;

create policy "Staff reads own video jobs"
on public.property_video_jobs for select to authenticated
using (
  user_id = (select auth.uid())
  and (select public.is_admin_or_editor())
);

create or replace function public.update_own_video_job_upload_progress(
  p_job_id uuid,
  p_progress numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin_or_editor() then
    raise exception 'staff_role_required';
  end if;

  update public.property_video_jobs j
  set status = 'uploading', progress = greatest(0, least(100, p_progress))
  where j.id = p_job_id
    and j.user_id = (select auth.uid())
    and j.status in ('selected', 'uploading');

  if not found then
    raise exception 'video_job_not_available';
  end if;
end;
$$;

revoke all on function public.update_own_video_job_upload_progress(uuid, numeric) from public, anon;
grant execute on function public.update_own_video_job_upload_progress(uuid, numeric) to authenticated;

create or replace function public.complete_property_mux_video_job(
  p_job_id uuid,
  p_asset_id text,
  p_playback_id text,
  p_aspect_ratio text
)
returns table (
  activated boolean,
  property_id uuid,
  previous_provider text,
  previous_storage_path text,
  previous_mux_asset_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.property_video_jobs%rowtype;
  v_property public.properties%rowtype;
begin
  select * into v_job
  from public.property_video_jobs j
  where j.id = p_job_id
  for update;

  if not found then
    raise exception 'video_job_not_found';
  end if;

  if v_job.status = 'completed' then
    return query select false, v_job.property_id, null::text, null::text, null::text;
    return;
  end if;

  if v_job.status = 'cancelled' then
    raise exception 'video_job_cancelled';
  end if;

  if v_job.mux_asset_id is not null and v_job.mux_asset_id <> p_asset_id then
    raise exception 'mux_asset_mismatch';
  end if;

  select * into v_property
  from public.properties p
  where p.id = v_job.property_id
  for update;

  if not found then
    raise exception 'property_not_found';
  end if;

  update public.properties p
  set video_provider = 'mux',
      video_storage_path = null,
      mux_asset_id = p_asset_id,
      mux_playback_id = p_playback_id,
      video_status = 'ready',
      video_aspect_ratio = p_aspect_ratio
  where p.id = v_job.property_id;

  update public.property_video_jobs j
  set mux_asset_id = p_asset_id,
      mux_playback_id = p_playback_id,
      status = 'completed',
      progress = 100,
      error_code = null,
      completed_at = now()
  where j.id = p_job_id;

  return query select
    true,
    v_job.property_id,
    v_property.video_provider,
    v_property.video_storage_path,
    v_property.mux_asset_id;
end;
$$;

revoke all on function public.complete_property_mux_video_job(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_property_mux_video_job(uuid, text, text, text) to service_role;

commit;
