-- Run only against NarrowVision Player Core Test after 20260914133000.
-- All mutations are rolled back.

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"role":"customer_admin","organization_id":"20000000-0000-0000-0000-000000000001","force_password_change":true}}',true);

do $$
begin
  if (select count(*) from public.organizations) <> 0
     or (select count(*) from public.devices) <> 0
     or (select count(*) from public.licenses) <> 0
     or (select count(*) from public.media_items) <> 0 then
    raise exception 'Forced-password customer can still read protected data';
  end if;
end $$;

do $$
declare blocked boolean := false;
begin
  begin
    perform public.customer_mark_requests_viewed();
  exception when others then
    blocked := true;
  end;
  if not blocked then
    raise exception 'Forced-password customer can still call customer RPCs';
  end if;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"role":"customer_admin","organization_id":"20000000-0000-0000-0000-000000000001","force_password_change":false}}',true);

do $$
begin
  if (select count(*) from public.organizations) <> 1
     or (select count(*) from public.devices) <> 2
     or (select count(*) from public.licenses) <> 1 then
    raise exception 'Completed customer does not have expected own-organization access';
  end if;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"role":"customer_admin","organization_id":"20000000-0000-0000-0000-000000000001","force_password_change":false}}',true);

do $$
begin
  if (select count(*) from public.organizations where id='20000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'Different customer can read another organization';
  end if;
end $$;
rollback;