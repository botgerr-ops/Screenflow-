-- ScreenFlow player management for Supabase
-- Run this complete file once in Supabase > SQL Editor.

create extension if not exists pgcrypto;

alter table public.devices add column if not exists device_uid text;
alter table public.devices add column if not exists pairing_code text;
alter table public.devices add column if not exists name text;
alter table public.devices add column if not exists platform text default 'android';
alter table public.devices add column if not exists app_version text;
alter table public.devices add column if not exists player_token uuid default gen_random_uuid();
alter table public.devices add column if not exists status text default 'pending';
alter table public.devices add column if not exists last_seen_at timestamptz;
alter table public.devices add column if not exists pending_command text;
alter table public.devices add column if not exists command_requested_at timestamptz;
alter table public.devices add column if not exists created_at timestamptz default now();
alter table public.devices alter column organization_id drop not null;

create unique index if not exists devices_device_uid_key on public.devices(device_uid) where device_uid is not null;
create unique index if not exists devices_pairing_code_key on public.devices(pairing_code) where pairing_code is not null;
create unique index if not exists devices_player_token_key on public.devices(player_token) where player_token is not null;

create or replace function public.player_register(
  p_device_uid text, p_name text default 'Android player',
  p_platform text default 'android', p_app_version text default null
) returns table(pairing_code text, paired boolean, player_token uuid)
language plpgsql security definer set search_path=public as $$
declare v_device public.devices; v_code text;
begin
  if p_device_uid is null or length(trim(p_device_uid)) < 6 then raise exception 'Ongeldige device-id'; end if;
  select * into v_device from public.devices d where d.device_uid=p_device_uid;
  if not found then
    loop
      v_code:=lpad((floor(random()*1000000))::int::text,6,'0');
      exit when not exists(select 1 from public.devices d where d.pairing_code=v_code);
    end loop;
    insert into public.devices(device_uid,pairing_code,name,platform,app_version,status,last_seen_at)
    values(p_device_uid,v_code,coalesce(nullif(trim(p_name),''),'Android player'),p_platform,p_app_version,'pending',now())
    returning * into v_device;
  else
    update public.devices
      set last_seen_at=now(),app_version=coalesce(p_app_version,app_version),platform=coalesce(p_platform,platform)
      where id=v_device.id returning * into v_device;
  end if;
  return query select v_device.pairing_code,(v_device.organization_id is not null),v_device.player_token;
end $$;

create or replace function public.player_poll(p_device_uid text,p_app_version text default null)
returns table(paired boolean,player_token uuid,pending_command text)
language plpgsql security definer set search_path=public as $$
declare v_device public.devices;
begin
  update public.devices set last_seen_at=now(),app_version=coalesce(p_app_version,app_version)
    where device_uid=p_device_uid returning * into v_device;
  if not found then raise exception 'Player niet geregistreerd'; end if;
  return query select (v_device.organization_id is not null),v_device.player_token,v_device.pending_command;
end $$;

create or replace function public.player_ack_command(p_device_uid text,p_command text)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.devices set pending_command=null
    where device_uid=p_device_uid and pending_command=p_command;
end $$;

create or replace function public.manager_pair_player(p_pairing_code text,p_organization_id uuid,p_name text)
returns setof public.devices language plpgsql security definer set search_path=public as $$
declare v_limit int; v_used int;
begin
  if not public.is_manager() then raise exception 'Geen managerrechten'; end if;
  select player_limit into v_limit from public.licenses
    where organization_id=p_organization_id and status='active' and valid_until>=current_date
    order by valid_until desc limit 1;
  if v_limit is null then raise exception 'Deze klant heeft geen actieve licentie'; end if;
  select count(*) into v_used from public.devices where organization_id=p_organization_id;
  if v_used>=v_limit then raise exception 'Alle playerlicenties van deze klant zijn in gebruik'; end if;
  return query update public.devices
    set organization_id=p_organization_id,name=coalesce(nullif(trim(p_name),''),name),status='active',pairing_code=null
    where pairing_code=p_pairing_code and organization_id is null returning *;
  if not found then raise exception 'Koppelcode niet gevonden of al gebruikt'; end if;
end $$;

create or replace function public.manager_set_player_command(p_device_id uuid,p_command text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_manager() then raise exception 'Geen managerrechten'; end if;
  if p_command not in ('sync','update','restart','clear_cache') then raise exception 'Ongeldige opdracht'; end if;
  update public.devices set pending_command=p_command,command_requested_at=now() where id=p_device_id;
  if not found then raise exception 'Player niet gevonden'; end if;
end $$;

revoke all on function public.player_register(text,text,text,text) from public;
revoke all on function public.player_poll(text,text) from public;
revoke all on function public.player_ack_command(text,text) from public;
revoke all on function public.manager_pair_player(text,uuid,text) from public;
revoke all on function public.manager_set_player_command(uuid,text) from public;
grant execute on function public.player_register(text,text,text,text) to anon,authenticated;
grant execute on function public.player_poll(text,text) to anon,authenticated;
grant execute on function public.player_ack_command(text,text) to anon,authenticated;
grant execute on function public.manager_pair_player(text,uuid,text) to authenticated;
grant execute on function public.manager_set_player_command(uuid,text) to authenticated;

alter table public.devices enable row level security;
drop policy if exists screenflow_manager_devices_all on public.devices;
create policy screenflow_manager_devices_all on public.devices
for all to authenticated using(public.is_manager()) with check(public.is_manager());
