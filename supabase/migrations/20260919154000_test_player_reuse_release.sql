-- TEST ONLY. Applied to NarrowVision Player Core Test on 2026-09-19.
-- Never deploy this migration to production without review and integration tests.
-- Old device secrets/customer access are NOT restored. A new bootstrap and manager pairing are required.

create table if not exists public.player_reuse_audit (
  id uuid primary key default gen_random_uuid(),
  deletion_job_id uuid not null references public.customer_deletion_jobs(id),
  retired_uid_hash text not null check (retired_uid_hash ~ '^[0-9a-f]{64}$'),
  previous_organization_id uuid not null,
  approved_by uuid null references auth.users(id) on delete set null,
  approval_source text not null check (approval_source in ('manager','test_operator')),
  reason text not null check (char_length(reason) between 1 and 400),
  approved_at timestamptz not null default now(),
  unique (deletion_job_id, retired_uid_hash)
);
alter table public.player_reuse_audit enable row level security;
revoke all on table public.player_reuse_audit from public, anon, authenticated;

-- Historical deletion jobs store device IDs and hashes in separate arrays. Without
-- a verified ID-to-hash map, releasing more than one device is deliberately refused.
create or replace function public.manager_release_deleted_player_for_reuse(
  p_deletion_job_id uuid,
  p_original_device_id uuid,
  p_confirm_physical_possession boolean
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_session text := auth.jwt()->>'session_id';
  v_job public.customer_deletion_jobs%rowtype;
  v_hash text;
  v_deleted_hash text;
  v_existing integer;
begin
  if v_actor is null or not exists (
    select 1 from public.profiles where user_id = v_actor and role = 'manager'::public.user_role
  ) then
    raise exception 'Alleen een ingelogde manager mag een player vrijgeven.' using errcode = '42501';
  end if;
  if v_session is null or v_session !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or not public.nv_session_matches(v_actor, v_session::uuid) then
    raise exception 'Managersessie is verlopen of vervangen.' using errcode = '42501';
  end if;
  if p_confirm_physical_possession is distinct from true then
    raise exception 'Bevestig eerst dat de player fysiek beschikbaar is.' using errcode = '22023';
  end if;
  select * into v_job from public.customer_deletion_jobs
  where id = p_deletion_job_id and state = 'completed' for update;
  if not found then
    raise exception 'Geen afgeronde klantverwijdering gevonden.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_job.snapshot->'device_ids') is distinct from 'array'
     or jsonb_typeof(v_job.snapshot->'device_uid_hashes') is distinct from 'array'
     or jsonb_array_length(v_job.snapshot->'device_ids') <> 1
     or jsonb_array_length(v_job.snapshot->'device_uid_hashes') <> 1
     or (v_job.snapshot->'device_ids'->>0) is distinct from p_original_device_id::text then
    raise exception 'Deze verwijdering heeft geen eenduidig te identificeren enkele player.' using errcode = '22023';
  end if;
  v_hash := v_job.snapshot->'device_uid_hashes'->>0;
  if v_hash is null or v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Ongeldige ingetrokken apparaatidentiteit.' using errcode = '22023';
  end if;
  if exists (select 1 from public.player_reuse_audit where deletion_job_id = v_job.id and retired_uid_hash = v_hash) then
    raise exception 'Deze player is al vrijgegeven.' using errcode = '23505';
  end if;
  select count(*) into v_existing from public.devices d
  where d.device_uid is not null
    and encode(extensions.digest(pg_catalog.convert_to(d.device_uid,'UTF8'),'sha256'),'hex') = v_hash;
  if v_existing <> 0 then
    raise exception 'Apparaatidentiteit is nog in gebruik.' using errcode = '23514';
  end if;
  delete from public.retired_device_uids
  where uid_hash = v_hash and deletion_job_id = v_job.id
    and organization_id = v_job.target_organization_id
  returning uid_hash into v_deleted_hash;
  if v_deleted_hash is null then
    raise exception 'Player niet gevonden of al vrijgegeven.' using errcode = '22023';
  end if;
  insert into public.player_reuse_audit
    (deletion_job_id, retired_uid_hash, previous_organization_id, approved_by, approval_source, reason)
  values
    (v_job.id, v_hash, v_job.target_organization_id, v_actor, 'manager',
     'Manager bevestigde fysieke toegang. Oude klant en geheim blijven ingetrokken; nieuwe pairing vereist.');
  return pg_catalog.jsonb_build_object('released',true,'previous_device_id',p_original_device_id,
     'message','Player vrijgegeven. Start de player opnieuw en koppel hem via een nieuwe code.');
end;
$function$;
revoke all on function public.manager_release_deleted_player_for_reuse(uuid,uuid,boolean) from public, anon;
grant execute on function public.manager_release_deleted_player_for_reuse(uuid,uuid,boolean) to authenticated;
