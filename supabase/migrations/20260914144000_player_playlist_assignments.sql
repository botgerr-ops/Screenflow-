begin;

create table public.player_playlist_assignments (
  device_id uuid not null references public.devices(id) on delete cascade,
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  assigned_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (device_id, playlist_id)
);

alter table public.player_playlist_assignments enable row level security;

create policy "player_playlist_assignments_select" on public.player_playlist_assignments
for select using (
  public.is_manager() or (
    public.has_completed_forced_password_change()
    and exists (
      select 1 from public.devices d
      where d.id = player_playlist_assignments.device_id
        and d.organization_id = nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid
    )
  )
);

revoke all on table public.player_playlist_assignments from anon;
grant select on table public.player_playlist_assignments to authenticated;

create or replace function public.set_player_playlist_assignment(device_id uuid, playlist_id uuid, assigned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  device_org uuid;
  playlist_org uuid;
begin
  if auth.uid() is null then raise exception 'Niet ingelogd' using errcode='42501'; end if;

  select d.organization_id into device_org from public.devices d where d.id = $1 and d.status = 'active' for update;
  select p.organization_id into playlist_org from public.playlists p where p.id = $2;
  if device_org is null or playlist_org is null or device_org <> playlist_org then
    raise exception 'Player en afspeellijst horen niet bij dezelfde klant' using errcode='42501';
  end if;

  if not public.is_manager() and (
    not public.has_completed_forced_password_change()
    or (auth.jwt()->'app_metadata'->>'role') is distinct from 'customer_admin'
    or device_org is distinct from nullif(auth.jwt()->'app_metadata'->>'organization_id','')::uuid
    or not exists (select 1 from public.organization_members m where m.organization_id = device_org and m.user_id = auth.uid())
  ) then
    raise exception 'Geen rechten voor deze player' using errcode='42501';
  end if;

  if $3 then
    insert into public.player_playlist_assignments(device_id, playlist_id, assigned_by)
    values ($1, $2, auth.uid())
    on conflict on constraint player_playlist_assignments_pkey do nothing;
  else
    delete from public.player_playlist_assignments a where a.device_id = $1 and a.playlist_id = $2;
  end if;

  update public.devices set config_revision = config_revision + 1 where id = $1;
end
$$;

revoke all on function public.set_player_playlist_assignment(uuid, uuid, boolean) from public;
grant execute on function public.set_player_playlist_assignment(uuid, uuid, boolean) to authenticated;

commit;
