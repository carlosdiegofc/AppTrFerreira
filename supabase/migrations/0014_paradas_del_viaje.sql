-- Viajes con varias descargas (decisión del 29/10/2026): un viaje puede llevar carga para distintos clientes, y en cada
-- lugar el chofer marca que llegó y que terminó de descargar; la descarga también termina sola cuando el camión arranca.
-- Solo agrega: una tabla nueva con sus controles y sus permisos, y una columna opcional para atar un remito a su parada.
-- No cambia datos ni permisos existentes; un viaje sin paradas sigue siendo uno solo, y las versiones anteriores de la
-- app siguen igual.

create table public.trf_trip_stops (
  -- El teléfono le pone el id, así un envío repetido no la duplica.
  id uuid primary key,
  trip_id uuid not null,
  driver_id uuid not null default auth.uid(),
  -- El orden de las paradas en el viaje, desde 1.
  position integer not null,
  client text not null default '',
  place text not null default '',
  -- Cuándo y dónde llegó el camión (lo marca el chofer). Sin llegada, la parada todavía es una por hacer.
  arrived_at timestamptz,
  arrived_lat double precision,
  arrived_lng double precision,
  -- Cuándo terminó la descarga y cómo se dio por terminada: el chofer lo marcó o el camión arrancó.
  finished_at timestamptz,
  finished_by text,
  -- Los kilos que se descargaron ahí.
  kg numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trf_trip_stops_owned_trip foreign key (trip_id, driver_id) references public.trf_driver_tracking_sessions (id, driver_id),
  constraint trf_trip_stops_position check (position between 1 and 50),
  constraint trf_trip_stops_text check (length(client) <= 200 and length(place) <= 200),
  constraint trf_trip_stops_arrival check (
    (arrived_at is null and arrived_lat is null and arrived_lng is null)
    or (arrived_at is not null and (arrived_lat is null) = (arrived_lng is null)
        and (arrived_lat is null or (arrived_lat between -90 and 90 and arrived_lng between -180 and 180)))
  ),
  constraint trf_trip_stops_finish check (
    (finished_at is null and finished_by is null)
    or (finished_at is not null and arrived_at is not null and finished_at >= arrived_at and finished_by in ('chofer', 'movimiento'))
  ),
  constraint trf_trip_stops_kg check (kg is null or (kg >= 0 and kg < 1000000))
);

create index trf_trip_stops_trip on public.trf_trip_stops (trip_id, position);

-- Cada chofer ve y maneja las de sus viajes; las cuentas del panel y la administración las ven todas. Una parada ya
-- visitada no se borra (queda como la contó el teléfono); una que todavía no se visitó, sí.
alter table public.trf_trip_stops enable row level security;
create policy drivers_insert_own_stops on public.trf_trip_stops as permissive for insert to authenticated with check ((driver_id = (select auth.uid() as uid)));
create policy drivers_read_own_stops on public.trf_trip_stops as permissive for select to authenticated using ((driver_id = (select auth.uid() as uid)));
create policy drivers_update_own_stops on public.trf_trip_stops as permissive for update to authenticated using ((driver_id = (select auth.uid() as uid))) with check ((driver_id = (select auth.uid() as uid)));
create policy drivers_delete_pending_stops on public.trf_trip_stops as permissive for delete to authenticated using ((driver_id = (select auth.uid() as uid)) and arrived_at is null);
create policy panel_admins_read_stops on public.trf_trip_stops as permissive for select to authenticated using (trf_is_panel_admin());
create policy admins_read_stops on public.trf_trip_stops as permissive for select to authenticated using ((select trf_private.is_admin() as is_admin));

revoke all on table public.trf_trip_stops from public, anon, authenticated, service_role;
-- El envío del teléfono es «insertar o actualizar» (on_conflict=id), que toca todas las columnas. Un chofer no puede
-- pasar una parada a otro chofer (la política lo rechaza) ni a un viaje que no es suyo (la clave foránea lo rechaza).
grant select, insert, update, delete on table public.trf_trip_stops to authenticated;
grant all on table public.trf_trip_stops to service_role;

-- Un remito puede decir de qué parada es. Sin clave foránea a propósito: el remito y la parada se envían por separado,
-- en cualquier orden, y uno no tiene que esperar al otro. Los remitos de siempre quedan sin parada.
alter table public.trf_trip_documents add column stop_id uuid;
