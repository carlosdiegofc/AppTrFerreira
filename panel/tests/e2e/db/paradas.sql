-- Paradas del viaje (migration 0014): the stops of a trip with several unloadings.
-- Synthetic cases only. Run after seed.sql; everything is rolled back so the browser tests keep their baseline. TEST ONLY.
\set ON_ERROR_STOP on
begin;

-- A driver (Ana) lists the stops of her trip, arrives, finishes one by hand and the next by moving; she sees only hers.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000011","role":"authenticated"}', true) is not null as chofer;
do $$
begin
  insert into public.trf_trip_stops (id, trip_id, driver_id, position, client, place)
  values ('80000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000011', 1, 'Molino San José', 'San José'),
         ('80000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000011', 2, 'Cooperativa del Este', 'Treinta y Tres');
  -- The same stop sent again (a sync cut halfway) is not repeated.
  insert into public.trf_trip_stops (id, trip_id, driver_id, position, client, place)
  values ('80000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000011', 1, 'Molino San José', 'San José')
  on conflict (id) do nothing;
  if (select count(*) from public.trf_trip_stops) <> 2 then raise exception 'chofer: tendría que ver sus dos paradas una sola vez'; end if;
  -- Arrives, then the unloading ends by hand; the second ends because the truck moved.
  update public.trf_trip_stops set arrived_at = now() - interval '3 hours', arrived_lat = -34.34, arrived_lng = -56.71, updated_at = now() where id = '80000000-0000-4000-8000-000000000001';
  update public.trf_trip_stops set finished_at = now() - interval '2 hours 20 minutes', finished_by = 'chofer', kg = 12500, updated_at = now() where id = '80000000-0000-4000-8000-000000000001';
  update public.trf_trip_stops set arrived_at = now() - interval '1 hour', arrived_lat = -33.23, arrived_lng = -54.38, updated_at = now() where id = '80000000-0000-4000-8000-000000000002';
  update public.trf_trip_stops set finished_at = now() - interval '20 minutes', finished_by = 'movimiento', updated_at = now() where id = '80000000-0000-4000-8000-000000000002';
  if (select count(*) from public.trf_trip_stops where finished_at is not null) <> 2 then raise exception 'chofer: las dos paradas tendrían que estar terminadas'; end if;
  -- A receipt can say which stop it is of.
  insert into public.trf_trip_documents (id, trip_id, driver_id, kind, number, stop_id)
  values ('80000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000011', 'arrival', '004600', '80000000-0000-4000-8000-000000000001');
  begin
    -- Another driver's trip, or one of hers in another driver's name: no.
    insert into public.trf_trip_stops (id, trip_id, driver_id, position, client)
    values (gen_random_uuid(), '10000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000012', 1, 'X');
    raise exception 'chofer: cargó una parada de otro chofer';
  exception when insufficient_privilege or others then
    if sqlstate not in ('42501', '23503') then raise; end if;
  end;
  begin
    insert into public.trf_trip_stops (id, trip_id, position, client)
    values (gen_random_uuid(), '10000000-0000-4000-8000-00000000000b', 1, 'X');
    raise exception 'chofer: cargó una parada en el viaje de otro chofer';
  exception when foreign_key_violation then null;
  end;
  -- A stop does not go to another driver or to a trip that is not hers.
  begin
    update public.trf_trip_stops set trip_id = '10000000-0000-4000-8000-00000000000b' where id = '80000000-0000-4000-8000-000000000001';
    raise exception 'chofer: movió una parada a otro viaje';
  exception when foreign_key_violation then null;
  end;
  begin
    update public.trf_trip_stops set driver_id = '00000000-0000-4000-8000-000000000012' where id = '80000000-0000-4000-8000-000000000001';
    raise exception 'chofer: pasó una parada a otro chofer';
  exception when insufficient_privilege then null;
  end;
  -- The phone sends «insert or update» with every column (PostgREST on_conflict=id with merge-duplicates).
  insert into public.trf_trip_stops (id, trip_id, driver_id, position, client, place, arrived_at, arrived_lat, arrived_lng, finished_at, finished_by, kg, created_at, updated_at)
  values ('80000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000011', 2, 'Cooperativa del Este', 'Treinta y Tres',
          now() - interval '1 hour', -33.23, -54.38, now() - interval '20 minutes', 'movimiento', 9800, now(), now())
  on conflict (id) do update set id = excluded.id, trip_id = excluded.trip_id, driver_id = excluded.driver_id, position = excluded.position, client = excluded.client,
    place = excluded.place, arrived_at = excluded.arrived_at, arrived_lat = excluded.arrived_lat, arrived_lng = excluded.arrived_lng, finished_at = excluded.finished_at,
    finished_by = excluded.finished_by, kg = excluded.kg, created_at = excluded.created_at, updated_at = excluded.updated_at;
  if (select kg from public.trf_trip_stops where id = '80000000-0000-4000-8000-000000000002') <> 9800 then raise exception 'chofer: el envío repetido no actualizó la parada'; end if;
  -- A stop already visited stays; one not visited yet can be removed.
  delete from public.trf_trip_stops where id = '80000000-0000-4000-8000-000000000001';
  if (select count(*) from public.trf_trip_stops) <> 2 then raise exception 'chofer: borró una parada ya visitada'; end if;
  insert into public.trf_trip_stops (id, trip_id, driver_id, position, client)
  values ('80000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000011', 3, 'Agroservicios del Norte');
  delete from public.trf_trip_stops where id = '80000000-0000-4000-8000-000000000003';
  if (select count(*) from public.trf_trip_stops) <> 2 then raise exception 'chofer: tendría que poder borrar una parada sin visitar'; end if;
end $$;
reset role;

-- The controls: a stop finishes only after arriving, in order, and by one of two ways.
do $$
begin
  begin
    insert into public.trf_trip_stops (id, trip_id, driver_id, position, finished_at, finished_by)
    values (gen_random_uuid(), '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000011', 4, now(), 'chofer');
    raise exception 'una parada terminó sin haber llegado';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_trip_stops (id, trip_id, driver_id, position, arrived_at, finished_at, finished_by)
    values (gen_random_uuid(), '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000011', 4, now(), now() - interval '5 minutes', 'chofer');
    raise exception 'una parada terminó antes de llegar';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_trip_stops (id, trip_id, driver_id, position, arrived_at, finished_at, finished_by)
    values (gen_random_uuid(), '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000011', 4, now() - interval '5 minutes', now(), 'adivinado');
    raise exception 'una parada terminó de otra forma';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_trip_stops (id, trip_id, driver_id, position, arrived_lat, arrived_lng)
    values (gen_random_uuid(), '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000011', 4, -34.3, -56.7);
    raise exception 'una parada tuvo lugar sin haber llegado';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_trip_stops (id, trip_id, driver_id, position)
    values (gen_random_uuid(), '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000011', 0);
    raise exception 'una parada en la posición 0';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_trip_stops (id, trip_id, driver_id, position, kg)
    values (gen_random_uuid(), '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000011', 4, -1);
    raise exception 'una parada con kilos negativos';
  exception when check_violation then null;
  end;
end $$;

-- Another driver (Bruno) sees none of Ana's stops; a panel account sees all of them and records none.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000012","role":"authenticated"}', true) is not null as otro_chofer;
do $$
begin
  if (select count(*) from public.trf_trip_stops) <> 0 then raise exception 'otro chofer: vio paradas de Ana'; end if;
  update public.trf_trip_stops set client = 'robado';
  if exists (select 1 from public.trf_trip_stops where client = 'robado') then raise exception 'otro chofer: cambió una parada'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true) is not null as dueno;
do $$
begin
  if (select count(*) from public.trf_trip_stops) <> 2 then raise exception 'panel: tendría que ver las paradas de Ana'; end if;
  begin
    insert into public.trf_trip_stops (id, trip_id, driver_id, position, client)
    values (gen_random_uuid(), '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000011', 5, 'X');
    raise exception 'panel: cargó una parada en nombre de un chofer';
  exception when insufficient_privilege or others then
    if sqlstate not in ('42501') then raise; end if;
  end;
end $$;
reset role;

-- Without an account, nothing.
set local role anon;
do $$
begin
  perform 1 from public.trf_trip_stops;
  raise exception 'anónimo: leyó las paradas';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;
