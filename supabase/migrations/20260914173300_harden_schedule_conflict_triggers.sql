begin;

-- Trigger helpers are internal database implementation details, never public RPCs.
revoke all on function public.assert_player_schedule_conflicts(uuid,uuid,int[],time,time,uuid) from public, anon, authenticated;
revoke all on function public.enforce_schedule_conflict() from public, anon, authenticated;
revoke all on function public.enforce_assignment_conflict() from public, anon, authenticated;

commit;
