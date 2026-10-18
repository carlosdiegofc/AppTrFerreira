-- Row security of the database structure (supabase/migrations), checked against the invented data of seed.sql.
-- Each block acts as one account the way PostgREST does: role authenticated and the JWT claims. TEST ONLY.
\set ON_ERROR_STOP on

-- A driver (Ana) sees her own trips and GPS readings, the papers and services of the fleet, and nothing of the office.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000011","role":"authenticated"}', true) is not null as chofer;
do $$
begin
  if (select count(*) from public.trf_driver_tracking_sessions) <> 2 then raise exception 'chofer: tendría que ver solo sus 2 viajes'; end if;
  if (select count(*) from public.trf_driver_location_history) <> 12 then raise exception 'chofer: tendría que ver solo sus 12 lecturas GPS'; end if;
  if (select count(*) from public.trf_panel_trips) <> 0 then raise exception 'chofer: no tendría que ver los datos del panel'; end if;
  if (select count(*) from public.trf_documents) <> 3 then raise exception 'chofer: tendría que ver sus papeles y los de los camiones'; end if;
  if (select count(*) from public.trf_vehicle_maintenance) <> 3 then raise exception 'chofer: tendría que ver los services'; end if;
  if (select count(*) from public.trf_mobile_catalog) <> 1 then raise exception 'chofer: tendría que leer el catálogo'; end if;
  if public.trf_is_panel_admin() or public.trf_is_admin() then raise exception 'chofer: no es administrador'; end if;
  begin
    insert into public.trf_driver_tracking_sessions (driver_id, driver_name, vehicle) values ('00000000-0000-4000-8000-000000000012', 'Otro chofer', 'Scania R450 · DEF5678');
    raise exception 'chofer: pudo crear un viaje a nombre de otro';
  exception when insufficient_privilege then null;
  end;
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
  if (select count(*) from public.trf_driver_location_history) <> 14 then raise exception 'lectura: tendría que ver las 14 lecturas GPS'; end if;
  if (select count(*) from public.trf_panel_trips) <> 1 then raise exception 'lectura: tendría que ver los datos del panel'; end if;
  if (select count(*) from public.trf_documents) <> 3 then raise exception 'lectura: tendría que ver todos los papeles'; end if;
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

-- Without signing in nothing of the fleet can be read.
begin;
set local role anon;
do $$
begin
  if (select count(*) from public.trf_driver_tracking_sessions) <> 0 then raise exception 'anónimo: no tendría que ver viajes'; end if;
  if (select count(*) from public.trf_driver_location_history) <> 0 then raise exception 'anónimo: no tendría que ver el GPS'; end if;
  if (select count(*) from public.trf_mobile_catalog) <> 0 then raise exception 'anónimo: no tendría que leer el catálogo'; end if;
end $$;
rollback;

select 'permisos OK' as resultado;
