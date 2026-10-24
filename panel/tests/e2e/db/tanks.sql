-- The tank of each truck (migration 0009): the «tanque lleno» mark of a fuel receipt and each truck's tank. Synthetic
-- cases only. Run after seed.sql; everything is rolled back so the browser tests keep their baseline. TEST ONLY.
\set ON_ERROR_STOP on
begin;

-- A driver says the tank was filled when loading a receipt from the app, and sees no tank.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000011","role":"authenticated"}', true) is not null as chofer;
insert into public.trf_driver_fuel_receipts (id, driver_id, driver_name, vehicle, receipt_date, station_name, liters, total, full_tank)
values ('42000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', 'Ana Pereira', 'Volvo FH 460 · ABC1234', current_date, 'Ancap Ruta 5', 180, 9000, true);
do $$
begin
  if (select full_tank from public.trf_driver_fuel_receipts where id = '42000000-0000-4000-8000-000000000001') is not true then
    raise exception 'chofer: la boleta tendría que quedar con el tanque lleno';
  end if;
  if exists (select 1 from public.trf_tank_settings) then raise exception 'chofer: vio los tanques'; end if;
  begin
    insert into public.trf_tank_settings (vehicle_key, vehicle_name, capacity_l, consumption, warning_l)
    values ('plate:def5678', 'Scania R450 · DEF5678', 400, 35, 80);
    raise exception 'chofer: pudo cargar un tanque';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A panel account corrects the mark without touching what the driver declared, loads its own receipts with it, and keeps
-- each truck's tank: who and when are the database's, the truck does not change, and nothing is deleted.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true) is not null as lectura;
do $$
declare
  r public.trf_driver_fuel_receipts;
  s public.trf_tank_settings;
begin
  update public.trf_driver_fuel_receipts set full_tank = false, panel_data = '{"tanque_lleno": false}'
  where id = '42000000-0000-4000-8000-000000000001'
  returning * into r;
  if r.full_tank is not true or r.panel_data->>'tanque_lleno' <> 'false' then
    raise exception 'lectura: la corrección del tanque lleno tendría que ir en panel_data, sin tocar lo declarado';
  end if;
  insert into public.trf_driver_fuel_receipts (id, driver_id, driver_name, vehicle, receipt_date, station_name, liters, total, full_tank)
  values ('42000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'Socio Lectura', 'Volvo FH 460 · ABC1234', current_date, 'Ancap Ruta 5', 150, 7500, true)
  returning * into r;
  if r.full_tank is not true then raise exception 'lectura: tendría que poder cargar una boleta con el tanque lleno'; end if;

  insert into public.trf_tank_settings (vehicle_key, vehicle_name, capacity_l, consumption, warning_l, created_by, created_at)
  values ('plate:def5678', 'Scania R450 · DEF5678', 400, 35, 80, '00000000-0000-4000-8000-000000000001', now() - interval '1 year')
  returning * into s;
  if s.created_by <> '00000000-0000-4000-8000-000000000002' or s.created_at < now() - interval '1 minute' then
    raise exception 'lectura: el tanque tendría que quedar a su nombre y con la fecha de hoy';
  end if;
  update public.trf_tank_settings set consumption = 33.3, vehicle_key = 'plate:otro', created_by = null
  where vehicle_key = 'plate:def5678'
  returning * into s;
  if s.vehicle_key <> 'plate:def5678' or s.consumption <> 33.3 or s.created_by is null or s.updated_by <> '00000000-0000-4000-8000-000000000002' then
    raise exception 'lectura: la corrección cambió el camión o quién lo cargó, o no se anotó';
  end if;
  begin
    update public.trf_tank_settings set warning_l = 500 where vehicle_key = 'plate:def5678';
    raise exception 'lectura: aceptó un aviso mayor que el tanque';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_tank_settings (vehicle_key, vehicle_name, capacity_l, consumption, warning_l) values ('ABC1234', 'Volvo', 400, 35, 80);
    raise exception 'lectura: aceptó un camión sin matrícula ni modelo';
  exception when check_violation then null;
  end;
  begin
    delete from public.trf_tank_settings;
    raise exception 'lectura: pudo borrar un tanque';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A full administrator keeps changing what was declared, as with the rest of the receipt, and does not see the tanks
-- without being in the panel list.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true) is not null as admin;
do $$
begin
  update public.trf_driver_fuel_receipts set full_tank = false where id = '42000000-0000-4000-8000-000000000001';
  if (select full_tank from public.trf_driver_fuel_receipts where id = '42000000-0000-4000-8000-000000000001') is not false then
    raise exception 'admin: tendría que conservar su permiso sobre lo declarado';
  end if;
  if exists (select 1 from public.trf_tank_settings) then raise exception 'admin fuera del panel: vio los tanques'; end if;
end $$;

-- Without signing in nothing is reachable; every save of a tank is in the private history (the seed's tanks are there too).
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.trf_tank_settings;
    raise exception 'anónimo: leyó los tanques';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$
begin
  if (select count(*) from trf_private.road_audit where entity = 'trf_tank_settings' and after_row->>'vehicle_key' = 'plate:def5678') <> 2 then
    raise exception 'el historial tendría que tener el alta y la corrección del tanque';
  end if;
end $$;
rollback;
select 'tanques OK';
