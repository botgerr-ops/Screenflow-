-- ScreenFlow Admin 0.8.0. Uitvoeren na de bestaande support-request-replies.sql.
-- Herhaalbaar; bestaande afgeronde tickets wachten voortaan op klantbevestiging.
begin;
create sequence if not exists public.screenflow_ticket_seq;
alter table public.support_requests
  add column if not exists ticket_number text,
  add column if not exists archived_at timestamptz,
  add column if not exists confirmed_by uuid;
update public.support_requests set ticket_number='SFT-' || nextval('public.screenflow_ticket_seq')::text
where ticket_number is null;
alter table public.support_requests alter column ticket_number set not null;
create unique index if not exists support_requests_ticket_number_key on public.support_requests(ticket_number);

create or replace function public.guard_screenflow_ticket()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $fn$
begin
  if TG_OP='INSERT' then
    new.ticket_number := 'SFT-' || nextval('public.screenflow_ticket_seq')::text;
    new.archived_at := null; new.confirmed_by := null;
    new.status := 'new'; new.manager_note := null;
  else
    if new.ticket_number is distinct from old.ticket_number
       or new.organization_id is distinct from old.organization_id then
      raise exception 'Ticketnummer en klant zijn onveranderbaar';
    end if;
    if old.archived_at is not null and
       (new.status is distinct from old.status or new.archived_at is distinct from old.archived_at
        or new.confirmed_by is distinct from old.confirmed_by or new.manager_note is distinct from old.manager_note
        or new.description is distinct from old.description or new.subject is distinct from old.subject) then
      raise exception 'Dit ticket is gearchiveerd';
    end if;
    if new.archived_at is not null and old.archived_at is null then
      if old.status <> 'resolved' or new.status <> 'resolved'
         or public.is_manager()
         or (auth.jwt()->'app_metadata'->>'role') is distinct from 'customer_admin'
         or new.organization_id is distinct from nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid
         or new.confirmed_by is distinct from auth.uid() then
        raise exception 'Alleen de eigen klant kan een opgelost ticket bevestigen';
      end if;
      new.archived_at := now();
    elsif new.confirmed_by is distinct from old.confirmed_by then
      raise exception 'Bevestiging vereist archivering';
    end if;
  end if;
  return new;
end;
$fn$;
revoke all on function public.guard_screenflow_ticket() from public;
drop trigger if exists screenflow_ticket_guard on public.support_requests;
create trigger screenflow_ticket_guard before insert or update on public.support_requests
for each row execute function public.guard_screenflow_ticket();

create or replace function public.customer_confirm_support_request(p_request_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $fn$
declare r public.support_requests;
begin
  select * into r from public.support_requests where id=p_request_id for update;
  if r.id is null or public.is_manager()
     or (auth.jwt()->'app_metadata'->>'role') is distinct from 'customer_admin'
     or r.organization_id is distinct from nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid then
    raise exception 'Verzoek niet gevonden';
  end if;
  if r.archived_at is not null then return; end if;
  if r.status <> 'resolved' then raise exception 'Dit ticket is nog niet als opgelost gemarkeerd'; end if;
  insert into public.support_request_messages(request_id,organization_id,sender_id,sender_role,message,customer_viewed_at)
  values(r.id,r.organization_id,auth.uid(),'customer','Ik bevestig dat het probleem is opgelost. Ticket gearchiveerd.',now());
  update public.support_requests set archived_at=now(),confirmed_by=auth.uid(),updated_at=now() where id=r.id;
end;
$fn$;
revoke all on function public.customer_confirm_support_request(uuid) from public;
grant execute on function public.customer_confirm_support_request(uuid) to authenticated;

-- Ook oude apps mogen geen nieuwe berichten aan gearchiveerde tickets toevoegen.
create or replace function public.guard_archived_ticket_message()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $fn$
declare r public.support_requests;
begin
  select * into r from public.support_requests where id=new.request_id for update;
  if r.id is null or r.organization_id is distinct from new.organization_id then raise exception 'Ongeldig ticket'; end if;
  if r.archived_at is not null then raise exception 'Dit ticket is gearchiveerd'; end if;
  return new;
end;
$fn$;
revoke all on function public.guard_archived_ticket_message() from public;
drop trigger if exists screenflow_message_archive_guard on public.support_request_messages;
create trigger screenflow_message_archive_guard before insert on public.support_request_messages
for each row execute function public.guard_archived_ticket_message();

create or replace function public.manager_reply_to_request(p_request_id uuid,p_message text,p_status text default 'in_progress')
returns uuid language plpgsql security definer set search_path=public,pg_temp as $fn$
declare r public.support_requests; mid uuid;
begin
  if not public.is_manager() then raise exception 'Geen managerrechten'; end if;
  if p_status is null or p_status not in ('new','in_progress','waiting_customer','resolved') then raise exception 'Ongeldige status'; end if;
  if nullif(btrim(p_message),'') is null then raise exception 'Beschrijf de reactie of oplossing'; end if;
  select * into r from public.support_requests where id=p_request_id for update;
  if r.id is null or r.archived_at is not null then raise exception 'Ticket niet gevonden of gearchiveerd'; end if;
  insert into public.support_request_messages(request_id,organization_id,sender_id,sender_role,message,manager_viewed_at)
  values(r.id,r.organization_id,auth.uid(),'manager',btrim(p_message),now()) returning id into mid;
  update public.support_requests set status=p_status,
    manager_note=case when p_status='resolved' then btrim(p_message) else manager_note end,
    updated_at=now() where id=r.id;
  return mid;
end;
$fn$;
revoke all on function public.manager_reply_to_request(uuid,text,text) from public;
grant execute on function public.manager_reply_to_request(uuid,text,text) to authenticated;

create or replace function public.manager_update_support_request(p_request_id uuid,p_status text,p_manager_note text default null)
returns public.support_requests language plpgsql security definer set search_path=public,pg_temp as $fn$
declare r public.support_requests;
begin
  if not public.is_manager() then raise exception 'Geen managerrechten'; end if;
  if p_status is null or p_status not in ('new','in_progress','waiting_customer','resolved') then raise exception 'Ongeldige status'; end if;
  select * into r from public.support_requests where id=p_request_id for update;
  if r.id is null or r.archived_at is not null then raise exception 'Ticket niet gevonden of gearchiveerd'; end if;
  if p_status='resolved' then
    perform public.manager_reply_to_request(p_request_id,p_manager_note,'resolved');
  else
    update public.support_requests set status=p_status,updated_at=now() where id=r.id;
  end if;
  select * into r from public.support_requests where id=p_request_id;
  return r;
end;
$fn$;
revoke all on function public.manager_update_support_request(uuid,text,text) from public;
grant execute on function public.manager_update_support_request(uuid,text,text) to authenticated;

-- Extra diagnosevelden worden door de toekomstige player-integratie gevuld.
alter table public.devices add column if not exists firmware_version text,
  add column if not exists available_app_version text;
commit;
