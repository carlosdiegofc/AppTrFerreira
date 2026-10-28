-- Tramos sin señal (migration 0013): the stretches without GPS of each trip and the readings of their estimated road.
-- Synthetic cases only. Run after seed.sql; everything is rolled back so the browser tests keep their baseline. TEST ONLY.
\set ON_ERROR_STOP on
begin;

-- A driver (Ana) records the stretches of her own trips, sees only hers and changes none.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000011","role":"authenticated"}', true) is not null as chofer;
do $$
begin
  insert into public.trf_route_gaps (id, trip_id, driver_id, vehicle, segment, from_at, to_at, from_lat, from_lng, to_lat, to_lng, straight_meters, meters, method)
  values ('70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000011', 'Volvo FH 460 · ABC1234', 0,
          now() - interval '40 minutes', now() - interval '30 minutes', -34.70, -56.20, -34.62, -56.25, 10050, 11800, 'ruta');
  -- The same stretch sent again (a sync cut halfway) is not repeated.
  insert into public.trf_route_gaps (id, trip_id, driver_id, vehicle, segment, from_at, to_at, from_lat, from_lng, to_lat, to_lng, straight_meters, meters, method)
  values ('70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000011', 'Volvo FH 460 · ABC1234', 0,
          now() - interval '40 minutes', now() - interval '30 minutes', -34.70, -56.20, -34.62, -56.25, 10050, 11800, 'ruta')
  on conflict (id) do nothing;
  -- The two of the example data and this one.
  if (select count(*) from public.trf_route_gaps) <> 3 then raise exception 'chofer: tendría que ver su tramo una sola vez'; end if;
  -- Its estimated road goes with the readings, marked, and without precision.
  insert into public.trf_driver_location_history (driver_id, vehicle, latitude, longitude, accuracy_m, recorded_at, trip_id, event_id, segment, estimated)
  values ('00000000-0000-4000-8000-000000000011', 'Volvo FH 460 · ABC1234', -34.66, -56.22, null, now() - interval '35 minutes', '10000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-0000000000a1', 0, true);
  if (select count(*) from public.trf_driver_location_history where estimated) <> 3 then raise exception 'chofer: la lectura estimada tendría que quedar marcada'; end if;
  if (select count(*) from public.trf_driver_location_history where not estimated) <> 13 then raise exception 'chofer: las lecturas de siempre quedan sin marcar'; end if;
  begin
    -- Another driver's trip, or one of hers in another driver's name: no.
    insert into public.trf_route_gaps (id, trip_id, driver_id, vehicle, from_at, to_at, from_lat, from_lng, to_lat, to_lng, straight_meters, meters, method)
    values (gen_random_uuid(), '10000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000012', 'Scania R450 · DEF5678',
            now() - interval '20 minutes', now() - interval '10 minutes', -34.7, -57.4, -34.6, -57.3, 9000, 10800, 'recta');
    raise exception 'chofer: cargó un tramo de otro chofer';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.trf_route_gaps (id, trip_id, vehicle, from_at, to_at, from_lat, from_lng, to_lat, to_lng, straight_meters, meters, method)
    values (gen_random_uuid(), '10000000-0000-4000-8000-00000000000b', 'Scania R450 · DEF5678',
            now() - interval '20 minutes', now() - interval '10 minutes', -34.7, -57.4, -34.6, -57.3, 9000, 10800, 'recta');
    raise exception 'chofer: cargó un tramo en el viaje de otro chofer';
  exception when foreign_key_violation then null;
  end;
  -- Nobody changes or deletes a stretch: it stays as the phone counted it.
  begin
    update public.trf_route_gaps set meters = 1;
    raise exception 'chofer: cambió un tramo';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.trf_route_gaps;
    raise exception 'chofer: borró un tramo';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- The controls: a stretch not filled counts nothing, the method is one of three and the end comes after the start.
do $$
begin
  begin
    insert into public.trf_route_gaps (id, trip_id, driver_id, vehicle, from_at, to_at, from_lat, from_lng, to_lat, to_lng, straight_meters, meters, method)
    values (gen_random_uuid(), '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000011', 'Volvo', now() - interval '5 hours', now(), -34.7, -56.2, -33.0, -55.0, 230000, 276000, 'sin_rellenar');
    raise exception 'un tramo sin rellenar sumó kilómetros';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_route_gaps (id, trip_id, driver_id, vehicle, from_at, to_at, from_lat, from_lng, to_lat, to_lng, straight_meters, meters, method)
    values (gen_random_uuid(), '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000011', 'Volvo', now(), now() - interval '5 minutes', -34.7, -56.2, -34.6, -56.1, 9000, 10800, 'recta');
    raise exception 'un tramo terminó antes de empezar';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_route_gaps (id, trip_id, driver_id, vehicle, from_at, to_at, from_lat, from_lng, to_lat, to_lng, straight_meters, meters, method)
    values (gen_random_uuid(), '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000011', 'Volvo', now() - interval '5 minutes', now(), -34.7, -56.2, -34.6, -56.1, 9000, 10800, 'adivinado');
    raise exception 'un tramo con otra forma de rellenar';
  exception when check_violation then null;
  end;
end $$;

-- A panel account sees every stretch and every estimated reading; it does not record stretches.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true) is not null as dueno;
do $$
begin
  if (select count(*) from public.trf_route_gaps) <> 3 then raise exception 'panel: tendría que ver los tramos de Ana'; end if;
  if (select count(*) from public.trf_driver_location_history where estimated) <> 3 then raise exception 'panel: tendría que ver las lecturas estimadas'; end if;
  begin
    insert into public.trf_route_gaps (id, trip_id, driver_id, vehicle, from_at, to_at, from_lat, from_lng, to_lat, to_lng, straight_meters, meters, method)
    values (gen_random_uuid(), '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000011', 'Volvo', now() - interval '5 minutes', now(), -34.7, -56.2, -34.6, -56.1, 9000, 10800, 'recta');
    raise exception 'panel: cargó un tramo en nombre de un chofer';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Without an account, nothing.
set local role anon;
do $$
begin
  perform 1 from public.trf_route_gaps;
  raise exception 'anónimo: leyó los tramos';
exception when insufficient_privilege then null;
end $$;
reset role;

-- An estimated reading has no precision: the observer of tolls and scales (0005) does not count it as a passage.
do $$
begin
  if exists (select 1 from public.trf_road_events where happened_at > now() - interval '1 hour' and accuracy_m is null) then
    raise exception 'una lectura estimada generó un paso';
  end if;
end $$;

rollback;
