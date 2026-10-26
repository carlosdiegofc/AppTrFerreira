-- Gastos (migration 0011): each expense of the company, with its invoice. Synthetic cases only. Run after seed.sql;
-- everything is rolled back so the browser tests keep their baseline. TEST ONLY.
\set ON_ERROR_STOP on
begin;

-- A driver sees no expense and no invoice, loads none and changes none.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000012","role":"authenticated"}', true) is not null as chofer;
do $$
begin
  if exists (select 1 from public.trf_expenses) then raise exception 'chofer: vio gastos'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'trf-expense-files') then raise exception 'chofer: vio las facturas'; end if;
  begin
    insert into public.trf_expenses (spent_on, category, amount, currency, target, method) values (current_date, 'Viáticos', 5000, 'UYU', 'company', 'efectivo');
    raise exception 'chofer: cargó un gasto';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('trf-expense-files', 'b0000000-0000-4000-8000-000000000003/b1000000-0000-4000-8000-000000000009.jpg');
    raise exception 'chofer: subió una factura';
  exception when insufficient_privilege then null;
  end;
  update public.trf_expenses set amount = 1;
end $$;
reset role;
do $$
begin
  if exists (select 1 from public.trf_expenses where amount = 1) then raise exception 'chofer: cambió un gasto'; end if;
end $$;

-- A panel account loads and corrects them: who and when are the database's, and the checks hold.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true) is not null as lectura;
do $$
declare
  e public.trf_expenses;
begin
  if (select count(*) from public.trf_expenses) <> 8 then raise exception 'lectura: tendría que ver los 8 gastos del ejemplo'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'trf-expense-files') then raise exception 'lectura: no vio la factura del Volvo'; end if;

  insert into public.trf_expenses (id, spent_on, category, amount, currency, target, vehicle_key, target_name, supplier, method, created_by, created_at)
  values ('b3000000-0000-4000-8000-000000000001', date '2026-10-14', 'Reparación y repuestos', 7300.5, 'UYU', 'truck', 'plate:mno7890', 'Iveco Stralis · MNO7890',
          'Repuestos del Norte', 'tarjeta', '00000000-0000-4000-8000-000000000001', now() - interval '1 year')
  returning * into e;
  if e.created_by <> '00000000-0000-4000-8000-000000000002' or e.created_at < now() - interval '1 minute' or e.updated_by <> '00000000-0000-4000-8000-000000000002' then
    raise exception 'lectura: el gasto tendría que quedar a su nombre y con la fecha de hoy';
  end if;
  -- A correction can change what the expense goes to, but not who loaded it nor when.
  update public.trf_expenses set amount = 7400, target = 'company', vehicle_key = null, target_name = '', created_by = null, created_at = now() - interval '1 year'
  where id = e.id returning * into e;
  if e.amount <> 7400 or e.target <> 'company' or e.created_by is null or e.created_at < now() - interval '1 minute' then
    raise exception 'lectura: la corrección no quedó, o cambió quién o cuándo lo cargó';
  end if;

  -- The invoice goes in the expense's folder, and a new one does not replace the old one.
  insert into storage.objects (bucket_id, name) values ('trf-expense-files', 'b3000000-0000-4000-8000-000000000001/b1000000-0000-4000-8000-000000000002.pdf');
  update public.trf_expenses set file_path = 'b3000000-0000-4000-8000-000000000001/b1000000-0000-4000-8000-000000000002.pdf' where id = e.id;
  begin
    update public.trf_expenses set file_path = 'b0000000-0000-4000-8000-000000000001/b1000000-0000-4000-8000-000000000001.jpg' where id = e.id;
    raise exception 'lectura: aceptó la factura de otro gasto';
  exception when check_violation then null;
  end;
  begin
    update public.trf_expenses set file_path = 'b3000000-0000-4000-8000-000000000001/b1000000-0000-4000-8000-000000000003.png' where id = e.id;
    raise exception 'lectura: aceptó una factura que no es foto ni PDF';
  exception when check_violation then null;
  end;
  delete from storage.objects where bucket_id = 'trf-expense-files';
  if (select count(*) from storage.objects where bucket_id = 'trf-expense-files') <> 2 then raise exception 'lectura: pudo borrar una factura'; end if;

  -- Amounts, currencies, methods, days and texts are the ones the panel offers.
  begin
    insert into public.trf_expenses (spent_on, category, amount, currency, target, method) values (current_date, 'Seguro', 0, 'UYU', 'company', 'efectivo');
    raise exception 'lectura: aceptó un gasto en cero';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_expenses (spent_on, category, amount, currency, target, method) values (current_date, 'Seguro', 100000000, 'UYU', 'company', 'efectivo');
    raise exception 'lectura: aceptó un importe imposible';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_expenses (spent_on, category, amount, currency, target, method) values (current_date, 'Seguro', 10, 'ARS', 'company', 'efectivo');
    raise exception 'lectura: aceptó otra moneda';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_expenses (spent_on, category, amount, currency, target, method) values (current_date, 'Seguro', 10, 'UYU', 'company', 'trueque');
    raise exception 'lectura: aceptó un medio de pago que no es de la lista';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_expenses (spent_on, category, amount, currency, target, method) values (date '1999-12-31', 'Seguro', 10, 'UYU', 'company', 'efectivo');
    raise exception 'lectura: aceptó un gasto de 1999';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_expenses (spent_on, category, amount, currency, target, method) values (current_date, '   ', 10, 'UYU', 'company', 'efectivo');
    raise exception 'lectura: aceptó un gasto sin tipo';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_expenses (spent_on, category, amount, currency, target, method) values (current_date, ' Seguro', 10, 'UYU', 'company', 'efectivo');
    raise exception 'lectura: aceptó un tipo con espacios de más';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_expenses (spent_on, category, amount, currency, target, method, supplier) values (current_date, 'Seguro', 10, 'UYU', 'company', 'efectivo', repeat('x', 121));
    raise exception 'lectura: aceptó un proveedor demasiado largo';
  exception when check_violation then null;
  end;

  -- Each expense goes to one thing, with its key and nothing else.
  begin
    insert into public.trf_expenses (spent_on, category, amount, currency, target, method, vehicle_key) values (current_date, 'Seguro', 10, 'UYU', 'company', 'efectivo', 'plate:abc1234');
    raise exception 'lectura: aceptó un gasto de la empresa con camión';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_expenses (spent_on, category, amount, currency, target, method, vehicle_key) values (current_date, 'Lavado', 10, 'UYU', 'truck', 'efectivo', 'abc1234');
    raise exception 'lectura: aceptó un camión sin su clave';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_expenses (spent_on, category, amount, currency, target, method, vehicle_key, driver_id)
    values (current_date, 'Lavado', 10, 'UYU', 'truck', 'efectivo', 'plate:abc1234', '70000000-0000-4000-8000-000000000001');
    raise exception 'lectura: aceptó un gasto de un camión y de un chofer a la vez';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_expenses (spent_on, category, amount, currency, target, method) values (current_date, 'Viáticos', 10, 'UYU', 'driver', 'efectivo');
    raise exception 'lectura: aceptó un gasto de un chofer sin su ficha';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_expenses (spent_on, category, amount, currency, target, method, trip_key) values (current_date, 'Peajes en efectivo', 10, 'UYU', 'trip', 'efectivo', 'app:123');
    raise exception 'lectura: aceptó una clave de viaje que no es la del panel';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_expenses (spent_on, category, amount, currency, target, method, trip_key)
    values (current_date, 'Peajes en efectivo', 10, 'UYU', 'trip', 'efectivo', 'otro:10000000-0000-4000-8000-00000000000d');
    raise exception 'lectura: aceptó un viaje que no es de la app ni del panel';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_expenses (spent_on, category, amount, currency, target, method) values (current_date, 'Seguro', 10, 'UYU', 'cliente', 'efectivo');
    raise exception 'lectura: aceptó un gasto que no va a nada de la lista';
  exception when check_violation then null;
  end;
  -- A trailer's expense goes with a trailer's card: not a truck's, nor one that does not exist.
  begin
    insert into public.trf_expenses (spent_on, category, amount, currency, target, method, trailer_id) values (current_date, 'Lavado', 10, 'UYU', 'trailer', 'efectivo', 'a0000000-0000-4000-8000-000000000001');
    raise exception 'lectura: aceptó la ficha de un camión como acoplado';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_expenses (spent_on, category, amount, currency, target, method, trailer_id) values (current_date, 'Lavado', 10, 'UYU', 'trailer', 'efectivo', gen_random_uuid());
    raise exception 'lectura: aceptó un acoplado que no existe';
  exception when check_violation then null;
  end;
  insert into public.trf_expenses (spent_on, category, amount, currency, target, method, trailer_id, target_name)
  values (current_date, 'Lavado', 800, 'UYU', 'trailer', 'efectivo', 'a0000000-0000-4000-8000-000000000003', 'Cisterna Facchini · CIS2002');
  -- A trip's expense keeps its key even when the trip is not in the list any more (a trip in the trash keeps its costs).
  insert into public.trf_expenses (spent_on, category, amount, currency, target, method, trip_key, target_name)
  values (current_date, 'Peajes en efectivo', 260, 'UYU', 'trip', 'efectivo', 'web:20000000-0000-4000-8000-000000000001', 'Orden de carga 24101 · Young → Nueva Palmira');

  begin
    delete from public.trf_expenses;
    raise exception 'lectura: pudo borrar un gasto';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The cost of a done service: of its truck, one that counts per service, and it stays of its service. A wrong one is
-- annulled and loaded again; an annulled one does not come back over the right one.
do $$
declare
  e public.trf_expenses;
begin
  begin
    insert into public.trf_expenses (spent_on, category, amount, currency, target, method, service_id) values (current_date, 'Service', 10, 'UYU', 'company', 'efectivo', '70000000-0000-4000-8000-000000000005');
    raise exception 'servicio: aceptó el costo de un service que no es de un camión';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_expenses (spent_on, category, amount, currency, target, method, vehicle_key, service_id)
    values (current_date - 18, 'Cubiertas', 2500, 'USD', 'truck', 'transferencia', 'plate:jkl3456', '70000000-0000-4000-8000-000000000003');
    raise exception 'servicio: aceptó dos costos del mismo service';
  exception when unique_violation then null;
  end;
  update public.trf_expenses set service_id = '70000000-0000-4000-8000-000000000005', amount = 2450 where id = 'b0000000-0000-4000-8000-000000000002' returning * into e;
  if e.service_id <> '70000000-0000-4000-8000-000000000003' or e.amount <> 2450 then
    raise exception 'servicio: la corrección cambió de qué service es el costo';
  end if;
  update public.trf_expenses set deleted_at = now() where id = 'b0000000-0000-4000-8000-000000000002';
  insert into public.trf_expenses (id, spent_on, category, amount, currency, target, method, vehicle_key, target_name, service_id)
  values ('b3000000-0000-4000-8000-000000000002', current_date - 18, 'Cubiertas', 2500, 'USD', 'truck', 'transferencia', 'plate:jkl3456', 'Ford Cargo 1722 · JKL3456',
          '70000000-0000-4000-8000-000000000003');
  begin
    update public.trf_expenses set deleted_at = null where id = 'b0000000-0000-4000-8000-000000000002';
    raise exception 'servicio: el costo anulado volvió sobre el correcto';
  exception when unique_violation then null;
  end;
  -- The service of the Scania gets its cost too.
  insert into public.trf_expenses (spent_on, category, amount, currency, target, method, vehicle_key, target_name, service_id)
  values (current_date - 30, 'Service', 32000, 'UYU', 'truck', 'transferencia', 'plate:def5678', 'Scania R450 · DEF5678', '70000000-0000-4000-8000-000000000005');
end $$;

-- A full administrator outside the panel list sees nothing; without signing in nothing is reachable.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true) is not null as admin;
do $$
begin
  if exists (select 1 from public.trf_expenses) or exists (select 1 from storage.objects where bucket_id = 'trf-expense-files') then
    raise exception 'admin fuera del panel: vio gastos o facturas';
  end if;
  begin
    insert into public.trf_expenses (spent_on, category, amount, currency, target, method) values (current_date, 'Seguro', 10, 'UYU', 'company', 'efectivo');
    raise exception 'admin fuera del panel: cargó un gasto';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.trf_expenses;
    raise exception 'anónimo: leyó gastos';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from storage.objects where bucket_id = 'trf-expense-files') then raise exception 'anónimo: vio las facturas'; end if;
end $$;
reset role;

-- Every save is in the private history, with who did it and how it was before.
do $$
begin
  if (select count(*) from trf_private.road_audit where entity = 'trf_expenses' and after_row->>'id' = 'b3000000-0000-4000-8000-000000000001') <> 3 then
    raise exception 'historial: tendría que tener el alta, la corrección y la factura del gasto del Iveco';
  end if;
  if (select before_row->>'amount' from trf_private.road_audit where entity = 'trf_expenses' and after_row->>'id' = 'b3000000-0000-4000-8000-000000000001'
      and before_row is not null order by id limit 1) <> '7300.50' then
    raise exception 'historial: tendría que guardar el importe de antes';
  end if;
  if exists (select 1 from trf_private.road_audit where entity = 'trf_expenses' and after_row->>'id' like 'b3%' and actor is distinct from '00000000-0000-4000-8000-000000000002') then
    raise exception 'historial: tendría que anotar quién guardó';
  end if;
  if (select count(*) from trf_private.road_audit where entity = 'trf_expenses' and after_row->>'id' = 'b0000000-0000-4000-8000-000000000002') <> 3 then
    raise exception 'historial: tendría que tener el alta, la corrección y la anulación del costo de las cubiertas';
  end if;
end $$;
rollback;
select 'gastos OK';
