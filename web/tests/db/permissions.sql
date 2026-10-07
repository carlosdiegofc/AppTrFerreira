-- Permission checks for the panel install script, run against the local Supabase imitation.
-- Every block raises an exception when a rule is broken, so ON_ERROR_STOP makes the run fail.
\set ON_ERROR_STOP 1
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
end $$;

-- Administrator (Luis) -------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
set role authenticated;
do $$
declare n int; r record;
begin
  if not public.trf_is_panel_admin() then raise exception 'admin: trf_is_panel_admin() should be true'; end if;
  select count(*) into n from public.trf_driver_tracking_sessions;
  if n <> 4 then raise exception 'admin: expected to read 4 app trips, got %', n; end if;
  select count(*) into n from public.trf_driver_location_history;
  if n < 400 then raise exception 'admin: expected to read every GPS point, got %', n; end if;
  select count(*) into n from public.trf_driver_locations;
  if n <> 2 then raise exception 'admin: expected 2 live locations, got %', n; end if;
  select count(*) into n from storage.objects where bucket_id = 'trf-trip-documents';
  if n <> 1 then raise exception 'admin: expected to read the delivery-note photo, got %', n; end if;

  insert into public.trf_panel_trips (source, departure_at, vehicle, product) values ('manual', now(), 'Leyland · ABC1234', 'Maíz')
    returning * into r;
  if r.created_by::text <> '11111111-1111-1111-1111-111111111111' then raise exception 'admin: created_by not set'; end if;
  update public.trf_panel_trips set product = 'Soja', source = 'app', app_trip_id = 'hack', created_by = null where id = r.id returning * into r;
  if r.product <> 'Soja' or r.source <> 'manual' or r.app_trip_id is not null or r.created_by is null then
    raise exception 'admin: immutable columns changed: %', row_to_json(r);
  end if;
  begin
    insert into public.trf_panel_trips (source, departure_at, kg) values ('manual', now(), -5);
    raise exception 'admin: negative kilos were accepted';
  exception when check_violation then null; end;
  begin
    insert into public.trf_panel_trips (source, departure_at, arrival_at) values ('manual', now(), now() - interval '1 hour');
    raise exception 'admin: arrival before departure was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.trf_panel_trips (source) values ('manual');
    raise exception 'admin: manual trip without departure was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.trf_panel_trips (source, app_trip_id) values ('app', 'aaaaaaaa-0000-0000-0000-000000000003');
    raise exception 'admin: duplicated app trip was accepted';
  exception when unique_violation then null; end;
  begin
    delete from public.trf_panel_trips where id = r.id;
    raise exception 'admin: hard delete was allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.trf_panel_admins;
    raise exception 'admin: the admin list is readable from the API';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Driver (Hugo) -----------------------------------------------------------
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
set role authenticated;
do $$
declare n int;
begin
  if public.trf_is_panel_admin() then raise exception 'driver: must not be admin'; end if;
  select count(*) into n from public.trf_driver_tracking_sessions;
  if n <> 2 then raise exception 'driver: should only read own 2 trips, got %', n; end if;
  select count(*) into n from public.trf_panel_trips;
  if n <> 0 then raise exception 'driver: must not read panel trips, got %', n; end if;
  select count(*) into n from public.trf_driver_locations;
  if n <> 1 then raise exception 'driver: should only read own live location, got %', n; end if;
  begin
    insert into public.trf_panel_trips (source, departure_at) values ('manual', now());
    raise exception 'driver: insert into panel trips was allowed';
  exception when insufficient_privilege then null; end;
  update public.trf_panel_trips set notes = 'x';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'driver: updated % panel trips', n; end if;
end $$;
reset role;

-- Anonymous ----------------------------------------------------------------
select set_config('request.jwt.claims', '', false);
set role anon;
do $$
begin
  begin
    perform public.trf_is_panel_admin();
    raise exception 'anon: could call trf_is_panel_admin()';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.trf_panel_trips;
    raise exception 'anon: could read panel trips';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'permissions ok' as result;
