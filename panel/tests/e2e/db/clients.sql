-- Cobros (migration 0012): the collections from each client and its opening balance. Synthetic cases only. Run after
-- seed.sql; everything is rolled back so the browser tests keep their baseline. TEST ONLY.
\set ON_ERROR_STOP on
begin;

-- A driver sees no client's account, loads nothing and changes nothing.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000011","role":"authenticated"}', true) is not null as chofer;
do $$
declare
  n int;
begin
  if exists (select 1 from public.trf_client_movements) then raise exception 'chofer: vio cobros'; end if;
  begin
    insert into public.trf_client_movements (client_key, client_name, kind, happened_on, amount, currency, method) values ('name:navios', 'Navios', 'payment', current_date, 100, 'UYU', 'efectivo');
    raise exception 'chofer: registró un cobro';
  exception when insufficient_privilege then null;
  end;
  update public.trf_client_movements set amount = 1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'chofer: cambió un cobro'; end if;
end $$;
reset role;

-- A panel account registers and corrects them: who and when are the database's, and the checks hold.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true) is not null as lectura;
do $$
declare
  m public.trf_client_movements;
begin
  if (select count(*) from public.trf_client_movements) <> 4 then raise exception 'lectura: tendría que ver los 4 movimientos del ejemplo, el anulado también'; end if;

  insert into public.trf_client_movements (id, client_key, client_name, kind, happened_on, amount, currency, method, notes, created_by, created_at)
  values ('c3000000-0000-4000-8000-000000000001', 'name:cooperativa agraria', 'Cooperativa Agraria', 'payment', date '2026-10-14', 200, 'USD', 'cheque', 'Cheque diferido',
          '00000000-0000-4000-8000-000000000001', now() - interval '1 year')
  returning * into m;
  if m.created_by <> '00000000-0000-4000-8000-000000000002' or m.created_at < now() - interval '1 minute' or m.updated_by <> '00000000-0000-4000-8000-000000000002' then
    raise exception 'lectura: el cobro tendría que quedar a su nombre y con la fecha de hoy';
  end if;
  -- A correction can change the client, the day and the amount, but not the kind, nor who registered it nor when.
  update public.trf_client_movements set client_key = 'name:navios', client_name = 'Navios', amount = 250.5, kind = 'opening', method = 'transferencia',
    created_by = null, created_at = now() - interval '1 year'
  where id = m.id returning * into m;
  if m.client_key <> 'name:navios' or m.amount <> 250.5 or m.kind <> 'payment' or m.created_by is null or m.created_at < now() - interval '1 minute' then
    raise exception 'lectura: la corrección no quedó, o cambió el tipo, quién o cuándo lo registró';
  end if;

  -- Amounts, currencies, forms of payment, days and texts are the ones the panel offers.
  begin
    insert into public.trf_client_movements (client_key, client_name, kind, happened_on, amount, currency, method) values ('name:navios', 'Navios', 'payment', current_date, 0, 'UYU', 'efectivo');
    raise exception 'lectura: aceptó un cobro en cero';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_client_movements (client_key, client_name, kind, happened_on, amount, currency, method) values ('name:navios', 'Navios', 'payment', current_date, -10, 'UYU', 'efectivo');
    raise exception 'lectura: aceptó un cobro negativo';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_client_movements (client_key, client_name, kind, happened_on, amount, currency, method) values ('name:navios', 'Navios', 'payment', current_date, 100000000, 'UYU', 'efectivo');
    raise exception 'lectura: aceptó un importe imposible';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_client_movements (client_key, client_name, kind, happened_on, amount, currency, method) values ('name:navios', 'Navios', 'payment', current_date, 100, 'UYU', null);
    raise exception 'lectura: aceptó un cobro sin forma de cobro';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_client_movements (client_key, client_name, kind, happened_on, amount, currency, method) values ('name:navios', 'Navios', 'payment', current_date, 100, 'UYU', 'tarjeta');
    raise exception 'lectura: aceptó una forma de cobro que no es de la lista';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_client_movements (client_key, client_name, kind, happened_on, amount, currency, method) values ('name:navios', 'Navios', 'payment', current_date, 100, 'ARS', 'efectivo');
    raise exception 'lectura: aceptó otra moneda';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_client_movements (client_key, client_name, kind, happened_on, amount, currency, method) values ('name:navios', 'Navios', 'payment', date '1999-12-31', 100, 'UYU', 'efectivo');
    raise exception 'lectura: aceptó un cobro de 1999';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_client_movements (client_key, client_name, kind, happened_on, amount, currency, method) values ('name:navios', 'Navios', 'opening', current_date, 100, 'UYU', 'efectivo');
    raise exception 'lectura: aceptó un saldo inicial con forma de cobro';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_client_movements (client_key, client_name, kind, happened_on, amount, currency, method) values ('navios', 'Navios', 'payment', current_date, 100, 'UYU', 'efectivo');
    raise exception 'lectura: aceptó un cliente sin su clave';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_client_movements (client_key, client_name, kind, happened_on, amount, currency, method) values ('name:', 'Navios', 'payment', current_date, 100, 'UYU', 'efectivo');
    raise exception 'lectura: aceptó una clave sin nombre';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_client_movements (client_key, client_name, kind, happened_on, amount, currency, method) values ('name:navios', '   ', 'payment', current_date, 100, 'UYU', 'efectivo');
    raise exception 'lectura: aceptó un cobro sin el nombre del cliente';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_client_movements (client_key, client_name, kind, happened_on, amount, currency, method, notes) values ('name:navios', 'Navios', 'payment', current_date, 100, 'UYU', 'efectivo', repeat('x', 501));
    raise exception 'lectura: aceptó una nota demasiado larga';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_client_movements (client_key, client_name, kind, happened_on, amount, currency, method) values ('name:navios', 'Navios', 'retiro', current_date, 100, 'UYU', 'efectivo');
    raise exception 'lectura: aceptó un movimiento que no es cobro ni saldo inicial';
  exception when check_violation then null;
  end;

  -- The opening balance: in the client's favor too, one per client and currency. A wrong one is annulled and loaded
  -- again; an annulled one does not come back over the right one.
  insert into public.trf_client_movements (id, client_key, client_name, kind, happened_on, amount, currency) values
    ('c3000000-0000-4000-8000-000000000002', 'name:navios', 'Navios', 'opening', current_date - 30, -1200, 'UYU');
  begin
    insert into public.trf_client_movements (client_key, client_name, kind, happened_on, amount, currency) values ('name:navios', 'Navios', 'opening', current_date - 20, 300, 'UYU');
    raise exception 'lectura: aceptó dos saldos iniciales en pesos del mismo cliente';
  exception when unique_violation then null;
  end;
  insert into public.trf_client_movements (client_key, client_name, kind, happened_on, amount, currency) values ('name:navios', 'Navios', 'opening', current_date - 20, 0, 'USD');
  begin
    insert into public.trf_client_movements (client_key, client_name, kind, happened_on, amount, currency) values ('name:molino san jose', 'Molino San José', 'opening', current_date - 1, 5000, 'UYU');
    raise exception 'lectura: aceptó un segundo saldo inicial del Molino';
  exception when unique_violation then null;
  end;
  update public.trf_client_movements set deleted_at = now() where id = 'c3000000-0000-4000-8000-000000000002';
  insert into public.trf_client_movements (id, client_key, client_name, kind, happened_on, amount, currency) values
    ('c3000000-0000-4000-8000-000000000003', 'name:navios', 'Navios', 'opening', current_date - 30, -1500, 'UYU');
  begin
    update public.trf_client_movements set deleted_at = null where id = 'c3000000-0000-4000-8000-000000000002';
    raise exception 'lectura: el saldo anulado volvió sobre el correcto';
  exception when unique_violation then null;
  end;

  begin
    delete from public.trf_client_movements;
    raise exception 'lectura: pudo borrar cobros';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- A full administrator outside the panel list sees nothing; without signing in nothing is reachable.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true) is not null as admin;
do $$
begin
  if exists (select 1 from public.trf_client_movements) then raise exception 'admin fuera del panel: vio cobros'; end if;
  begin
    insert into public.trf_client_movements (client_key, client_name, kind, happened_on, amount, currency, method) values ('name:navios', 'Navios', 'payment', current_date, 100, 'UYU', 'efectivo');
    raise exception 'admin fuera del panel: registró un cobro';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.trf_client_movements;
    raise exception 'anónimo: leyó cobros';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Every save is in the private history, with who did it and how it was before.
do $$
begin
  if (select count(*) from trf_private.road_audit where entity = 'trf_client_movements' and after_row->>'id' = 'c3000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'historial: tendría que tener el alta y la corrección del cobro';
  end if;
  if (select before_row->>'client_key' from trf_private.road_audit where entity = 'trf_client_movements' and after_row->>'id' = 'c3000000-0000-4000-8000-000000000001'
      and before_row is not null order by id limit 1) <> 'name:cooperativa agraria' then
    raise exception 'historial: tendría que guardar el cliente de antes';
  end if;
  if exists (select 1 from trf_private.road_audit where entity = 'trf_client_movements' and after_row->>'id' like 'c3%' and actor is distinct from '00000000-0000-4000-8000-000000000002') then
    raise exception 'historial: tendría que anotar quién guardó';
  end if;
end $$;
rollback;
select 'cobros OK';
