-- Row security of the database structure (supabase/migrations), checked against the invented data of seed.sql.
-- Each block acts as one account the way PostgREST does: role authenticated and the JWT claims. TEST ONLY.
\set ON_ERROR_STOP on

-- A driver (Ana) sees her own trips and GPS readings, the papers and services of the fleet, and nothing of the office.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000011","role":"authenticated"}', true) is not null as chofer;
do $$
declare
  n int;
begin
  if (select count(*) from public.trf_driver_tracking_sessions) <> 2 then raise exception 'chofer: tendría que ver solo sus 2 viajes'; end if;
  if (select count(*) from public.trf_driver_location_history) <> 13 then raise exception 'chofer: tendría que ver solo sus 13 lecturas GPS'; end if;
  if (select count(*) from public.trf_panel_trips) <> 0 then raise exception 'chofer: no tendría que ver los datos del panel'; end if;
  if (select count(*) from public.trf_documents) <> 3 then raise exception 'chofer: tendría que ver sus papeles y los de los camiones'; end if;
  if (select count(*) from public.trf_vehicle_maintenance) <> 3 then raise exception 'chofer: tendría que ver los services'; end if;
  if (select count(*) from public.trf_mobile_catalog) <> 1 then raise exception 'chofer: tendría que leer el catálogo'; end if;
  if public.trf_is_panel_admin() or public.trf_is_admin() then raise exception 'chofer: no es administrador'; end if;
  -- The app uploads GPS readings without id: the identity column numbers them.
  insert into public.trf_driver_location_history (driver_id, vehicle, latitude, longitude, recorded_at) values ('00000000-0000-4000-8000-000000000011', 'Volvo FH 460 · ABC1234', -34.9, -56.2, now());
  begin
    insert into public.trf_driver_tracking_sessions (driver_id, driver_name, vehicle) values ('00000000-0000-4000-8000-000000000012', 'Otro chofer', 'Scania R450 · DEF5678');
    raise exception 'chofer: pudo crear un viaje a nombre de otro';
  exception when insufficient_privilege then null;
  end;
  -- What the office completes for billing is not the driver's to write (the driver edits from the app).
  begin
    insert into public.trf_panel_trips (source, departure_at, vehicle) values ('manual', now(), 'Volvo FH 460 · ABC1234');
    raise exception 'chofer: pudo cargar un viaje en el panel';
  exception when insufficient_privilege then null;
  end;
  update public.trf_panel_trips set client = 'Otro cliente';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'chofer: no tendría que poder cambiar los datos del panel'; end if;
end $$;
rollback;

-- The partner who only reads (like the owner who drives) sees the whole fleet.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true) is not null as lectura;
do $$
begin
  if not public.trf_is_panel_admin() then raise exception 'lectura: tendría que ser administrador del panel'; end if;
  if public.trf_is_admin() then raise exception 'lectura: no es administrador completo'; end if;
  if (select count(*) from public.trf_driver_tracking_sessions) <> 6 then raise exception 'lectura: tendría que ver los 6 viajes'; end if;
  if (select count(*) from public.trf_driver_location_history) <> 15 then raise exception 'lectura: tendría que ver las 15 lecturas GPS'; end if;
  if (select count(*) from public.trf_panel_trips) <> 3 then raise exception 'lectura: tendría que ver los 3 viajes del panel'; end if;
  if (select count(*) from public.trf_trip_documents) <> 2 or (select count(*) from public.trf_driver_fuel_receipts) <> 1 then raise exception 'lectura: tendría que ver los remitos y el combustible'; end if;
  if (select count(*) from public.trf_documents) <> 3 then raise exception 'lectura: tendría que ver todos los papeles'; end if;
end $$;

-- The panel accounts complete the trips of the app, type trips by hand and send them to the trash (decision of
-- 18/10/2026). The database notes who and when, keeps where each row came from, and never deletes.
do $$
declare
  me constant uuid := '00000000-0000-4000-8000-000000000002';
  trip constant text := '10000000-0000-4000-8000-00000000000d';
  r public.trf_panel_trips;
  before timestamptz;
  n int;
begin
  insert into public.trf_panel_trips (source, departure_at, vehicle, client, created_by, updated_by, created_at)
  values ('manual', now(), 'Volvo FH 460 · ABC1234', 'Cliente nuevo', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', now() - interval '1 year')
  returning * into r;
  if r.created_by is distinct from me or r.updated_by is distinct from me or r.created_at < now() - interval '1 day' then
    raise exception 'lectura: el viaje cargado a mano tendría que quedar a su nombre y con la fecha de hoy';
  end if;

  select updated_at into before from public.trf_panel_trips where app_trip_id = trip;
  update public.trf_panel_trips
  set client = 'Molino Nuevo', source = 'manual', app_trip_id = null, created_by = me, created_at = now() - interval '1 year'
  where app_trip_id = trip and updated_at = before
  returning * into r;
  if r.id is null or r.client <> 'Molino Nuevo' then raise exception 'lectura: tendría que poder completar un viaje de la app'; end if;
  if r.source <> 'app' or r.app_trip_id is distinct from trip or r.created_by is not null or r.created_at < now() - interval '1 day' then
    raise exception 'lectura: el viaje tendría que seguir siendo de la app, con su alta original';
  end if;
  if r.updated_at <= before or r.updated_by is distinct from me then raise exception 'lectura: la modificación tendría que quedar anotada'; end if;

  -- Someone saved in between: a save that still carries the old date changes nothing, so the panel can warn.
  update public.trf_panel_trips set client = 'Otro cliente' where app_trip_id = trip and updated_at = before;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'lectura: un guardado con la fecha vieja no tendría que pisar el cambio'; end if;

  -- The trash and back.
  update public.trf_panel_trips set deleted_at = now() where app_trip_id = trip;
  update public.trf_panel_trips set deleted_at = null where app_trip_id = trip returning * into r;
  if r.deleted_at is not null then raise exception 'lectura: tendría que poder restaurar un viaje de la papelera'; end if;

  -- Deleting is not possible: trips go to the trash.
  delete from public.trf_panel_trips;
  if (select count(*) from public.trf_panel_trips) <> 4 then raise exception 'lectura: no tendría que poder borrar viajes'; end if;
end $$;
rollback;

-- The owner is a full administrator.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true) is not null as dueno;
do $$
begin
  if not (public.trf_is_panel_admin() and public.trf_is_admin()) then raise exception 'dueño: tendría que ser administrador'; end if;
  if (select count(*) from public.trf_driver_tracking_sessions) <> 6 then raise exception 'dueño: tendría que ver los 6 viajes'; end if;
end $$;
rollback;

-- A full administrator outside the panel list reads the trips but not the panel rows (edits and the bin), so the panel
-- does not open for that account.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true) is not null as admin;
do $$
declare
  n int;
begin
  if public.trf_is_panel_admin() or not public.trf_is_admin() then raise exception 'admin: tendría que ser administrador completo fuera de la lista del panel'; end if;
  if (select count(*) from public.trf_driver_tracking_sessions) <> 6 then raise exception 'admin: tendría que ver los 6 viajes'; end if;
  if (select count(*) from public.trf_panel_trips) <> 0 then raise exception 'admin: no tendría que leer los datos del panel'; end if;
  begin
    insert into public.trf_panel_trips (source, departure_at, vehicle) values ('manual', now(), 'Volvo FH 460 · ABC1234');
    raise exception 'admin: pudo cargar un viaje sin estar en la lista del panel';
  exception when insufficient_privilege then null;
  end;
  update public.trf_panel_trips set client = 'Otro cliente';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'admin: no tendría que cambiar los datos del panel'; end if;
end $$;
rollback;

-- Without signing in nothing of the fleet can be read.
begin;
set local role anon;
do $$
begin
  if (select count(*) from public.trf_driver_tracking_sessions) <> 0 then raise exception 'anónimo: no tendría que ver viajes'; end if;
  if (select count(*) from public.trf_driver_location_history) <> 0 then raise exception 'anónimo: no tendría que ver el GPS'; end if;
  if (select count(*) from public.trf_mobile_catalog) <> 0 then raise exception 'anónimo: no tendría que leer el catálogo'; end if;
  begin
    insert into public.trf_panel_trips (source, departure_at, vehicle) values ('manual', now(), 'Volvo FH 460 · ABC1234');
    raise exception 'anónimo: pudo cargar un viaje';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

select 'permisos OK' as resultado;
