-- Combustible (decisión del 19/10/2026): las cuentas del panel cargan y corrigen boletas, y cada estación de servicio
-- lleva su cuenta corriente: el saldo que ya existía con su fecha, más las cargas desde ese día, menos los pagos.
-- Solo agrega: dos columnas, una función, un disparador y una política en las boletas, y una tabla nueva con su función,
-- su disparador y sus políticas. No cambia datos ni quita permisos.
--
-- Una boleta cargada desde el panel queda a nombre de quien la carga, sin viaje: entra con las reglas de alta que ya
-- existen (receipts_insert, y la foto en la carpeta propia «standalone» de trf-fuel-receipts).

-- Boletas: cuándo y quién las corrigió por última vez. La fecha es la que usa el panel para avisar si otra persona
-- cambió la boleta mientras alguien la corregía.
alter table public.trf_driver_fuel_receipts
  add column updated_at timestamptz,
  add column updated_by uuid;

-- Las cuentas del panel corrigen sin tocar lo que declaró el chofer (o quien cargó la boleta): la corrección va en
-- panel_data, que ya leen la app y los dos paneles, y la papelera en archived. Los administradores completos conservan
-- el permiso que ya tenían (receipts_admin_update), y la base misma también (sin sesión: el SQL del dueño, un respaldo).
-- Un respaldo se restaura con los disparadores apagados (session_replication_role = replica), así conserva sus fechas.
create or replace function public.trf_fuel_receipts_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  if auth.uid() is not null and not public.trf_is_admin() then
    new.id := old.id;
    new.trip_id := old.trip_id;
    new.driver_id := old.driver_id;
    new.driver_name := old.driver_name;
    new.vehicle := old.vehicle;
    new.recorded_at := old.recorded_at;
    new.receipt_date := old.receipt_date;
    new.distance_meters := old.distance_meters;
    new.object_path := old.object_path;
    new.station_id := old.station_id;
    new.station_name := old.station_name;
    new.liters := old.liters;
    new.total := old.total;
  end if;
  return new;
end;
$$;

create trigger trf_fuel_receipts_touch
  before update on public.trf_driver_fuel_receipts
  for each row execute function public.trf_fuel_receipts_touch();

create policy trf_panel_admin_update on public.trf_driver_fuel_receipts
  as permissive for update to authenticated
  using ((select public.trf_is_panel_admin()))
  with check ((select public.trf_is_panel_admin()));

-- Pagos a cada estación y su saldo inicial. La estación es la de la lista del catálogo («id:» y su id) o, escrita a mano
-- en las boletas, su nombre sin mayúsculas, tildes ni espacios de más («name:» y el nombre). Un saldo inicial por
-- estación y moneda: las boletas y los pagos anteriores a su fecha quedan dentro de él. Nada se borra: lo anulado queda
-- con deleted_at.
create table public.trf_fuel_station_movements (
  id uuid primary key default gen_random_uuid(),
  station_key text not null,
  -- El nombre de la estación como se veía al guardarlo.
  station_name text not null,
  -- opening: saldo inicial (positivo si se le debe a la estación); payment: un pago.
  kind text not null,
  happened_on date not null,
  amount numeric(14, 2) not null,
  currency text not null,
  method text,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint trf_fuel_station_movements_kind check (kind in ('opening', 'payment')),
  constraint trf_fuel_station_movements_currency check (currency in ('UYU', 'USD')),
  -- «method is not null»: sin eso, un pago sin forma de pago daría nulo y el control lo dejaría pasar.
  constraint trf_fuel_station_movements_payment check (kind <> 'payment' or (amount > 0 and method is not null and method in ('efectivo', 'transferencia', 'cheque', 'otro'))),
  constraint trf_fuel_station_movements_opening check (kind <> 'opening' or method is null),
  constraint trf_fuel_station_movements_texts check (
    station_key ~ '^(id|name):.+$' and length(station_key) <= 200 and length(trim(station_name)) between 1 and 120 and coalesce(length(notes), 0) <= 500
  )
);

create unique index trf_fuel_station_movements_one_opening on public.trf_fuel_station_movements (station_key, currency)
  where kind = 'opening' and deleted_at is null;

-- Cada guardado anota cuándo y quién, y deja fijos el tipo y quién y cuándo lo creó.
create or replace function public.trf_fuel_station_movements_touch()
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

create trigger trf_fuel_station_movements_touch
  before insert or update on public.trf_fuel_station_movements
  for each row execute function public.trf_fuel_station_movements_touch();

alter table public.trf_fuel_station_movements enable row level security;

-- Las cuentas del panel (las mismas que guardan viajes y boletas) leen, registran y corrigen.
create policy trf_fuel_station_movements_select on public.trf_fuel_station_movements
  as permissive for select to authenticated
  using ((select public.trf_is_panel_admin()));

create policy trf_fuel_station_movements_insert on public.trf_fuel_station_movements
  as permissive for insert to authenticated
  with check ((select public.trf_is_panel_admin()));

create policy trf_fuel_station_movements_update on public.trf_fuel_station_movements
  as permissive for update to authenticated
  using ((select public.trf_is_panel_admin()))
  with check ((select public.trf_is_panel_admin()));

-- Una tabla nueva no lleva los permisos amplios que Supabase da por defecto: sin ingresar no se ve ni se escribe nada,
-- y con sesión solo leer, dar de alta y modificar (nunca borrar).
revoke all on table public.trf_fuel_station_movements from anon, authenticated;
grant select, insert, update on table public.trf_fuel_station_movements to authenticated;
