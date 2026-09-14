begin;

create or replace function public.has_completed_forced_password_change()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt()->'app_metadata'->>'force_password_change')::boolean, false) = false
$$;

alter policy "members_read_devices" on public.devices
  using (public.is_manager() or (public.has_completed_forced_password_change() and exists (
    select 1 from public.organization_members m
    where m.organization_id = devices.organization_id and m.user_id = auth.uid()
  )));
alter policy "members_read_licenses" on public.licenses
  using (public.is_manager() or (public.has_completed_forced_password_change() and exists (
    select 1 from public.organization_members m
    where m.organization_id = licenses.organization_id and m.user_id = auth.uid()
  )));
alter policy "members_read_memberships" on public.organization_members
  using (public.is_manager() or (public.has_completed_forced_password_change() and user_id = auth.uid()));
alter policy "members_read_organizations" on public.organizations
  using (public.is_manager() or (public.has_completed_forced_password_change() and exists (
    select 1 from public.organization_members m
    where m.organization_id = organizations.id and m.user_id = auth.uid()
  )));
alter policy "profile_self_read" on public.profiles
  using (public.is_manager() or (public.has_completed_forced_password_change() and user_id = auth.uid()));

alter policy "media_items_select" on public.media_items
  using (public.is_manager() or (public.has_completed_forced_password_change() and organization_id = nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid));
alter policy "media_items_insert" on public.media_items
  with check ((public.is_manager() or (public.has_completed_forced_password_change() and organization_id = nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid)) and uploaded_by = auth.uid());
alter policy "media_items_update" on public.media_items
  using (public.is_manager() or (public.has_completed_forced_password_change() and organization_id = nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid))
  with check (public.is_manager() or (public.has_completed_forced_password_change() and organization_id = nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid));
alter policy "media_items_delete" on public.media_items
  using (public.is_manager() or (public.has_completed_forced_password_change() and organization_id = nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid));

alter policy "playlists_select" on public.playlists
  using (public.is_manager() or (public.has_completed_forced_password_change() and organization_id = nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid));
alter policy "playlists_insert" on public.playlists
  with check ((public.is_manager() or (public.has_completed_forced_password_change() and organization_id = nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid)) and created_by = auth.uid());
alter policy "playlists_update" on public.playlists
  using (public.is_manager() or (public.has_completed_forced_password_change() and organization_id = nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid))
  with check (public.is_manager() or (public.has_completed_forced_password_change() and organization_id = nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid));
alter policy "playlists_delete" on public.playlists
  using (public.is_manager() or (public.has_completed_forced_password_change() and organization_id = nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid));

alter policy "playlist_items_access" on public.playlist_items
  using (exists (
    select 1 from public.playlists p
    where p.id = playlist_items.playlist_id
      and (public.is_manager() or (public.has_completed_forced_password_change() and p.organization_id = nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid))
  ))
  with check (exists (
    select 1 from public.playlists p
    join public.media_items m on m.id = playlist_items.media_id
    where p.id = playlist_items.playlist_id
      and p.organization_id = m.organization_id
      and (public.is_manager() or (public.has_completed_forced_password_change() and p.organization_id = nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid))
  ));

alter policy "content_schedules_select" on public.content_schedules
  using (public.is_manager() or (public.has_completed_forced_password_change() and organization_id = nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid));
alter policy "content_schedules_insert" on public.content_schedules
  with check ((public.is_manager() or (public.has_completed_forced_password_change() and organization_id = nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid))
    and created_by = auth.uid()
    and exists (select 1 from public.playlists p where p.id = content_schedules.playlist_id and p.organization_id = content_schedules.organization_id));
alter policy "content_schedules_update" on public.content_schedules
  using (public.is_manager() or (public.has_completed_forced_password_change() and organization_id = nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid))
  with check ((public.is_manager() or (public.has_completed_forced_password_change() and organization_id = nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid))
    and exists (select 1 from public.playlists p where p.id = content_schedules.playlist_id and p.organization_id = content_schedules.organization_id));
alter policy "content_schedules_delete" on public.content_schedules
  using (public.is_manager() or (public.has_completed_forced_password_change() and organization_id = nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid));

alter policy "support_requests_select" on public.support_requests
  using (public.is_manager() or (public.has_completed_forced_password_change() and organization_id = nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid));
alter policy "support_requests_insert" on public.support_requests
  with check ((public.is_manager() or (public.has_completed_forced_password_change() and organization_id = nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid)) and created_by = auth.uid());
alter policy "support_request_messages_select" on public.support_request_messages
  using (public.is_manager() or (public.has_completed_forced_password_change() and organization_id = nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid));

alter policy "screenflow_media_select" on storage.objects
  using (bucket_id = 'screenflow-media' and (public.is_manager() or (public.has_completed_forced_password_change() and (storage.foldername(name))[1] = auth.jwt()->'app_metadata'->>'organization_id')));
alter policy "screenflow_media_insert" on storage.objects
  with check (bucket_id = 'screenflow-media' and (public.is_manager() or (public.has_completed_forced_password_change() and (storage.foldername(name))[1] = auth.jwt()->'app_metadata'->>'organization_id')));
alter policy "screenflow_media_update" on storage.objects
  using (bucket_id = 'screenflow-media' and (public.is_manager() or (public.has_completed_forced_password_change() and (storage.foldername(name))[1] = auth.jwt()->'app_metadata'->>'organization_id')))
  with check (bucket_id = 'screenflow-media' and (public.is_manager() or (public.has_completed_forced_password_change() and (storage.foldername(name))[1] = auth.jwt()->'app_metadata'->>'organization_id')));
alter policy "screenflow_media_delete" on storage.objects
  using (bucket_id = 'screenflow-media' and (public.is_manager() or (public.has_completed_forced_password_change() and (storage.foldername(name))[1] = auth.jwt()->'app_metadata'->>'organization_id')));

create or replace function public.customer_confirm_support_request(uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare r public.support_requests;
begin
  select * into r from public.support_requests where id=$1 for update;
  if r.id is null or public.is_manager()
    or not public.has_completed_forced_password_change()
    or (auth.jwt()->'app_metadata'->>'role') is distinct from 'customer_admin'
    or r.organization_id is distinct from nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid then
    raise exception 'Verzoek niet gevonden';
  end if;
  if r.status<>'resolved' then raise exception 'Dit ticket is nog niet als opgelost gemarkeerd'; end if;
  insert into public.support_request_messages(request_id,organization_id,sender_id,sender_role,message,customer_viewed_at)
  values(r.id,r.organization_id,auth.uid(),'customer','Ik bevestig dat het probleem is opgelost. Ticket gearchiveerd.',now());
  update public.support_requests set archived_at=now(),confirmed_by=auth.uid(),updated_at=now() where id=r.id;
end
$$;

create or replace function public.customer_mark_requests_viewed()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare o uuid:=nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid;
begin
  if o is null or not public.has_completed_forced_password_change() then
    raise exception 'Geen klantorganisatie gekoppeld';
  end if;
  update public.support_request_messages
  set customer_viewed_at=coalesce(customer_viewed_at,now())
  where organization_id=o and sender_role='manager' and customer_viewed_at is null;
end
$$;

create or replace function public.customer_pair_player(code text, name text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_organization_id uuid;v_device public.devices;v_license public.licenses;v_used bigint;
begin
  if auth.uid() is null then raise exception 'Niet ingelogd' using errcode='42501'; end if;
  v_organization_id:=nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid;
  if v_organization_id is null
    or not public.has_completed_forced_password_change()
    or (auth.jwt()->'app_metadata'->>'role') is distinct from 'customer_admin'
    or not exists(select 1 from public.organization_members m where m.organization_id=v_organization_id and m.user_id=auth.uid()) then
    raise exception 'Geen klantorganisatie gekoppeld' using errcode='42501';
  end if;
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
end
$$;

create or replace function public.customer_reply_to_request(uuid, text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare o uuid:=nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid; ro uuid; mid uuid;
begin
  if not public.has_completed_forced_password_change() then raise exception 'Wachtwoordwijziging vereist'; end if;
  select organization_id into ro from public.support_requests where id=$1;
  if ro is null or ro<>o then raise exception 'Verzoek niet gevonden'; end if;
  insert into public.support_request_messages(request_id,organization_id,sender_id,sender_role,message,customer_viewed_at)
  values($1,o,auth.uid(),'customer',btrim($2),now()) returning id into mid;
  update public.support_requests set status='new',updated_at=now() where id=$1;
  return mid;
end
$$;

commit;