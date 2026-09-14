-- ScreenFlow Admin 0.8.1: servertijd, mediaopslag en media-afhankelijkheden.
-- Herhaalbaar. Geen wijzigingen aan bestaande licentie-einddatums of content.
begin;
create or replace function public.screenflow_operational_summary(p_organization_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $fn$
declare bytes bigint; files bigint;
begin
  if auth.uid() is null then raise exception 'Niet ingelogd'; end if;
  if not public.is_manager() then
    if (auth.jwt()->'app_metadata'->>'role') is distinct from 'customer_admin'
       or p_organization_id is null
       or p_organization_id is distinct from nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid then
      raise exception 'Geen toegang tot deze organisatie';
    end if;
  end if;
  if p_organization_id is not null then
    select coalesce(sum(size_bytes),0),count(*) into bytes,files
    from public.media_items where organization_id=p_organization_id;
  end if;
  return jsonb_build_object('server_time',now(),'media_bytes',coalesce(bytes,0),'media_count',coalesce(files,0));
end;
$fn$;
revoke all on function public.screenflow_operational_summary(uuid) from public;
grant execute on function public.screenflow_operational_summary(uuid) to authenticated;

create or replace function public.screenflow_media_dependencies(p_media_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $fn$
declare org uuid; result jsonb;
begin
  if auth.uid() is null then raise exception 'Niet ingelogd'; end if;
  select organization_id into org from public.media_items where id=p_media_id;
  if org is null then raise exception 'Media niet gevonden'; end if;
  if not public.is_manager() and
     ((auth.jwt()->'app_metadata'->>'role') is distinct from 'customer_admin'
      or org is distinct from nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid) then
    raise exception 'Geen toegang tot deze media';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('name',p.name,'uses',p.uses) order by p.name),'[]'::jsonb)
  into result from (
    select list.id,list.name,count(*) as uses from public.playlist_items item
    join public.playlists list on list.id=item.playlist_id
    where item.media_id=p_media_id and list.organization_id=org
    group by list.id,list.name
  ) p;
  return result;
end;
$fn$;
revoke all on function public.screenflow_media_dependencies(uuid) from public;
grant execute on function public.screenflow_media_dependencies(uuid) to authenticated;
commit;
