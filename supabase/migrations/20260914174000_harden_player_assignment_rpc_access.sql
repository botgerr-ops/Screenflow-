begin;

revoke execute on function public.set_player_playlist_assignment(uuid,uuid,boolean) from anon, public;
grant execute on function public.set_player_playlist_assignment(uuid,uuid,boolean) to authenticated;

commit;
