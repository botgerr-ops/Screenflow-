-- NarrowVision player core
create extension if not exists pgcrypto;

do $$ begin
  create type public.player_command_type as enum ('sync','capture','restart_player','update');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.player_command_status as enum ('queued','delivered','acknowledged','completed','failed');
exception when duplicate_object then null; end $$;

alter table public.devices
  add column if not exists device_uid text,
  add column if not exists pairing_code_expires_at timestamptz,
  add column if not exists player_secret_hash text,
  add column if not exists manufacturer text,
  add column if not exists model text,
  add column if not exists os_version text,
  add column if not exists sdk_version integer,
  add column if not exists last_sync_at timestamptz,
  add column if not exists current_playlist_id uuid,
  add column if not exists config_revision bigint not null default 0;

create unique index if not exists devices_device_uid_key on public.devices(device_uid) where device_uid is not null;
create unique index if not exists devices_player_secret_hash_key on public.devices(player_secret_hash) where player_secret_hash is not null;
create index if not exists devices_pairing_expiry_idx on public.devices(pairing_code_expires_at) where pairing_code is not null;

do $$ begin alter table public.devices add constraint devices_device_uid_nonempty check(device_uid is null or char_length(btrim(device_uid)) between 16 and 200) not valid; exception when duplicate_object then null; end $$;
alter table public.devices validate constraint devices_device_uid_nonempty;
do $$ begin alter table public.devices add constraint devices_sdk_version_nonnegative check(sdk_version is null or sdk_version>=0) not valid; exception when duplicate_object then null; end $$;
alter table public.devices validate constraint devices_sdk_version_nonnegative;
do $$ begin alter table public.devices add constraint devices_config_revision_nonnegative check(config_revision>=0) not valid; exception when duplicate_object then null; end $$;
alter table public.devices validate constraint devices_config_revision_nonnegative;
do $$ begin alter table public.devices add constraint devices_current_playlist_id_fkey foreign key(current_playlist_id) references public.playlists(id) on delete set null not valid; exception when duplicate_object then null; end $$;
alter table public.devices validate constraint devices_current_playlist_id_fkey;

create table if not exists public.player_commands(
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  type public.player_command_type not null,
  payload jsonb not null default '{}'::jsonb,
  status public.player_command_status not null default 'queued',
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  error_message text,
  constraint player_commands_payload_object check(jsonb_typeof(payload)='object'),
  constraint player_commands_error_length check(error_message is null or char_length(error_message)<=4000),
  constraint player_commands_terminal_state check(
    (status='completed' and completed_at is not null and failed_at is null) or
    (status='failed' and failed_at is not null and completed_at is null) or
    (status not in('completed','failed') and completed_at is null and failed_at is null)
  )
);
create index if not exists player_commands_device_queue_idx on public.player_commands(device_id,created_at) where status in('queued','delivered','acknowledged');
alter table public.player_commands enable row level security;
drop policy if exists player_commands_manager_all on public.player_commands;
create policy player_commands_manager_all on public.player_commands for all to authenticated using(public.is_manager()) with check(public.is_manager() and requested_by=auth.uid());
revoke all on table public.player_commands from anon,authenticated;
grant select,insert,update,delete on table public.player_commands to authenticated;

drop policy if exists members_manage_devices on public.devices;
drop policy if exists player_devices_manager_all on public.devices;
create policy player_devices_manager_all on public.devices for all to authenticated using(public.is_manager()) with check(public.is_manager());

create or replace function public.manager_pair_player(code text,organization_id uuid,name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_device public.devices; v_license public.licenses; v_used bigint;
begin
  if auth.uid() is null or not public.is_manager() then raise exception 'Geen managerrechten' using errcode='42501'; end if;
  if nullif(btrim($1),'') is null or $2 is null then raise exception 'Ongeldige koppelcode'; end if;
  select d.* into v_device from public.devices d where d.pairing_code=btrim($1) for update;
  if not found or v_device.organization_id is not null then raise exception 'Koppelcode niet gevonden of al gebruikt'; end if;
  if v_device.pairing_code_expires_at is null or v_device.pairing_code_expires_at<=now() then raise exception 'Koppelcode is verlopen'; end if;
  select l.* into v_license from public.licenses l where l.organization_id=$2 for update;
  if not found or v_license.status<>'active' or v_license.valid_until<current_date then raise exception 'Deze klant heeft geen actieve licentie'; end if;
  select count(*) into v_used from public.devices d where d.organization_id=$2;
  if v_used>=v_license.player_limit then raise exception 'Alle playerlicenties van deze klant zijn in gebruik'; end if;
  update public.devices d set organization_id=$2,name=coalesce(nullif(btrim($3),''),d.name),status='active',pairing_code=null,pairing_code_expires_at=null
    where d.id=v_device.id returning d.* into v_device;
  return v_device.id;
end $$;

create or replace function public.customer_pair_player(code text,name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_organization_id uuid; v_device public.devices; v_license public.licenses; v_used bigint;
begin
  if auth.uid() is null then raise exception 'Niet ingelogd' using errcode='42501'; end if;
  v_organization_id:=nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid;
  if v_organization_id is null or(auth.jwt()->'app_metadata'->>'role') is distinct from 'customer_admin'
    or not exists(select 1 from public.organization_members m where m.organization_id=v_organization_id and m.user_id=auth.uid())
  then raise exception 'Geen klantorganisatie gekoppeld' using errcode='42501'; end if;
  select d.* into v_device from public.devices d where d.pairing_code=btrim($1) for update;
  if not found or v_device.organization_id is not null then raise exception 'Koppelcode niet gevonden of al gebruikt'; end if;
  if v_device.pairing_code_expires_at is null or v_device.pairing_code_expires_at<=now() then raise exception 'Koppelcode is verlopen'; end if;
  select l.* into v_license from public.licenses l where l.organization_id=v_organization_id for update;
  if not found or v_license.status<>'active' or v_license.valid_until<current_date then raise exception 'Deze klant heeft geen actieve licentie'; end if;
  select count(*) into v_used from public.devices d where d.organization_id=v_organization_id;
  if v_used>=v_license.player_limit then raise exception 'Alle playerlicenties van deze klant zijn in gebruik'; end if;
  update public.devices d set organization_id=v_organization_id,name=coalesce(nullif(btrim($2),''),d.name),status='active',pairing_code=null,pairing_code_expires_at=null
    where d.id=v_device.id returning d.* into v_device;
  return v_device.id;
end $$;

revoke all on function public.manager_pair_player(text,uuid,text) from public,anon;
revoke all on function public.customer_pair_player(text,text) from public,anon;
grant execute on function public.manager_pair_player(text,uuid,text) to authenticated;
grant execute on function public.customer_pair_player(text,text) to authenticated;
revoke all on function public.handle_new_user() from public,anon,authenticated;
revoke all on function public.rls_auto_enable() from public,anon,authenticated;
revoke all on function public.guard_archived_ticket_message() from public,anon,authenticated;
revoke all on function public.guard_screenflow_ticket() from public,anon,authenticated;
revoke all on function public.next_screenflow_customer_number() from public,anon,authenticated;

comment on table public.player_commands is 'Server-managed command queue. Players access this only through future authenticated Edge Functions.';
comment on column public.devices.player_secret_hash is 'Hash only; the plaintext player secret is returned once by a future bootstrap Edge Function.';
