-- ScreenFlow Admin: klantgegevens, klantnummers en verzoeken
-- Veilig opnieuw uitvoerbaar in de Supabase SQL Editor.

create sequence if not exists public.screenflow_customer_number_seq start with 1;

create or replace function public.next_screenflow_customer_number()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return 'SF-' || to_char(current_timestamp, 'YYYY') || '-' ||
         lpad(nextval('public.screenflow_customer_number_seq')::text, 4, '0');
end;
$$;

revoke all on function public.next_screenflow_customer_number() from public;

alter table public.organizations
  add column if not exists customer_number text,
  add column if not exists address_street text,
  add column if not exists address_house_number text,
  add column if not exists address_postal_code text,
  add column if not exists address_city text,
  add column if not exists address_country text not null default 'Nederland';

update public.organizations
set customer_number = public.next_screenflow_customer_number()
where customer_number is null or btrim(customer_number) = '';

alter table public.organizations
  alter column customer_number set default public.next_screenflow_customer_number(),
  alter column customer_number set not null;

create unique index if not exists organizations_customer_number_key
  on public.organizations (customer_number);

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null,
  subject text not null check (char_length(btrim(subject)) between 3 and 120),
  description text not null check (char_length(btrim(description)) between 5 and 4000),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'new'
    check (status in ('new', 'in_progress', 'waiting_customer', 'resolved')),
  manager_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_requests_organization_idx
  on public.support_requests (organization_id, created_at desc);
create index if not exists support_requests_status_idx
  on public.support_requests (status, created_at desc);

alter table public.support_requests enable row level security;

drop policy if exists support_requests_select on public.support_requests;
create policy support_requests_select
on public.support_requests for select
to authenticated
using (
  public.is_manager()
  or organization_id = nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid
);

drop policy if exists support_requests_insert on public.support_requests;
create policy support_requests_insert
on public.support_requests for insert
to authenticated
with check (
  (
    organization_id = nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid
    and created_by = auth.uid()
  )
  or public.is_manager()
);

drop policy if exists support_requests_manager_update on public.support_requests;
create policy support_requests_manager_update
on public.support_requests for update
to authenticated
using (public.is_manager())
with check (public.is_manager());

grant select, insert, update on public.support_requests to authenticated;

create or replace function public.manager_update_customer(
  p_organization_id uuid,
  p_name text,
  p_contact_name text,
  p_contact_email text,
  p_address_street text,
  p_address_house_number text,
  p_address_postal_code text,
  p_address_city text,
  p_address_country text
)
returns public.organizations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_organization public.organizations;
begin
  if not public.is_manager() then
    raise exception 'Geen managerrechten';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception 'Bedrijfsnaam ontbreekt';
  end if;

  update public.organizations
  set name = btrim(p_name),
      contact_name = nullif(btrim(p_contact_name), ''),
      contact_email = lower(nullif(btrim(p_contact_email), '')),
      address_street = nullif(btrim(p_address_street), ''),
      address_house_number = nullif(btrim(p_address_house_number), ''),
      address_postal_code = upper(nullif(btrim(p_address_postal_code), '')),
      address_city = nullif(btrim(p_address_city), ''),
      address_country = coalesce(nullif(btrim(p_address_country), ''), 'Nederland')
  where id = p_organization_id
  returning * into updated_organization;

  if updated_organization.id is null then
    raise exception 'Klant niet gevonden';
  end if;
  return updated_organization;
end;
$$;

revoke all on function public.manager_update_customer(uuid,text,text,text,text,text,text,text,text) from public;
grant execute on function public.manager_update_customer(uuid,text,text,text,text,text,text,text,text) to authenticated;

create or replace function public.manager_update_support_request(
  p_request_id uuid,
  p_status text,
  p_manager_note text default null
)
returns public.support_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_request public.support_requests;
begin
  if not public.is_manager() then
    raise exception 'Geen managerrechten';
  end if;
  if p_status not in ('new', 'in_progress', 'waiting_customer', 'resolved') then
    raise exception 'Ongeldige status';
  end if;

  update public.support_requests
  set status = p_status,
      manager_note = nullif(btrim(p_manager_note), ''),
      updated_at = now()
  where id = p_request_id
  returning * into updated_request;

  if updated_request.id is null then
    raise exception 'Verzoek niet gevonden';
  end if;
  return updated_request;
end;
$$;

revoke all on function public.manager_update_support_request(uuid,text,text) from public;
grant execute on function public.manager_update_support_request(uuid,text,text) to authenticated;
