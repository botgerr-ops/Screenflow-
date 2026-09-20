-- NarrowVision TEST only. New objects; no changes to customers, devices, or media.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('nv-player-releases','nv-player-releases',false,157286400,
        array['application/vnd.android.package-archive','application/octet-stream']::text[])
on conflict (id) do nothing;

create table if not exists public.nv_player_releases (
  id uuid primary key default gen_random_uuid(),
  version_code integer not null check (version_code >= 18),
  version_name text not null check (length(version_name) between 3 and 80),
  package_name text not null default 'nl.screenflow.player'
      check (package_name = 'nl.screenflow.player'),
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint not null check (size_bytes between 1 and 157286400),
  status text not null default 'draft' check (status in ('draft','approved','disabled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  constraint nv_release_immutable_path check (storage_path ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[A-Za-z0-9._-]+[.]apk$')
);
create unique index if not exists nv_approved_release_version
  on public.nv_player_releases(version_code) where status = 'approved';
alter table public.nv_player_releases enable row level security;
revoke all on public.nv_player_releases from public, anon, authenticated;
grant select, insert, update on public.nv_player_releases to service_role;
-- No client-facing policies. Only dedicated manager/player Edge Functions use service_role.
-- Uploads use short-lived signed-upload tokens; signed downloads are per-device.
