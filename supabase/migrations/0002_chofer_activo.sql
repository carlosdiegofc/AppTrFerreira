-- «Chofer activo» (decisión del 18/10/2026): al ingresar y cada 5 minutos mientras la app está abierta, el teléfono avisa
-- que el chofer está activo, con la versión de la app y, si no está de viaje, dónde está. Con la app cerrada no se sigue
-- a nadie. Va aparte de trf_driver_locations, que es la posición del viaje en curso y la leen los dos paneles.
-- Solo agrega una tabla nueva con su función, su disparador y sus políticas. No cambia datos ni permisos existentes.

create table public.trf_driver_presence (
  driver_id uuid primary key references auth.users (id) on delete cascade,
  driver_name text not null,
  -- El camión que el teléfono tiene guardado para el chofer, si tiene.
  vehicle text,
  app_version text not null,
  -- La hora del servidor (la pone el disparador): el reloj del teléfono puede estar corrido.
  seen_at timestamptz not null default now(),
  -- Dónde estaba con la app abierta y sin viaje, y cuándo se tomó esa posición.
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  located_at timestamptz,
  constraint trf_driver_presence_texts check (length(trim(driver_name)) between 1 and 100 and length(trim(app_version)) between 1 and 40 and coalesce(length(vehicle), 0) <= 120),
  constraint trf_driver_presence_position check (
    (latitude is null) = (longitude is null) and (latitude is null) = (located_at is null)
    and coalesce(abs(latitude), 0) <= 90 and coalesce(abs(longitude), 0) <= 180 and coalesce(accuracy_m, 0) >= 0
  )
);

create or replace function public.trf_driver_presence_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.seen_at := now();
  return new;
end;
$$;

create trigger trf_driver_presence_touch
  before insert or update on public.trf_driver_presence
  for each row execute function public.trf_driver_presence_touch();

alter table public.trf_driver_presence enable row level security;

-- Cada chofer escribe y lee solo su fila.
create policy trf_driver_presence_own_select on public.trf_driver_presence
  as permissive for select to authenticated
  using (driver_id = (select auth.uid()));

create policy trf_driver_presence_own_insert on public.trf_driver_presence
  as permissive for insert to authenticated
  with check (driver_id = (select auth.uid()));

create policy trf_driver_presence_own_update on public.trf_driver_presence
  as permissive for update to authenticated
  using (driver_id = (select auth.uid()))
  with check (driver_id = (select auth.uid()));

-- Las cuentas que ven la flota (las del panel y la administración completa) ven quién tiene la app abierta.
create policy trf_driver_presence_fleet_select on public.trf_driver_presence
  as permissive for select to authenticated
  using ((select public.trf_is_panel_admin()) or (select public.trf_is_admin()));

-- Una tabla nueva no lleva los permisos amplios que Supabase da por defecto: sin ingresar no se ve ni se escribe nada,
-- y con sesión solo leer, dar de alta y modificar (nunca borrar).
revoke all on table public.trf_driver_presence from anon, authenticated;
grant select, insert, update on table public.trf_driver_presence to authenticated;
