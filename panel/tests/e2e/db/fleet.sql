-- Flota (migration 0010): the cards of trucks and trailers, which trailer each truck takes and the folder of their photos.
-- Synthetic cases only. Run after seed.sql; everything is rolled back so the browser tests keep their baseline. TEST ONLY.
\set ON_ERROR_STOP on
begin;

-- A driver sees no card and no hitch, writes none and opens or uploads no photo of the fleet.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000011","role":"authenticated"}', true) is not null as chofer;
do $$
begin
  if exists (select 1 from public.trf_fleet_units) or exists (select 1 from public.trf_fleet_hitches) then
    raise exception 'chofer: vio la flota';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'trf-fleet-photos') then raise exception 'chofer: vio las fotos de la flota'; end if;
  begin
    insert into public.trf_fleet_units (kind, vehicle_key, plate) values ('trailer', 'plate:zzz1111', 'ZZZ1111');
    raise exception 'chofer: pudo cargar una ficha';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.trf_fleet_hitch('a3000000-0000-4000-8000-000000000009', 'plate:def5678', 'a0000000-0000-4000-8000-000000000003', date '2026-10-01', null, null, '');
    raise exception 'chofer: pudo enganchar un acoplado';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('trf-fleet-photos', 'a0000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000009.jpg');
    raise exception 'chofer: pudo subir una foto de la flota';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A panel account keeps the cards: who and when are the database's, a card stays of its kind and a truck's card of its
-- truck, the checks hold and nothing is deleted.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true) is not null as lectura;
do $$
declare
  u public.trf_fleet_units;
begin
  if (select count(*) from public.trf_fleet_units) <> 4 or (select count(*) from public.trf_fleet_hitches) <> 2 then
    raise exception 'lectura: tendría que ver las 4 fichas y los 2 enganches del ejemplo';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'trf-fleet-photos') then raise exception 'lectura: no vio la foto del Volvo'; end if;

  insert into public.trf_fleet_units (id, kind, vehicle_key, plate, brand, model, year, chassis, engine, capacity, capacity_unit, created_by, created_at)
  values ('a3000000-0000-4000-8000-000000000001', 'truck', 'plate:def5678', 'DEF5678', 'Scania', 'R450', 2020, '9BSR4X200L0000001', 'DC13-0001', 32000, 'kg',
          '00000000-0000-4000-8000-000000000001', now() - interval '1 year')
  returning * into u;
  if u.created_by <> '00000000-0000-4000-8000-000000000002' or u.created_at < now() - interval '1 minute' then
    raise exception 'lectura: la ficha tendría que quedar a su nombre y con la fecha de hoy';
  end if;
  update public.trf_fleet_units set kind = 'trailer', vehicle_key = 'plate:otro', plate = 'OTRO', year = 2021, created_by = null
  where id = u.id returning * into u;
  if u.kind <> 'truck' or u.vehicle_key <> 'plate:def5678' or u.plate <> 'DEF5678' or u.year <> 2021 or u.created_by is null
    or u.updated_by <> '00000000-0000-4000-8000-000000000002' then
    raise exception 'lectura: la corrección cambió el camión de la ficha o quién la cargó, o no se anotó';
  end if;

  -- A trailer goes with its plate, which can be corrected.
  insert into public.trf_fleet_units (id, kind, vehicle_key, plate, body, capacity, capacity_unit)
  values ('a3000000-0000-4000-8000-000000000002', 'trailer', 'plate:nue3003', 'NUE3003', 'Volcadora', 20, 'm3') returning * into u;
  update public.trf_fleet_units set plate = 'NUE3004', vehicle_key = 'plate:nue3004' where id = u.id returning * into u;
  if u.vehicle_key <> 'plate:nue3004' then raise exception 'lectura: no pudo corregir la matrícula del acoplado'; end if;

  begin
    insert into public.trf_fleet_units (kind, vehicle_key, plate) values ('trailer', 'plate:abc9999', 'XYZ9999');
    raise exception 'lectura: aceptó una clave que no es la de la matrícula';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_fleet_units (kind, vehicle_key, plate) values ('trailer', 'model:randon', '');
    raise exception 'lectura: aceptó un acoplado sin matrícula';
  exception when check_violation then null;
  end;
  -- A catalog truck with a plate but no model is named by its plate alone: its key, like its tank's, is «model:» and the
  -- plate, and its card keeps the plate. Only that key goes with that plate, and never for a trailer.
  insert into public.trf_fleet_units (kind, vehicle_key, plate) values ('truck', 'model:pla1234', 'PLA1234');
  begin
    insert into public.trf_fleet_units (kind, vehicle_key, plate) values ('truck', 'model:otro', 'PLA5678');
    raise exception 'lectura: aceptó un camión con la clave de otra matrícula';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_fleet_units (kind, vehicle_key, plate) values ('trailer', 'model:pla9999', 'PLA9999');
    raise exception 'lectura: aceptó un acoplado con clave de modelo';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_fleet_units (kind, vehicle_key, plate, body) values ('truck', 'plate:ghi9012', 'GHI9012', 'Cisterna');
    raise exception 'lectura: aceptó un camión con tipo de acoplado';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_fleet_units (kind, vehicle_key, plate) values ('truck', 'plate:abc1234', 'ABC1234');
    raise exception 'lectura: aceptó una segunda ficha del Volvo';
  exception when unique_violation then null;
  end;
  begin
    update public.trf_fleet_units set year = 1900 where id = 'a3000000-0000-4000-8000-000000000001';
    raise exception 'lectura: aceptó el año 1900';
  exception when check_violation then null;
  end;
  begin
    update public.trf_fleet_units set capacity_unit = null where id = 'a3000000-0000-4000-8000-000000000001';
    raise exception 'lectura: aceptó una capacidad sin kilos ni metros cúbicos';
  exception when check_violation then null;
  end;
  begin
    update public.trf_fleet_units set photo_path = 'a0000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000005.jpg'
    where id = 'a3000000-0000-4000-8000-000000000001';
    raise exception 'lectura: aceptó la foto de otra ficha';
  exception when check_violation then null;
  end;
  begin
    update public.trf_fleet_units set left_reason = 'Vendido' where id = 'a3000000-0000-4000-8000-000000000001';
    raise exception 'lectura: aceptó un motivo de baja sin la fecha';
  exception when check_violation then null;
  end;
  begin
    delete from public.trf_fleet_units;
    raise exception 'lectura: pudo borrar una ficha';
  exception when insufficient_privilege then null;
  end;

  -- The photo of a card goes in its folder; nobody deletes it.
  insert into storage.objects (bucket_id, name) values ('trf-fleet-photos', 'a3000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000002.jpg');
  update public.trf_fleet_units set photo_path = 'a3000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000002.jpg'
  where id = 'a3000000-0000-4000-8000-000000000001';
  delete from storage.objects where bucket_id = 'trf-fleet-photos';
  if (select count(*) from storage.objects where bucket_id = 'trf-fleet-photos') <> 2 then raise exception 'lectura: pudo borrar una foto de la flota'; end if;
end $$;

-- Which trailer each truck takes: the change goes in one step, closing the trailer the truck had the day before; a stale
-- change saves nothing; days never overlap; a hitch keeps its trailer and truck, and a wrong one is annulled.
do $$
declare
  h public.trf_fleet_hitches;
  again public.trf_fleet_hitches;
begin
  -- The tanker goes on the Volvo from October 1: the grain semi-trailer stays until September 30.
  h := public.trf_fleet_hitch('a3000000-0000-4000-8000-000000000011', 'plate:abc1234', 'a0000000-0000-4000-8000-000000000003', date '2026-10-01',
                              'a2000000-0000-4000-8000-000000000001', null, 'Para la zafra de vinasa');
  if h.to_on is not null or h.truck_key <> 'plate:abc1234' or h.notes <> 'Para la zafra de vinasa' or h.created_by <> '00000000-0000-4000-8000-000000000002' then
    raise exception 'enganche: el cisterna tendría que ir en el Volvo desde hoy, a su nombre';
  end if;
  if (select to_on from public.trf_fleet_hitches where id = 'a2000000-0000-4000-8000-000000000001') <> date '2026-09-30' then
    raise exception 'enganche: el semirremolque tendría que quedar hasta el día anterior';
  end if;
  -- A request repeated because its answer was cut finds its hitch.
  again := public.trf_fleet_hitch('a3000000-0000-4000-8000-000000000011', 'plate:abc1234', 'a0000000-0000-4000-8000-000000000003', date '2026-10-01',
                                  'a2000000-0000-4000-8000-000000000001', null, 'Para la zafra de vinasa');
  if again.id <> h.id or (select count(*) from public.trf_fleet_hitches where truck_key = 'plate:abc1234' and to_on is null and deleted_at is null) <> 1 then
    raise exception 'enganche: repetir el pedido no tendría que cargar otro';
  end if;

  -- Someone saw the semi-trailer still on the Volvo: nothing is saved.
  begin
    perform public.trf_fleet_hitch('a3000000-0000-4000-8000-000000000012', 'plate:def5678', 'a0000000-0000-4000-8000-000000000002', date '2026-10-05',
                                   null, 'a2000000-0000-4000-8000-000000000001', '');
    raise exception 'enganche: aceptó un cambio con datos viejos';
  exception when serialization_failure then null;
  end;
  -- With what there is now, the semi-trailer goes on the Scania.
  h := public.trf_fleet_hitch('a3000000-0000-4000-8000-000000000012', 'plate:def5678', 'a0000000-0000-4000-8000-000000000002', date '2026-10-05', null, null, '');

  -- Days that overlap with another hitch of the same trailer or of the same truck are refused.
  begin
    insert into public.trf_fleet_hitches (trailer_id, truck_key, from_on) values ('a0000000-0000-4000-8000-000000000003', 'plate:ghi9012', date '2026-10-10');
    raise exception 'enganche: el cisterna quedó en dos camiones a la vez';
  exception when exclusion_violation then null;
  end;
  begin
    insert into public.trf_fleet_hitches (trailer_id, truck_key, from_on, to_on) values ('a3000000-0000-4000-8000-000000000002', 'plate:abc1234', date '2026-09-01', date '2026-10-02');
    raise exception 'enganche: el Volvo quedó con dos acoplados a la vez';
  exception when exclusion_violation then null;
  end;
  -- A truck is not hitched as a trailer.
  begin
    perform public.trf_fleet_hitch('a3000000-0000-4000-8000-000000000013', 'plate:ghi9012', 'a3000000-0000-4000-8000-000000000001', date '2026-10-05', null, null, '');
    raise exception 'enganche: enganchó un camión como acoplado';
  exception when check_violation then null;
  end;
  -- A change from the same day the current trailer started would leave it with no days: refused, nothing saved.
  begin
    perform public.trf_fleet_hitch('a3000000-0000-4000-8000-000000000014', 'plate:abc1234', 'a3000000-0000-4000-8000-000000000002', date '2026-10-01',
                                   'a3000000-0000-4000-8000-000000000011', null, '');
    raise exception 'enganche: dejó al cisterna sin días';
  exception when check_violation then null;
  end;

  -- A hitch keeps its trailer and its truck; a wrong one is annulled and does not count any more.
  update public.trf_fleet_hitches set trailer_id = 'a3000000-0000-4000-8000-000000000002', truck_key = 'plate:otro', notes = 'Corregido'
  where id = 'a3000000-0000-4000-8000-000000000012' returning * into h;
  if h.trailer_id <> 'a0000000-0000-4000-8000-000000000002' or h.truck_key <> 'plate:def5678' or h.notes <> 'Corregido' then
    raise exception 'enganche: la corrección cambió el acoplado o el camión';
  end if;
  update public.trf_fleet_hitches set deleted_at = now() where id = 'a3000000-0000-4000-8000-000000000012';
  h := public.trf_fleet_hitch('a3000000-0000-4000-8000-000000000015', 'plate:ghi9012', 'a0000000-0000-4000-8000-000000000002', date '2026-10-05', null, null, '');
  if h.truck_key <> 'plate:ghi9012' then raise exception 'enganche: el anulado siguió contando'; end if;
  -- A correction that also tries to move a hitch to another truck is checked as it is saved: on its own truck.
  begin
    update public.trf_fleet_hitches set to_on = date '2026-10-03', truck_key = 'plate:otro' where id = 'a2000000-0000-4000-8000-000000000001';
    raise exception 'enganche: el Volvo quedó con dos acoplados a la vez por una corrección';
  exception when exclusion_violation then null;
  end;
  begin
    delete from public.trf_fleet_hitches;
    raise exception 'enganche: pudo borrar un enganche';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A truck or a trailer given away stops taking its trailer, or going on its truck, from that day: its hitch stays until
-- the day before. The day has to be after the one it was hitched, and nothing given away is hitched again.
do $$
declare
  u public.trf_fleet_units;
begin
  -- The new tipper goes on the Scania from October 8.
  perform public.trf_fleet_hitch('a3000000-0000-4000-8000-000000000017', 'plate:def5678', 'a3000000-0000-4000-8000-000000000002', date '2026-10-08', null, null, '');
  begin
    update public.trf_fleet_units set left_on = date '2026-10-08', left_reason = 'Vendido' where id = 'a3000000-0000-4000-8000-000000000002';
    raise exception 'baja: aceptó una baja del mismo día en que se enganchó';
  exception when check_violation then null;
  end;
  if (select left_on from public.trf_fleet_units where id = 'a3000000-0000-4000-8000-000000000002') is not null
    or (select to_on from public.trf_fleet_hitches where id = 'a3000000-0000-4000-8000-000000000017') is not null then
    raise exception 'baja: la baja rechazada cambió la ficha o el enganche';
  end if;
  update public.trf_fleet_units set left_on = date '2026-10-20', left_reason = 'Vendido' where id = 'a3000000-0000-4000-8000-000000000002';
  if (select to_on from public.trf_fleet_hitches where id = 'a3000000-0000-4000-8000-000000000017') is distinct from date '2026-10-19' then
    raise exception 'baja: el acoplado vendido tendría que quedar en el Scania hasta el día anterior';
  end if;
  begin
    perform public.trf_fleet_hitch('a3000000-0000-4000-8000-000000000018', 'plate:def5678', 'a3000000-0000-4000-8000-000000000002', date '2026-10-21', null, null, '');
    raise exception 'baja: enganchó un acoplado vendido';
  exception when object_not_in_prerequisite_state then null;
  end;
  -- Back in use, it is hitched again; changing the day of a sale already saved touches no hitch.
  update public.trf_fleet_units set left_on = null, left_reason = '' where id = 'a3000000-0000-4000-8000-000000000002';
  perform public.trf_fleet_hitch('a3000000-0000-4000-8000-000000000019', 'plate:def5678', 'a3000000-0000-4000-8000-000000000002', date '2026-10-21', null, null, '');
  if (select to_on from public.trf_fleet_hitches where id = 'a3000000-0000-4000-8000-000000000017') <> date '2026-10-19' then
    raise exception 'baja: volver a usarlo cambió su enganche anterior';
  end if;

  -- The Scania is sold: the tipper stops going on it the day before, and nothing is hitched to it any more.
  update public.trf_fleet_units set left_on = date '2026-10-23', left_reason = 'Vendido' where id = 'a3000000-0000-4000-8000-000000000001' returning * into u;
  if (select to_on from public.trf_fleet_hitches where id = 'a3000000-0000-4000-8000-000000000019') is distinct from date '2026-10-22' then
    raise exception 'baja: el camión vendido tendría que dejar su acoplado el día anterior';
  end if;
  update public.trf_fleet_units set left_on = date '2026-10-22' where id = u.id;
  if (select to_on from public.trf_fleet_hitches where id = 'a3000000-0000-4000-8000-000000000019') <> date '2026-10-22' then
    raise exception 'baja: corregir el día de la baja cambió el enganche';
  end if;
  begin
    perform public.trf_fleet_hitch('a3000000-0000-4000-8000-000000000020', 'plate:def5678', 'a0000000-0000-4000-8000-000000000003', date '2026-10-24',
                                   null, 'a3000000-0000-4000-8000-000000000011', '');
    raise exception 'baja: enganchó un acoplado a un camión vendido';
  exception when object_not_in_prerequisite_state then null;
  end;
  if (select to_on from public.trf_fleet_hitches where id = 'a3000000-0000-4000-8000-000000000011') is not null then
    raise exception 'baja: el enganche rechazado sacó al cisterna del Volvo';
  end if;
end $$;

-- A full administrator outside the panel list sees nothing; without signing in nothing is reachable.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true) is not null as admin;
do $$
begin
  if exists (select 1 from public.trf_fleet_units) or exists (select 1 from storage.objects where bucket_id = 'trf-fleet-photos') then
    raise exception 'admin fuera del panel: vio la flota';
  end if;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.trf_fleet_units;
    raise exception 'anónimo: leyó las fichas';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.trf_fleet_hitch('a3000000-0000-4000-8000-000000000016', 'plate:def5678', 'a0000000-0000-4000-8000-000000000003', date '2026-10-01', null, null, '');
    raise exception 'anónimo: pudo enganchar';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Every save is in the private history: the Scania's card was created, corrected, given its photo, sold and its day
-- corrected; the Volvo's trailers changed; the sale closed the tipper's hitch.
do $$
begin
  if (select count(*) from trf_private.road_audit where entity = 'trf_fleet_units' and after_row->>'vehicle_key' = 'plate:def5678') <> 5 then
    raise exception 'el historial tendría que tener el alta, la corrección, la foto, la baja y su corrección de la ficha del Scania';
  end if;
  if (select count(*) from trf_private.road_audit where entity = 'trf_fleet_hitches' and after_row->>'truck_key' = 'plate:abc1234') < 2 then
    raise exception 'el historial tendría que tener el cambio de acoplado del Volvo';
  end if;
  if not exists (select 1 from trf_private.road_audit where entity = 'trf_fleet_hitches' and after_row->>'id' = 'a3000000-0000-4000-8000-000000000019' and after_row->>'to_on' = '2026-10-22') then
    raise exception 'el historial tendría que tener el enganche que cerró la baja del Scania';
  end if;
end $$;
rollback;
select 'flota OK';
