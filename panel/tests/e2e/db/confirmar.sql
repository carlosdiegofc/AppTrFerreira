-- Confirmar viajes y modos de cada chofer (migration 0015). Synthetic cases only. Run after seed.sql; everything is
-- rolled back so the browser tests keep their baseline. TEST ONLY.
\set ON_ERROR_STOP on
begin;

-- A driver (Ana): a trip that started by itself is born pending, a resend does not change it, and only she answers it once.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000011","role":"authenticated"}', true) is not null as chofer;
do $$
declare answer text;
begin
  insert into public.trf_driver_tracking_sessions (id, driver_id, driver_name, vehicle, started_at, active, auto, confirmation)
  values ('90000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', 'Ana', 'Camión de prueba', now() - interval '1 hour', true, true, 'con_carga');
  if (select confirmation from public.trf_driver_tracking_sessions where id = '90000000-0000-4000-8000-000000000001') <> 'pendiente' then
    raise exception 'chofer: un viaje automático tiene que nacer pendiente';
  end if;
  -- The phone sends the trip again with every column: the answer stays.
  insert into public.trf_driver_tracking_sessions (id, driver_id, driver_name, vehicle, started_at, active, auto)
  values ('90000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', 'Ana', 'Camión de prueba', now() - interval '1 hour', false, true)
  on conflict (id) do update set active = excluded.active, auto = excluded.auto;
  update public.trf_driver_tracking_sessions set confirmation = 'descartado' where id = '90000000-0000-4000-8000-000000000001';
  if (select confirmation from public.trf_driver_tracking_sessions where id = '90000000-0000-4000-8000-000000000001') <> 'pendiente' then
    raise exception 'chofer: cambió la confirmación sin la función';
  end if;
  answer := public.trf_confirm_trip('90000000-0000-4000-8000-000000000001', 'vacio');
  if answer <> 'vacio' or (select load_type from public.trf_driver_tracking_sessions where id = '90000000-0000-4000-8000-000000000001') <> 'empty' then
    raise exception 'chofer: vacío tiene que quedar con la carga vacía';
  end if;
  -- The first answer counts.
  if public.trf_confirm_trip('90000000-0000-4000-8000-000000000001', 'descartado') <> 'vacio' then raise exception 'chofer: cambió una respuesta ya dada'; end if;
  -- A trip by hand is not pending.
  insert into public.trf_driver_tracking_sessions (id, driver_id, driver_name, vehicle, started_at, active)
  values ('90000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000011', 'Ana', 'Camión de prueba', now() - interval '3 hours', false);
  if (select confirmation from public.trf_driver_tracking_sessions where id = '90000000-0000-4000-8000-000000000002') is not null then
    raise exception 'chofer: un viaje a mano quedó pendiente';
  end if;
  -- Her modes: ghost and zafra.
  insert into public.trf_driver_modes (driver_id, driver_name, ghost_until, ghost_by, zafra, zafra_since)
  values ('00000000-0000-4000-8000-000000000011', 'Ana', 'infinity', 'chofer', true, now());
  begin
    insert into public.trf_driver_modes (driver_id, ghost_until) values ('00000000-0000-4000-8000-000000000012', now() + interval '1 day');
    raise exception 'chofer: puso en modo fantasma a otro chofer';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Another driver cannot answer Ana's trip, nor see her modes.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000012","role":"authenticated"}', true) is not null as otro_chofer;
do $$
begin
  begin
    perform public.trf_confirm_trip('90000000-0000-4000-8000-000000000001', 'descartado');
    raise exception 'otro chofer: contestó un viaje ajeno';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.trf_driver_modes where driver_id = '00000000-0000-4000-8000-000000000011') then raise exception 'otro chofer: ve los modos de Ana'; end if;
end $$;
reset role;

-- The owner (panel account) corrects any answer and puts a driver in ghost mode.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true) is not null as dueno;
do $$
begin
  if public.trf_confirm_trip('90000000-0000-4000-8000-000000000001', 'descartado') <> 'descartado' then raise exception 'dueño: no pudo corregir'; end if;
  if (select confirmed_role from public.trf_driver_tracking_sessions where id = '90000000-0000-4000-8000-000000000001') <> 'panel' then raise exception 'dueño: tendría que quedar como panel'; end if;
  if public.trf_confirm_trip('90000000-0000-4000-8000-000000000001', 'con_carga') <> 'con_carga' then raise exception 'dueño: no pudo recuperar el viaje'; end if;
  insert into public.trf_driver_modes (driver_id, driver_name, ghost_until, ghost_by) values ('00000000-0000-4000-8000-000000000012', 'Beto', now() + interval '3 days', 'panel');
  update public.trf_driver_modes set ghost_until = null, ghost_by = null where driver_id = '00000000-0000-4000-8000-000000000011';
end $$;
reset role;

-- Nobody without a session.
set local role anon;
do $$
begin
  begin
    perform public.trf_confirm_trip('90000000-0000-4000-8000-000000000001', 'descartado');
    raise exception 'anónimo: confirmó un viaje';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;
