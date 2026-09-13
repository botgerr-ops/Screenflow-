-- ScreenFlow contentbibliotheek, afspeellijsten en planning
-- Voer dit bestand eenmaal volledig uit in de Supabase SQL Editor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'screenflow-media',
  'screenflow-media',
  false,
  262144000,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.media_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  uploaded_by uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 180),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  media_id uuid not null references public.media_items(id) on delete cascade,
  position integer not null default 0 check (position >= 0),
  duration_seconds integer not null default 10 check (duration_seconds between 1 and 86400),
  created_at timestamptz not null default now()
);

create table if not exists public.content_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  created_by uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  days_of_week integer[] not null default array[1,2,3,4,5],
  start_time time not null default '08:00',
  end_time time not null default '18:00',
  active boolean not null default true,
  timezone text not null default 'Europe/Amsterdam',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (days_of_week <@ array[0,1,2,3,4,5,6] and cardinality(days_of_week) > 0),
  check (start_time < end_time)
);

create index if not exists media_items_organization_idx on public.media_items (organization_id, created_at desc);
create index if not exists playlists_organization_idx on public.playlists (organization_id, updated_at desc);
create index if not exists playlist_items_playlist_idx on public.playlist_items (playlist_id, position);
create index if not exists content_schedules_organization_idx on public.content_schedules (organization_id, active);

alter table public.media_items enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_items enable row level security;
alter table public.content_schedules enable row level security;

drop policy if exists media_items_access on public.media_items;
drop policy if exists media_items_select on public.media_items;
drop policy if exists media_items_insert on public.media_items;
drop policy if exists media_items_update on public.media_items;
drop policy if exists media_items_delete on public.media_items;
create policy media_items_select on public.media_items for select to authenticated
using (public.is_manager() or organization_id = nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid);
create policy media_items_insert on public.media_items for insert to authenticated
with check (
  (public.is_manager() or organization_id = nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid)
  and uploaded_by = auth.uid()
);
create policy media_items_update on public.media_items for update to authenticated
using (public.is_manager() or organization_id = nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid)
with check (public.is_manager() or organization_id = nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid);
create policy media_items_delete on public.media_items for delete to authenticated
using (public.is_manager() or organization_id = nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid);

drop policy if exists playlists_access on public.playlists;
drop policy if exists playlists_select on public.playlists;
drop policy if exists playlists_insert on public.playlists;
drop policy if exists playlists_update on public.playlists;
drop policy if exists playlists_delete on public.playlists;
create policy playlists_select on public.playlists for select to authenticated
using (public.is_manager() or organization_id = nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid);
create policy playlists_insert on public.playlists for insert to authenticated
with check (
  (public.is_manager() or organization_id = nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid)
  and created_by = auth.uid()
);
create policy playlists_update on public.playlists for update to authenticated
using (public.is_manager() or organization_id = nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid)
with check (public.is_manager() or organization_id = nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid);
create policy playlists_delete on public.playlists for delete to authenticated
using (public.is_manager() or organization_id = nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid);

drop policy if exists playlist_items_access on public.playlist_items;
create policy playlist_items_access on public.playlist_items
for all to authenticated
using (
  exists (
    select 1 from public.playlists p
    where p.id = playlist_id
      and (public.is_manager() or p.organization_id = nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid)
  )
)
with check (
  exists (
    select 1
    from public.playlists p
    join public.media_items m on m.id = media_id
    where p.id = playlist_id
      and p.organization_id = m.organization_id
      and (public.is_manager() or p.organization_id = nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid)
  )
);

drop policy if exists content_schedules_access on public.content_schedules;
drop policy if exists content_schedules_select on public.content_schedules;
drop policy if exists content_schedules_insert on public.content_schedules;
drop policy if exists content_schedules_update on public.content_schedules;
drop policy if exists content_schedules_delete on public.content_schedules;
create policy content_schedules_select on public.content_schedules for select to authenticated
using (public.is_manager() or organization_id = nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid);
create policy content_schedules_insert on public.content_schedules for insert to authenticated
with check (
  (public.is_manager() or organization_id = nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid)
  and created_by = auth.uid()
  and exists (select 1 from public.playlists p where p.id = playlist_id and p.organization_id = content_schedules.organization_id)
);
create policy content_schedules_update on public.content_schedules for update to authenticated
using (public.is_manager() or organization_id = nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid)
with check (
  (public.is_manager() or organization_id = nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid)
  and exists (select 1 from public.playlists p where p.id = playlist_id and p.organization_id = content_schedules.organization_id)
);
create policy content_schedules_delete on public.content_schedules for delete to authenticated
using (public.is_manager() or organization_id = nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid);

grant select, insert, update, delete on public.media_items to authenticated;
grant select, insert, update, delete on public.playlists to authenticated;
grant select, insert, update, delete on public.playlist_items to authenticated;
grant select, insert, update, delete on public.content_schedules to authenticated;

drop policy if exists screenflow_media_select on storage.objects;
create policy screenflow_media_select on storage.objects
for select to authenticated
using (
  bucket_id = 'screenflow-media'
  and (
    public.is_manager()
    or (storage.foldername(name))[1] = auth.jwt() -> 'app_metadata' ->> 'organization_id'
  )
);

drop policy if exists screenflow_media_insert on storage.objects;
create policy screenflow_media_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'screenflow-media'
  and (
    public.is_manager()
    or (storage.foldername(name))[1] = auth.jwt() -> 'app_metadata' ->> 'organization_id'
  )
);

drop policy if exists screenflow_media_update on storage.objects;
create policy screenflow_media_update on storage.objects
for update to authenticated
using (
  bucket_id = 'screenflow-media'
  and (
    public.is_manager()
    or (storage.foldername(name))[1] = auth.jwt() -> 'app_metadata' ->> 'organization_id'
  )
)
with check (
  bucket_id = 'screenflow-media'
  and (
    public.is_manager()
    or (storage.foldername(name))[1] = auth.jwt() -> 'app_metadata' ->> 'organization_id'
  )
);

drop policy if exists screenflow_media_delete on storage.objects;
create policy screenflow_media_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'screenflow-media'
  and (
    public.is_manager()
    or (storage.foldername(name))[1] = auth.jwt() -> 'app_metadata' ->> 'organization_id'
  )
);
