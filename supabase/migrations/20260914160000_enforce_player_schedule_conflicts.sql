begin;
create or replace function public.assert_player_schedule_conflicts(p_device uuid,p_playlist uuid,p_days int[],p_start time,p_end time,p_exclude uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare hit record;
begin
 select s.name,s.start_time,s.end_time into hit from public.content_schedules s join public.player_playlist_assignments a on a.playlist_id=s.playlist_id and a.device_id=p_device
 where s.active and s.id is distinct from p_exclude and s.days_of_week && p_days and s.start_time < p_end and p_start < s.end_time limit 1;
 if found then raise exception 'Planningconflict: playlist % is al actief van % tot %.',hit.name,hit.start_time,hit.end_time using errcode='23514'; end if;
end $$;
create or replace function public.enforce_schedule_conflict() returns trigger language plpgsql security definer set search_path='' as $$
declare d record; begin if not new.active then return new; end if; for d in select device_id from public.player_playlist_assignments where playlist_id=new.playlist_id loop perform public.assert_player_schedule_conflicts(d.device_id,new.playlist_id,new.days_of_week,new.start_time,new.end_time,new.id); end loop; return new; end $$;
create trigger content_schedules_conflict_guard before insert or update of playlist_id,days_of_week,start_time,end_time,active on public.content_schedules for each row execute function public.enforce_schedule_conflict();
create or replace function public.enforce_assignment_conflict() returns trigger language plpgsql security definer set search_path='' as $$
declare s record; begin for s in select id,days_of_week,start_time,end_time from public.content_schedules where playlist_id=new.playlist_id and active loop perform public.assert_player_schedule_conflicts(new.device_id,new.playlist_id,s.days_of_week,s.start_time,s.end_time,s.id); end loop; return new; end $$;
create trigger player_playlist_assignments_conflict_guard before insert on public.player_playlist_assignments for each row execute function public.enforce_assignment_conflict();
commit;