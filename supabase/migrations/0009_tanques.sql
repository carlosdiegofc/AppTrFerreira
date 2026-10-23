-- Combustible: el tanque estimado de cada camión (decisión del 22/10/2026). Solo agrega: una columna en las boletas con
-- su disparador, y una tabla nueva con el tanque y el consumo de cada camión, con su historial privado y sus permisos. No
-- cambia datos, funciones ni permisos existentes.

-- «Llené el tanque»: lo declara quien carga la boleta, el chofer en la app (desde la 0.20.0) o la oficina al cargarla en
-- el panel. Nulo: no lo dijo; las versiones anteriores de la app no lo mandan. La oficina lo corrige en panel_data
-- (tanque_lleno), como el resto de la boleta, sin tocar lo que declaró el chofer.
alter table public.trf_driver_fuel_receipts add column full_tank boolean;

-- Como los demás datos declarados (trf_fuel_receipts_touch, migración 0003): las cuentas del panel no lo cambian; los
-- administradores completos y la base misma, sí.
create function trf_private.fuel_receipt_keep_full_tank()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.trf_is_admin() then
    new.full_tank := old.full_tank;
  end if;
  return new;
end;
$$;
revoke all on function trf_private.fuel_receipt_keep_full_tank() from public, anon, authenticated;

create trigger trf_fuel_receipts_keep_full_tank
  before update on public.trf_driver_fuel_receipts
  for each row execute function trf_private.fuel_receipt_keep_full_tank();

-- El tanque de cada camión: capacidad, consumo y desde cuántos litros avisar. Se cambia sin volver a medir: los litros
-- que tenía en un momento siguen en trf_tank_references (la medición), y una carga con el tanque lleno los reemplaza
-- desde esa carga. El camión se identifica como en las cuentas de ruta: la matrícula, o el modelo si no la tiene.
create table public.trf_tank_settings (
  vehicle_key text primary key check (vehicle_key ~ '^(plate|model):.+$' and length(vehicle_key) <= 200),
  vehicle_name text not null check (length(trim(vehicle_name)) between 1 and 200),
  capacity_l numeric not null check (capacity_l > 0 and capacity_l <= 5000),
  -- Litros cada 100 km, como en trf_tank_references; el panel lo escribe y lo muestra en km por litro.
  consumption numeric not null check (consumption > 0 and consumption <= 200),
  warning_l numeric not null check (warning_l >= 0 and warning_l <= capacity_l),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

-- Cada guardado anota cuándo y quién, y deja fijos el camión y quién y cuándo lo creó.
create function trf_private.tank_settings_touch()
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
    new.vehicle_key := old.vehicle_key;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;
revoke all on function trf_private.tank_settings_touch() from public, anon, authenticated;

create trigger trf_tank_settings_touch before insert or update on public.trf_tank_settings
  for each row execute function trf_private.tank_settings_touch();
-- El mismo historial privado que los puntos y las mediciones del tanque (migración 0005).
create trigger road_tank_settings_audit after insert or update on public.trf_tank_settings
  for each row execute function trf_private.audit_road();

-- Las cuentas del panel leen, dan de alta y corrigen; nadie borra. Sin ingresar no se ve ni se escribe nada.
alter table public.trf_tank_settings enable row level security;
revoke all on table public.trf_tank_settings from public, anon, authenticated;
grant select, insert, update on table public.trf_tank_settings to authenticated;
create policy panel_read on public.trf_tank_settings for select to authenticated using ((select public.trf_is_panel_admin()));
create policy panel_insert on public.trf_tank_settings for insert to authenticated with check ((select public.trf_is_panel_admin()));
create policy panel_update on public.trf_tank_settings for update to authenticated using ((select public.trf_is_panel_admin())) with check ((select public.trf_is_panel_admin()));

notify pgrst, 'reload schema';
