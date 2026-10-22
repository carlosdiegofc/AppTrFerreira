-- Driver cards, salaries and payments (migration 0008). Synthetic cases only. Run after seed.sql; everything is rolled
-- back so the browser tests keep their baseline. TEST ONLY.
\set ON_ERROR_STOP on
begin;

-- The owner (a panel account) loads a card, a salary and payments, and corrects and annuls without deleting.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true) is not null as dueno;
insert into public.trf_drivers (id, user_id, name, phone, document_id, hired_on, license_category, pay_method, bank, bank_account)
values ('90000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000013', 'Carla Méndez', '099 123 456', '1.234.567-8', '2025-03-01', 'E', 'transferencia', 'BROU', '001234567-00001');
insert into public.trf_driver_salaries (driver_id, starts_on, amount, currency)
values ('90000000-0000-4000-8000-000000000001', '2026-09-01', 42000, 'UYU');
insert into public.trf_driver_payments (id, driver_id, paid_on, period, amount, currency, concept, method)
values ('91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', '2026-10-05', '2026-10-01', 10000, 'UYU', 'adelanto', 'efectivo');
do $$
declare
  r public.trf_driver_payments;
begin
  select * into r from public.trf_driver_payments where id = '91000000-0000-4000-8000-000000000001';
  if r.created_by <> '00000000-0000-4000-8000-000000000001' then raise exception 'dueño: el pago tendría que quedar a su nombre'; end if;
  -- A correction keeps who created it and whose payment it is.
  update public.trf_driver_payments set amount = 12000, driver_id = gen_random_uuid(), created_by = null
  where id = '91000000-0000-4000-8000-000000000001';
  select * into r from public.trf_driver_payments where id = '91000000-0000-4000-8000-000000000001';
  if r.amount <> 12000 then raise exception 'dueño: no pudo corregir el pago'; end if;
  if r.driver_id <> '90000000-0000-4000-8000-000000000001' or r.created_by is null then raise exception 'dueño: la corrección cambió de chofer o de autor'; end if;
  update public.trf_driver_payments set deleted_at = now() where id = '91000000-0000-4000-8000-000000000001';
  begin
    delete from public.trf_driver_payments;
    raise exception 'dueño: pudo borrar pagos';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.trf_drivers;
    raise exception 'dueño: pudo borrar fichas';
  exception when insufficient_privilege then null;
  end;
  -- One salary per month of start; an annulled one leaves room for the right one.
  begin
    insert into public.trf_driver_salaries (driver_id, starts_on, amount, currency) values ('90000000-0000-4000-8000-000000000001', '2026-09-01', 43000, 'UYU');
    raise exception 'dueño: dos sueldos desde el mismo mes';
  exception when unique_violation then null;
  end;
  update public.trf_driver_salaries set deleted_at = now() where driver_id = '90000000-0000-4000-8000-000000000001';
  insert into public.trf_driver_salaries (driver_id, starts_on, amount, currency) values ('90000000-0000-4000-8000-000000000001', '2026-09-01', 43000, 'UYU');
  -- The month is the first of the month; amounts, currencies, concepts and methods are the listed ones.
  begin
    insert into public.trf_driver_payments (driver_id, paid_on, period, amount, currency, concept, method) values ('90000000-0000-4000-8000-000000000001', '2026-10-05', '2026-10-05', 1, 'UYU', 'adelanto', 'efectivo');
    raise exception 'dueño: aceptó un mes que no empieza el 1';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_driver_payments (driver_id, paid_on, period, amount, currency, concept, method) values ('90000000-0000-4000-8000-000000000001', '2026-10-05', '2026-10-01', 0, 'UYU', 'adelanto', 'efectivo');
    raise exception 'dueño: aceptó un pago en cero';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_driver_payments (driver_id, paid_on, period, amount, currency, concept, method) values ('90000000-0000-4000-8000-000000000001', '2026-10-05', '2026-10-01', 5, 'ARS', 'adelanto', 'efectivo');
    raise exception 'dueño: aceptó otra moneda';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_driver_payments (driver_id, paid_on, period, amount, currency, concept, method) values ('90000000-0000-4000-8000-000000000001', '2026-10-05', '2026-10-01', 5, 'UYU', 'premio', 'efectivo');
    raise exception 'dueño: aceptó un concepto que no es de la lista';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_drivers (name, user_id) values ('Otra ficha', '00000000-0000-4000-8000-000000000013');
    raise exception 'dueño: dos fichas para la misma cuenta';
  exception when unique_violation then null;
  end;
  begin
    insert into public.trf_drivers (name) values ('   ');
    raise exception 'dueño: aceptó una ficha sin nombre';
  exception when check_violation then null;
  end;
  -- Who stopped working has the day, and only who stopped working; never before the day they started.
  update public.trf_drivers set active = false, left_on = '2026-10-10' where id = '90000000-0000-4000-8000-000000000001';
  begin
    update public.trf_drivers set active = false, left_on = null where id = '90000000-0000-4000-8000-000000000001';
    raise exception 'dueño: aceptó una baja sin el día';
  exception when check_violation then null;
  end;
  begin
    update public.trf_drivers set active = true where id = '90000000-0000-4000-8000-000000000001';
    raise exception 'dueño: aceptó una ficha activa con día de baja';
  exception when check_violation then null;
  end;
  begin
    update public.trf_drivers set left_on = '2025-02-28' where id = '90000000-0000-4000-8000-000000000001';
    raise exception 'dueño: aceptó una baja antes del ingreso';
  exception when check_violation then null;
  end;
  update public.trf_drivers set active = true, left_on = null where id = '90000000-0000-4000-8000-000000000001';
end $$;
reset role;

-- Every save is in the private history, with who did it and how it was before.
do $$
begin
  if (select count(*) from trf_private.driver_audit where entity = 'trf_driver_payments' and row_id = '91000000-0000-4000-8000-000000000001') <> 3 then
    raise exception 'historial: tendría que tener el alta, la corrección y la anulación del pago';
  end if;
  if (select before_row->>'amount' from trf_private.driver_audit where entity = 'trf_driver_payments' and row_id = '91000000-0000-4000-8000-000000000001' and before_row is not null order by id limit 1) <> '10000.00' then
    raise exception 'historial: tendría que guardar el importe de antes';
  end if;
  if exists (select 1 from trf_private.driver_audit where actor is distinct from '00000000-0000-4000-8000-000000000001'
             and (row_id = '90000000-0000-4000-8000-000000000001' or after_row->>'driver_id' = '90000000-0000-4000-8000-000000000001')) then
    raise exception 'historial: tendría que anotar quién guardó';
  end if;
end $$;

-- The partner reads the fleet as a panel account: sees the cards and the payments too.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true) is not null as socio;
do $$
begin
  if not exists (select 1 from public.trf_drivers where id = '90000000-0000-4000-8000-000000000001') then raise exception 'socio: tendría que ver las fichas'; end if;
  if not exists (select 1 from public.trf_driver_payments where driver_id = '90000000-0000-4000-8000-000000000001') then raise exception 'socio: tendría que ver los pagos'; end if;
end $$;

-- A driver, even the one of the card, sees no card, salary or payment, and cannot load any.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000013","role":"authenticated"}', true) is not null as chofer;
do $$
begin
  if exists (select 1 from public.trf_drivers) then raise exception 'chofer: vio fichas'; end if;
  if exists (select 1 from public.trf_driver_salaries) then raise exception 'chofer: vio sueldos'; end if;
  if exists (select 1 from public.trf_driver_payments) then raise exception 'chofer: vio pagos'; end if;
  begin
    insert into public.trf_driver_payments (driver_id, paid_on, period, amount, currency, concept, method) values ('90000000-0000-4000-8000-000000000001', '2026-10-05', '2026-10-01', 99999, 'UYU', 'sueldo', 'efectivo');
    raise exception 'chofer: cargó un pago';
  exception when insufficient_privilege then null;
  end;
  update public.trf_driver_salaries set amount = 99999;
  update public.trf_drivers set bank_account = 'otra';
end $$;
reset role;
do $$
begin
  if exists (select 1 from public.trf_driver_salaries where amount = 99999) or exists (select 1 from public.trf_drivers where bank_account = 'otra') then
    raise exception 'chofer: cambió un sueldo o una ficha';
  end if;
end $$;

-- A full administrator outside the panel list does not see them either, and without signing in nothing is reachable.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true) is not null as admin;
do $$
begin
  if exists (select 1 from public.trf_drivers) or exists (select 1 from public.trf_driver_payments) then raise exception 'admin fuera del panel: vio fichas o pagos'; end if;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.trf_driver_payments;
    raise exception 'anónimo: leyó pagos';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from trf_private.driver_audit;
    raise exception 'anónimo: leyó el historial';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
select 'choferes OK';
