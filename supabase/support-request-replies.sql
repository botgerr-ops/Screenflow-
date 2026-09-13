-- ScreenFlow Admin: reacties en ongelezen verzoekmeldingen
-- Voer dit bestand eenmaal volledig uit in de Supabase SQL Editor.

alter table public.support_requests
  add column if not exists manager_viewed_at timestamptz;

create table if not exists public.support_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_requests(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sender_id uuid not null,
  sender_role text not null check (sender_role in ('manager', 'customer')),
  message text not null check (char_length(btrim(message)) between 1 and 4000),
  manager_viewed_at timestamptz,
  customer_viewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists support_request_messages_request_idx
  on public.support_request_messages (request_id, created_at);
create index if not exists support_request_messages_manager_unread_idx
  on public.support_request_messages (manager_viewed_at)
  where sender_role = 'customer' and manager_viewed_at is null;

alter table public.support_request_messages enable row level security;

drop policy if exists support_request_messages_select on public.support_request_messages;
create policy support_request_messages_select
on public.support_request_messages for select
to authenticated
using (
  public.is_manager()
  or organization_id = nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid
);

drop policy if exists support_request_messages_insert on public.support_request_messages;

revoke insert on public.support_request_messages from authenticated;
grant select on public.support_request_messages to authenticated;

create or replace function public.manager_mark_requests_viewed()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if not public.is_manager() then
    raise exception 'Geen managerrechten';
  end if;

  update public.support_requests
  set manager_viewed_at = coalesce(manager_viewed_at, now())
  where manager_viewed_at is null;

  update public.support_request_messages
  set manager_viewed_at = coalesce(manager_viewed_at, now())
  where sender_role = 'customer'
    and manager_viewed_at is null;
end;
$function$;

revoke all on function public.manager_mark_requests_viewed() from public;
grant execute on function public.manager_mark_requests_viewed() to authenticated;

create or replace function public.manager_reply_to_request(
  p_request_id uuid,
  p_message text,
  p_status text default 'in_progress'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  request_organization_id uuid;
  new_message_id uuid;
begin
  if not public.is_manager() then
    raise exception 'Geen managerrechten';
  end if;
  if nullif(btrim(p_message), '') is null then
    raise exception 'Reactie ontbreekt';
  end if;
  if p_status not in ('new', 'in_progress', 'waiting_customer', 'resolved') then
    raise exception 'Ongeldige status';
  end if;

  select organization_id
  into request_organization_id
  from public.support_requests
  where id = p_request_id;

  if request_organization_id is null then
    raise exception 'Verzoek niet gevonden';
  end if;

  insert into public.support_request_messages (
    request_id, organization_id, sender_id, sender_role, message, manager_viewed_at
  )
  values (
    p_request_id, request_organization_id, auth.uid(), 'manager', btrim(p_message), now()
  )
  returning id into new_message_id;

  update public.support_requests
  set status = p_status,
      manager_viewed_at = coalesce(manager_viewed_at, now()),
      updated_at = now()
  where id = p_request_id;

  return new_message_id;
end;
$function$;

revoke all on function public.manager_reply_to_request(uuid,text,text) from public;
grant execute on function public.manager_reply_to_request(uuid,text,text) to authenticated;


create or replace function public.customer_mark_requests_viewed()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  customer_organization_id uuid;
begin
  customer_organization_id := nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid;
  if customer_organization_id is null then
    raise exception 'Geen klantorganisatie gekoppeld';
  end if;

  update public.support_request_messages
  set customer_viewed_at = coalesce(customer_viewed_at, now())
  where organization_id = customer_organization_id
    and sender_role = 'manager'
    and customer_viewed_at is null;
end;
$function$;

revoke all on function public.customer_mark_requests_viewed() from public;
grant execute on function public.customer_mark_requests_viewed() to authenticated;

create or replace function public.customer_reply_to_request(
  p_request_id uuid,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  customer_organization_id uuid;
  request_organization_id uuid;
  new_message_id uuid;
begin
  customer_organization_id := nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid;
  if customer_organization_id is null then
    raise exception 'Geen klantorganisatie gekoppeld';
  end if;
  if nullif(btrim(p_message), '') is null then
    raise exception 'Reactie ontbreekt';
  end if;

  select organization_id
  into request_organization_id
  from public.support_requests
  where id = p_request_id;

  if request_organization_id is null or request_organization_id <> customer_organization_id then
    raise exception 'Verzoek niet gevonden';
  end if;

  insert into public.support_request_messages (
    request_id, organization_id, sender_id, sender_role, message, customer_viewed_at
  )
  values (
    p_request_id, customer_organization_id, auth.uid(), 'customer', btrim(p_message), now()
  )
  returning id into new_message_id;

  update public.support_requests
  set status = 'new',
      updated_at = now()
  where id = p_request_id;

  return new_message_id;
end;
$function$;

revoke all on function public.customer_reply_to_request(uuid,text) from public;
grant execute on function public.customer_reply_to_request(uuid,text) to authenticated;
