alter table public.devices
  add column if not exists last_applied_config_revision bigint,
  add column if not exists player_secret_updated_at timestamptz;

do $$ begin
  alter table public.devices add constraint devices_last_applied_revision_nonnegative
    check (last_applied_config_revision is null or last_applied_config_revision >= 0) not valid;
exception when duplicate_object then null; end $$;
alter table public.devices validate constraint devices_last_applied_revision_nonnegative;

create table if not exists public.player_bootstrap_attempts (
  id bigint generated always as identity primary key,
  fingerprint_hash text not null,
  attempted_at timestamptz not null default now(),
  created_device boolean not null default false
);
create index if not exists player_bootstrap_attempts_window_idx
  on public.player_bootstrap_attempts (fingerprint_hash, attempted_at desc);
alter table public.player_bootstrap_attempts enable row level security;
revoke all on table public.player_bootstrap_attempts from anon, authenticated;
comment on table public.player_bootstrap_attempts is
  'Server-only abuse-control audit. Stores a one-way request fingerprint, never a player secret or Authorization header.';
