-- Read-only catalog verification for NarrowVision player core.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='devices'
  and column_name in ('device_uid','pairing_code','pairing_code_expires_at','player_secret_hash','manufacturer','model','os_version','sdk_version','app_version','firmware_version','last_seen_at','last_sync_at','current_playlist_id','config_revision')
order by column_name;

select indexname, indexdef from pg_indexes
where schemaname='public' and tablename in ('devices','player_commands')
order by tablename,indexname;

select c.conname, pg_get_constraintdef(c.oid)
from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
where n.nspname='public' and t.relname in ('devices','player_commands')
order by t.relname,c.conname;

select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and relname in ('devices','player_commands');

select p.oid::regprocedure::text as signature,p.prosecdef,p.proconfig,p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('manager_pair_player','customer_pair_player','handle_new_user','rls_auto_enable','guard_archived_ticket_message','guard_screenflow_ticket','next_screenflow_customer_number')
order by 1;
