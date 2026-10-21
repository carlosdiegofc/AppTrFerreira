-- Synthetic cases only. Run after seed.sql. Roll back so browser tests keep their baseline.
begin;
insert into public.trf_road_points(id,name,kind,latitude,longitude) values('80000000-0000-4000-8000-000000000001','Peaje de prueba','toll',-34,-56);
insert into public.trf_driver_tracking_sessions(id,driver_id,driver_name,vehicle,started_at,active,paused,load_type,distance_meters)
values('81000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','Prueba','Prueba · TEST1',now()-interval '1 hour',true,false,'loaded',0);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","email":"dueno@ejemplo.uy","role":"authenticated"}',true);
insert into public.trf_toll_rates(point_id,vehicle_key,amount,valid_from) values('80000000-0000-4000-8000-000000000001','plate:test1',250,now());
insert into public.trf_toll_movements(vehicle_key,vehicle_name,kind,amount,notes) values('plate:test1','Prueba · TEST1','credit',20000,'Carga inicial');
do $$ begin
  begin
    insert into public.trf_toll_movements(vehicle_key,vehicle_name,kind,amount,notes) values('plate:test1','Prueba','passage',-250,'Falso');
    raise exception 'Accepted fabricated debit';
  exception when insufficient_privilege or check_violation then null; end;
  begin
    delete from public.trf_toll_movements;
    raise exception 'Accepted deletion';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000011","email":"chofer1@ejemplo.uy","role":"authenticated"}',true);
do $$ begin
  if exists(select 1 from public.trf_toll_movements) then raise exception 'Driver reads account'; end if;
  begin
    insert into public.trf_road_points(name,kind,latitude,longitude) values('No','toll',-34,-56);
    raise exception 'Driver writes points';
  exception when insufficient_privilege then null; end;
end $$;
-- Own GPS uploads create one debit; replayed fixes, a same-side return and poor accuracy do not.
do $$ declare i integer; offsets float8[] := array[-0.002,-0.0002,0.0002,0.002]; begin
  for i in 1..4 loop
    insert into public.trf_driver_location_history(driver_id,vehicle,latitude,longitude,accuracy_m,speed_kmh,recorded_at,trip_id,segment)
    values('00000000-0000-4000-8000-000000000011','Prueba · TEST1',-34+offsets[i],-56,5,5,now()+i*interval '1 second','81000000-0000-4000-8000-000000000001',0);
  end loop;
  for i in 1..4 loop
    insert into public.trf_driver_location_history(driver_id,vehicle,latitude,longitude,accuracy_m,speed_kmh,recorded_at,trip_id,segment)
    values('00000000-0000-4000-8000-000000000011','Prueba · TEST1',-34+offsets[i],-56,5,5,now()+i*interval '1 second','81000000-0000-4000-8000-000000000001',0);
  end loop;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.trf_road_events where vehicle_key='plate:test1') <> 1 then raise exception 'Expected one passage'; end if;
  if (select sum(amount) from public.trf_toll_movements where vehicle_key='plate:test1') <> 19750 then raise exception 'Wrong balance'; end if;
end $$;
insert into public.trf_toll_rates(point_id,vehicle_key,amount,valid_from) values('80000000-0000-4000-8000-000000000001','plate:test1',300,now()+interval '5 seconds');
do $$ declare i integer; offsets float8[] := array[0.002,0.0002,-0.0002,-0.002]; begin
  for i in 1..4 loop
    insert into public.trf_driver_location_history(driver_id,vehicle,latitude,longitude,accuracy_m,speed_kmh,recorded_at,trip_id,segment)
    values('00000000-0000-4000-8000-000000000011','Prueba · TEST1',-34+offsets[i],-56,5,7,now()+(i+5)*interval '1 second','81000000-0000-4000-8000-000000000001',0);
  end loop;
  if (select sum(amount) from public.trf_toll_movements where vehicle_key='plate:test1') <> 19450 then raise exception 'Wrong new tariff'; end if;
  if not exists(select 1 from public.trf_road_events where vehicle_key='plate:test1' and amount=250) then raise exception 'Historical tariff changed'; end if;
end $$;
-- Returning to the same side, an inaccurate crossing, a segment change and a long gap do not debit.
do $$ declare i integer; j integer; offsets float8[]; begin
  for j in 1..4 loop
    offsets := case when j=1 then array[-0.002,-0.0002,0.0002,-0.002]::float8[] else array[-0.002,-0.0002,0.0002,0.002]::float8[] end;
    for i in 1..4 loop
      insert into public.trf_driver_location_history(driver_id,vehicle,latitude,longitude,accuracy_m,speed_kmh,recorded_at,trip_id,segment)
      values('00000000-0000-4000-8000-000000000011','Prueba · TEST1',-34+offsets[i],-56,case when j=2 and i=3 then 70 else 5 end,5,
        now()+(20+j*10+i+case when j=4 and i=4 then 100 else 0 end)*interval '1 second','81000000-0000-4000-8000-000000000001',case when j=3 and i>=3 then 1 else 0 end);
    end loop;
  end loop;
  if (select count(*) from public.trf_road_events where vehicle_key='plate:test1') <> 2 then raise exception 'False positive crossing'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","email":"dueno@ejemplo.uy","role":"authenticated"}',true);
insert into public.trf_tank_references(vehicle_key,vehicle_name,capacity_l,liters,consumption,warning_l,trip_meters,receipt_liters)
values('plate:test1','Prueba',400,100,40,50,'{}','{}');
update public.trf_tank_references set liters=90 where vehicle_key='plate:test1';
update public.trf_road_points set notes='Editado',archived=true where id='80000000-0000-4000-8000-000000000001';
reset role;
do $$ begin
  if (select count(*) from trf_private.road_audit where entity='trf_tank_references') < 2 then raise exception 'Missing audit'; end if;
end $$;
rollback;
