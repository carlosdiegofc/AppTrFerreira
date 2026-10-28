-- Tramos sin señal (decisión del 28/10/2026): cuando el GPS de un viaje vuelve después de más de 90 segundos sin
-- lecturas y el camión apareció a más de 300 m, la app pide a Google el camino por ruta entre los dos puntos, cuenta
-- esos kilómetros en el viaje y los dibuja como estimados. Hasta 3 horas de corte; más largo, o un salto imposible,
-- queda sin rellenar y para revisar. Solo agrega: una columna nueva en las lecturas, una tabla nueva con sus controles
-- y sus permisos. No cambia datos ni permisos existentes; las versiones anteriores de la app siguen igual.

-- Las lecturas del camino estimado de un tramo sin señal. Las de siempre quedan en false. Sin precisión (accuracy_m
-- vacía), el observador de peajes y balanzas (0005) no las mira: un tramo estimado no genera pasos.
alter table public.trf_driver_location_history add column estimated boolean not null default false;

-- Cada tramo sin señal de un viaje, rellenado o no. El teléfono le pone el id, así un envío repetido no lo duplica.
create table public.trf_route_gaps (
  id uuid primary key,
  trip_id uuid not null,
  driver_id uuid not null default auth.uid(),
  vehicle text not null,
  segment integer not null default 0,
  -- La última lectura antes del corte y la primera después.
  from_at timestamptz not null,
  to_at timestamptz not null,
  from_lat double precision not null,
  from_lng double precision not null,
  to_lat double precision not null,
  to_lng double precision not null,
  -- En línea recta entre los dos puntos.
  straight_meters double precision not null,
  -- Lo que el viaje contó por el tramo: el camino por ruta, la recta más un 20 % si no se pudo pedir, o 0 sin rellenar.
  meters double precision not null,
  -- ruta: el camino de Google; recta: la línea recta corregida; sin_rellenar: más de 3 horas o un salto imposible.
  method text not null,
  created_at timestamptz not null default now(),
  constraint trf_route_gaps_owned_trip foreign key (trip_id, driver_id) references public.trf_driver_tracking_sessions (id, driver_id),
  constraint trf_route_gaps_method check (method in ('ruta', 'recta', 'sin_rellenar')),
  constraint trf_route_gaps_times check (to_at > from_at),
  constraint trf_route_gaps_places check (
    from_lat between -90 and 90 and to_lat between -90 and 90 and from_lng between -180 and 180 and to_lng between -180 and 180
  ),
  constraint trf_route_gaps_meters check (straight_meters >= 0 and meters >= 0 and meters < 2000000 and (method <> 'sin_rellenar' or meters = 0)),
  constraint trf_route_gaps_vehicle check (length(vehicle) <= 200)
);

create index trf_route_gaps_trip on public.trf_route_gaps (trip_id);

-- Cada chofer carga y ve los suyos; las cuentas del panel y la administración ven todos. Nadie los cambia ni los
-- borra: un tramo queda como lo contó el teléfono.
alter table public.trf_route_gaps enable row level security;
create policy drivers_insert_own_gaps on public.trf_route_gaps as permissive for insert to authenticated with check ((driver_id = (select auth.uid() as uid)));
create policy drivers_read_own_gaps on public.trf_route_gaps as permissive for select to authenticated using ((driver_id = (select auth.uid() as uid)));
create policy panel_admins_read_gaps on public.trf_route_gaps as permissive for select to authenticated using (trf_is_panel_admin());
create policy admins_read_gaps on public.trf_route_gaps as permissive for select to authenticated using ((select trf_private.is_admin() as is_admin));

revoke all on table public.trf_route_gaps from public, anon, authenticated, service_role;
grant select, insert on table public.trf_route_gaps to authenticated;
grant all on table public.trf_route_gaps to service_role;
