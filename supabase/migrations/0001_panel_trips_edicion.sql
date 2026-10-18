-- La oficina puede guardar los datos de un viaje y mandarlo a la papelera (decisión del 18/10/2026: el viaje de un chofer
-- lo editan el dueño y la administración desde el panel; el chofer, desde la app).
-- Es lo que web/sql/001_panel_web.sql quería instalar y en producción no está: solo existe la política de lectura.
-- Solo agrega: una función, un disparador y dos políticas. No cambia datos ni quita permisos.
-- Quién escribe: las cuentas de la lista de administradores del panel (trf_panel_admins), las mismas que pueden leer
-- estos datos. Borrar no se puede: un viaje eliminado queda con deleted_at y se puede restaurar.

-- Cada guardado anota cuándo y quién, y deja fijos el origen del viaje y quién y cuándo lo creó. La fecha de
-- modificación es la que usan los paneles para avisar si otra persona cambió el viaje mientras alguien lo editaba.
-- Un respaldo se restaura con los disparadores apagados (session_replication_role = replica), así conserva sus fechas.
create or replace function public.trf_panel_trips_touch()
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
    new.source := old.source;
    new.app_trip_id := old.app_trip_id;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

create trigger trf_panel_trips_touch
  before insert or update on public.trf_panel_trips
  for each row execute function public.trf_panel_trips_touch();

create policy trf_panel_trips_admin_insert on public.trf_panel_trips
  as permissive for insert to authenticated
  with check ((select public.trf_is_panel_admin()));

create policy trf_panel_trips_admin_update on public.trf_panel_trips
  as permissive for update to authenticated
  using ((select public.trf_is_panel_admin()))
  with check ((select public.trf_is_panel_admin()));
