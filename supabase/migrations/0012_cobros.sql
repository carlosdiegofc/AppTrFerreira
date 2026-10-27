-- Cobros (decisiones del 26/10/2026 y del 27/10/2026, segunda parte de Gastos y finanzas): la cuenta de cada cliente,
-- como la de cada estación de combustible: lo facturado en sus viajes suma, los cobros restan, y un saldo inicial con
-- su fecha guarda lo que había antes. Los clientes salen del nombre escrito en los viajes; los viajes no cambian. Solo
-- agrega: una tabla nueva con sus controles, el historial privado de cambios y los permisos. No cambia datos ni permisos
-- existentes. Los ven y los cargan solo las cuentas del panel, como los gastos. Nada se borra: un cobro o un saldo mal
-- cargado se corrige o se anula.

create table public.trf_client_movements (
  id uuid primary key default gen_random_uuid(),
  -- El cliente: su nombre sin mayúsculas, tildes ni espacios de más («name:» y el nombre), como se juntan sus viajes.
  client_key text not null,
  -- El nombre del cliente como se escribió al guardarlo.
  client_name text not null,
  -- opening: saldo inicial (positivo si el cliente le debe a la empresa, negativo si es a favor del cliente);
  -- payment: un cobro.
  kind text not null,
  happened_on date not null,
  amount numeric(14, 2) not null,
  currency text not null,
  method text,
  notes text not null default '',
  -- Un cobro o un saldo mal cargado se anula: queda guardado, pero no cuenta.
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint trf_client_movements_kind check (kind in ('opening', 'payment')),
  constraint trf_client_movements_day check (happened_on >= date '2000-01-01'),
  constraint trf_client_movements_currency check (currency in ('UYU', 'USD')),
  constraint trf_client_movements_amount check (abs(amount) < 100000000),
  -- «method is not null»: sin eso, un cobro sin forma de cobro daría nulo y el control lo dejaría pasar.
  constraint trf_client_movements_payment check (kind <> 'payment' or (amount > 0 and method is not null and method in ('efectivo', 'transferencia', 'cheque', 'otro'))),
  constraint trf_client_movements_opening check (kind <> 'opening' or method is null),
  constraint trf_client_movements_texts check (
    client_key ~ '^name:.+$' and length(client_key) <= 300 and length(trim(client_name)) between 1 and 200 and length(notes) <= 500
  )
);

-- Un saldo inicial por cliente y moneda: el mal cargado se corrige, o se anula y se carga de nuevo.
create unique index trf_client_movements_one_opening on public.trf_client_movements (client_key, currency)
  where kind = 'opening' and deleted_at is null;
create index trf_client_movements_client on public.trf_client_movements (client_key);

-- Cada guardado anota cuándo y quién, y deja fijos el tipo y quién y cuándo lo creó. Un respaldo se restaura con los
-- disparadores apagados, así conserva lo que tenía.
create function trf_private.client_movement_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ts timestamptz := clock_timestamp();
begin
  new.updated_at := ts;
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    new.created_at := ts;
    new.created_by := auth.uid();
  else
    new.id := old.id;
    new.kind := old.kind;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;
revoke all on function trf_private.client_movement_touch() from public, anon, authenticated;

create trigger trf_client_movements_touch before insert or update on public.trf_client_movements
  for each row execute function trf_private.client_movement_touch();

-- El mismo historial privado que los gastos y la flota: cada alta y cada cambio, con quién lo hizo y cómo quedó antes y
-- después.
create trigger trf_client_movements_audit after insert or update on public.trf_client_movements
  for each row execute function trf_private.audit_road();

-- Las cuentas del panel leen, dan de alta y corrigen; nadie borra. Sin ingresar no se ve ni se escribe nada.
alter table public.trf_client_movements enable row level security;
revoke all on table public.trf_client_movements from public, anon, authenticated;
grant select, insert, update on table public.trf_client_movements to authenticated;
create policy panel_read on public.trf_client_movements for select to authenticated using ((select public.trf_is_panel_admin()));
create policy panel_insert on public.trf_client_movements for insert to authenticated with check ((select public.trf_is_panel_admin()));
create policy panel_update on public.trf_client_movements for update to authenticated
  using ((select public.trf_is_panel_admin())) with check ((select public.trf_is_panel_admin()));

notify pgrst, 'reload schema';
