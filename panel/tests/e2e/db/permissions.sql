-- Row security of the database structure (supabase/migrations), checked against the invented data of seed.sql.
-- Each block acts as one account the way PostgREST does: role authenticated and the JWT claims. TEST ONLY.
\set ON_ERROR_STOP on

-- A driver (Ana) sees her own trips and GPS readings, the papers and services of the fleet, and nothing of the office.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000011","role":"authenticated"}', true) is not null as chofer;
do $$
declare
  n int;
begin
  if (select count(*) from public.trf_driver_tracking_sessions) <> 2 then raise exception 'chofer: tendría que ver solo sus 2 viajes'; end if;
  -- Her 13 readings of the GPS and the 2 of the estimated road of a stretch without signal.
  if (select count(*) from public.trf_driver_location_history) <> 15 then raise exception 'chofer: tendría que ver solo sus 15 lecturas GPS'; end if;
  if (select count(*) from public.trf_driver_locations) <> 1 then raise exception 'chofer: tendría que ver solo su posición en vivo'; end if;
  if (select count(*) from public.trf_driver_presence) <> 1 then raise exception 'chofer: tendría que ver solo su propio «activo»'; end if;
  -- «Chofer activo»: the phone says it is open; the server notes when, whatever the phone's clock says.
  insert into public.trf_driver_presence (driver_id, driver_name, vehicle, app_version, seen_at, latitude, longitude, accuracy_m, located_at)
  values ('00000000-0000-4000-8000-000000000011', 'Ana Pereira', 'Volvo FH 460 · ABC1234', '0.17.0', now() - interval '1 year', -34.9, -56.2, 8, now())
  on conflict (driver_id) do update set app_version = excluded.app_version, seen_at = excluded.seen_at, latitude = excluded.latitude, longitude = excluded.longitude, accuracy_m = excluded.accuracy_m, located_at = excluded.located_at;
  if (select seen_at from public.trf_driver_presence where driver_id = '00000000-0000-4000-8000-000000000011') < now() - interval '1 minute' then raise exception 'chofer: la hora de «activo» la pone el servidor'; end if;
  begin
    insert into public.trf_driver_presence (driver_id, driver_name, app_version) values ('00000000-0000-4000-8000-000000000012', 'Bruno Díaz', '0.17.0');
    raise exception 'chofer: pudo marcar como activo a otro chofer';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.trf_panel_trips) <> 0 then raise exception 'chofer: no tendría que ver los datos del panel'; end if;
  if (select count(*) from public.trf_documents) <> 4 then raise exception 'chofer: tendría que ver sus papeles y los de los camiones'; end if;
  if (select count(*) from public.trf_vehicle_maintenance) <> 6 then raise exception 'chofer: tendría que ver los services'; end if;
  -- The files of the papers: hers and the trucks' (for a later app version), never another driver's. Uploading and
  -- deleting them is the office's.
  if (select count(*) from storage.objects where bucket_id = 'trf-documents') <> 2 then raise exception 'chofer: tendría que ver solo el archivo de su licencia y el del SOA'; end if;
  begin
    insert into storage.objects (bucket_id, name) values ('trf-documents', '50000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-0000000000aa.jpg');
    raise exception 'chofer: pudo subir el archivo de un documento';
  exception when insufficient_privilege then null;
  end;
  delete from storage.objects where bucket_id = 'trf-documents';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'chofer: no tendría que poder borrar archivos de documentos'; end if;
  begin
    update public.trf_documents set object_path = '50000000-0000-4000-8000-000000000004/60000000-0000-4000-8000-000000000004.jpg' where id = '50000000-0000-4000-8000-000000000001';
    raise exception 'chofer: pudo apuntar su documento al archivo de otro';
  exception when check_violation then null;
  end;
  if (select count(*) from public.trf_mobile_catalog) <> 1 then raise exception 'chofer: tendría que leer el catálogo'; end if;
  if public.trf_is_panel_admin() or public.trf_is_admin() then raise exception 'chofer: no es administrador'; end if;
  -- The app uploads GPS readings without id: the identity column numbers them.
  insert into public.trf_driver_location_history (driver_id, vehicle, latitude, longitude, recorded_at) values ('00000000-0000-4000-8000-000000000011', 'Volvo FH 460 · ABC1234', -34.9, -56.2, now());
  begin
    insert into public.trf_driver_tracking_sessions (driver_id, driver_name, vehicle) values ('00000000-0000-4000-8000-000000000012', 'Otro chofer', 'Scania R450 · DEF5678');
    raise exception 'chofer: pudo crear un viaje a nombre de otro';
  exception when insufficient_privilege then null;
  end;
  -- What the office completes for billing is not the driver's to write (the driver edits from the app).
  begin
    insert into public.trf_panel_trips (source, departure_at, vehicle) values ('manual', now(), 'Volvo FH 460 · ABC1234');
    raise exception 'chofer: pudo cargar un viaje en el panel';
  exception when insufficient_privilege then null;
  end;
  update public.trf_panel_trips set client = 'Otro cliente';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'chofer: no tendría que poder cambiar los datos del panel'; end if;
  -- Combustible: the driver sees and loads her own receipts; correcting them and the stations' accounts are the office's.
  if (select count(*) from public.trf_driver_fuel_receipts) <> 2 then raise exception 'chofer: tendría que ver solo sus 2 boletas'; end if;
  update public.trf_driver_fuel_receipts set panel_data = '{"monto": 1}', archived = true;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'chofer: no tendría que poder corregir boletas'; end if;
  if (select count(*) from public.trf_fuel_station_movements) <> 0 then raise exception 'chofer: no tendría que ver las cuentas de las estaciones'; end if;
  begin
    insert into public.trf_fuel_station_movements (station_key, station_name, kind, happened_on, amount, currency, method) values ('id:est-ruta5', 'Ancap Ruta 5 km 32', 'payment', current_date, 100, 'UYU', 'efectivo');
    raise exception 'chofer: pudo registrar un pago a una estación';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- The partner who only reads (like the owner who drives) sees the whole fleet.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true) is not null as lectura;
do $$
begin
  if not public.trf_is_panel_admin() then raise exception 'lectura: tendría que ser administrador del panel'; end if;
  if public.trf_is_admin() then raise exception 'lectura: no es administrador completo'; end if;
  if (select count(*) from public.trf_driver_tracking_sessions) <> 6 then raise exception 'lectura: tendría que ver los 6 viajes'; end if;
  if (select count(*) from public.trf_driver_location_history) <> 17 then raise exception 'lectura: tendría que ver las 17 lecturas GPS'; end if;
  if (select count(*) from public.trf_driver_locations) <> 4 then raise exception 'lectura: tendría que ver la posición en vivo de los 4 choferes'; end if;
  if (select count(*) from public.trf_driver_presence) <> 4 then raise exception 'lectura: tendría que ver quién tiene la app abierta'; end if;
  if (select count(*) from public.trf_panel_trips) <> 3 then raise exception 'lectura: tendría que ver los 3 viajes del panel'; end if;
  if (select count(*) from public.trf_trip_documents) <> 2 or (select count(*) from public.trf_driver_fuel_receipts) <> 6 then raise exception 'lectura: tendría que ver los remitos y el combustible'; end if;
  if (select count(*) from public.trf_fuel_station_movements) <> 3 then raise exception 'lectura: tendría que ver los pagos y saldos de las estaciones'; end if;
  if (select count(*) from public.trf_documents) <> 5 then raise exception 'lectura: tendría que ver todos los papeles'; end if;
  if (select count(*) from storage.objects where bucket_id = 'trf-documents') <> 3 then raise exception 'lectura: tendría que ver los archivos de todos los papeles'; end if;
end $$;

-- The panel accounts complete the trips of the app, type trips by hand and send them to the trash (decision of
-- 18/10/2026). The database notes who and when, keeps where each row came from, and never deletes.
do $$
declare
  me constant uuid := '00000000-0000-4000-8000-000000000002';
  trip constant text := '10000000-0000-4000-8000-00000000000d';
  r public.trf_panel_trips;
  before timestamptz;
  n int;
begin
  insert into public.trf_panel_trips (source, departure_at, vehicle, client, created_by, updated_by, created_at)
  values ('manual', now(), 'Volvo FH 460 · ABC1234', 'Cliente nuevo', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', now() - interval '1 year')
  returning * into r;
  if r.created_by is distinct from me or r.updated_by is distinct from me or r.created_at < now() - interval '1 day' then
    raise exception 'lectura: el viaje cargado a mano tendría que quedar a su nombre y con la fecha de hoy';
  end if;

  select updated_at into before from public.trf_panel_trips where app_trip_id = trip;
  update public.trf_panel_trips
  set client = 'Molino Nuevo', source = 'manual', app_trip_id = null, created_by = me, created_at = now() - interval '1 year'
  where app_trip_id = trip and updated_at = before
  returning * into r;
  if r.id is null or r.client <> 'Molino Nuevo' then raise exception 'lectura: tendría que poder completar un viaje de la app'; end if;
  if r.source <> 'app' or r.app_trip_id is distinct from trip or r.created_by is not null or r.created_at < now() - interval '1 day' then
    raise exception 'lectura: el viaje tendría que seguir siendo de la app, con su alta original';
  end if;
  if r.updated_at <= before or r.updated_by is distinct from me then raise exception 'lectura: la modificación tendría que quedar anotada'; end if;

  -- Someone saved in between: a save that still carries the old date changes nothing, so the panel can warn.
  update public.trf_panel_trips set client = 'Otro cliente' where app_trip_id = trip and updated_at = before;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'lectura: un guardado con la fecha vieja no tendría que pisar el cambio'; end if;

  -- The trash and back.
  update public.trf_panel_trips set deleted_at = now() where app_trip_id = trip;
  update public.trf_panel_trips set deleted_at = null where app_trip_id = trip returning * into r;
  if r.deleted_at is not null then raise exception 'lectura: tendría que poder restaurar un viaje de la papelera'; end if;

  -- Deleting is not possible: trips go to the trash.
  delete from public.trf_panel_trips;
  if (select count(*) from public.trf_panel_trips) <> 4 then raise exception 'lectura: no tendría que poder borrar viajes'; end if;
end $$;

-- Combustible (decision of 19/10/2026): the panel accounts load receipts in their own name and without a trip, correct
-- any receipt without touching what was declared, send it to the trash, and keep the stations' accounts. Nothing is
-- deleted.
do $$
declare
  me constant uuid := '00000000-0000-4000-8000-000000000002';
  bruno constant uuid := '40000000-0000-4000-8000-000000000003';
  r public.trf_driver_fuel_receipts;
  m public.trf_fuel_station_movements;
  before timestamptz;
  n int;
begin
  insert into public.trf_driver_fuel_receipts (id, driver_id, driver_name, vehicle, receipt_date, station_id, station_name, liters, total, object_path, panel_data)
  values ('40000000-0000-4000-8000-0000000000a1', me, 'Socio Lectura', '', current_date, '', 'Estación El Tala', null, 5000,
          '00000000-0000-4000-8000-000000000002/standalone/40000000-0000-4000-8000-0000000000a1.jpg', '{"moneda": "USD"}')
  returning * into r;
  if r.trip_id is not null or r.updated_at is not null then raise exception 'lectura: la boleta nueva tendría que quedar sin viaje y sin corrección'; end if;
  begin
    insert into public.trf_driver_fuel_receipts (id, driver_id, driver_name, vehicle, station_name, total)
    values ('40000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000011', 'Ana Pereira', '', 'Otra', 1);
    raise exception 'lectura: pudo cargar una boleta a nombre de un chofer';
  exception when insufficient_privilege then null;
  end;

  -- A correction goes in panel_data; what the driver declared stays, whatever the update says.
  update public.trf_driver_fuel_receipts
  set panel_data = '{"monto": 320, "litros": 255}', liters = 1, total = 1, station_name = 'Otra', driver_id = me, driver_name = 'Otro', object_path = null, receipt_date = '2000-01-01', updated_by = '00000000-0000-4000-8000-000000000001'
  where id = bruno and updated_at is null
  returning * into r;
  if r.id is null then raise exception 'lectura: tendría que poder corregir una boleta del chofer'; end if;
  if r.liters <> 250 or r.total <> 310 or r.station_name <> 'Petrobras Salto' or r.driver_id <> '00000000-0000-4000-8000-000000000012' or r.driver_name <> 'Bruno Díaz' or r.receipt_date <> (select receipt_date from public.trf_driver_fuel_receipts where id = bruno) then
    raise exception 'lectura: la corrección no tendría que tocar lo que declaró el chofer';
  end if;
  if r.panel_data->>'monto' <> '320' or r.updated_by is distinct from me or r.updated_at is null then raise exception 'lectura: la corrección tendría que quedar guardada y anotada'; end if;
  before := r.updated_at;
  -- Someone saved in between: a save that still carries the old date changes nothing.
  update public.trf_driver_fuel_receipts set panel_data = '{}' where id = bruno and updated_at is null;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'lectura: una corrección con la fecha vieja no tendría que pisar la otra'; end if;
  -- The trash and back.
  update public.trf_driver_fuel_receipts set archived = true where id = bruno and updated_at = before returning * into r;
  if not r.archived then raise exception 'lectura: tendría que poder mandar la boleta a la papelera'; end if;
  update public.trf_driver_fuel_receipts set archived = false where id = bruno returning * into r;
  if r.archived then raise exception 'lectura: tendría que poder restaurar la boleta'; end if;
  delete from public.trf_driver_fuel_receipts;
  if (select count(*) from public.trf_driver_fuel_receipts) <> 7 then raise exception 'lectura: no tendría que poder borrar boletas'; end if;

  -- Payments and opening balances: who and when are the database's; one opening per station and currency.
  insert into public.trf_fuel_station_movements (station_key, station_name, kind, happened_on, amount, currency, method, notes, created_by, created_at)
  values ('name:estacion el tala', 'Estación El Tala', 'payment', current_date, 6600, 'UYU', 'cheque', 'Cheque 123', '00000000-0000-4000-8000-000000000001', now() - interval '1 year')
  returning * into m;
  if m.created_by is distinct from me or m.updated_by is distinct from me or m.created_at < now() - interval '1 day' then raise exception 'lectura: el pago tendría que quedar a su nombre y con la fecha de hoy'; end if;
  update public.trf_fuel_station_movements set amount = 6500, kind = 'opening', created_by = null where id = m.id and updated_at = m.updated_at returning * into m;
  if m.amount <> 6500 or m.kind <> 'payment' or m.created_by is distinct from me then raise exception 'lectura: corregir un pago no tendría que cambiar su tipo ni quién lo cargó'; end if;
  update public.trf_fuel_station_movements set deleted_at = now() where id = m.id returning * into m;
  if m.deleted_at is null then raise exception 'lectura: tendría que poder anular un pago'; end if;
  begin
    insert into public.trf_fuel_station_movements (station_key, station_name, kind, happened_on, amount, currency) values ('id:est-ruta5', 'Ancap Ruta 5 km 32', 'opening', current_date, 1, 'UYU');
    raise exception 'lectura: pudo cargar un segundo saldo inicial en pesos para la misma estación';
  exception when unique_violation then null;
  end;
  -- In dollars, the same station can have its own.
  insert into public.trf_fuel_station_movements (station_key, station_name, kind, happened_on, amount, currency) values ('id:est-ruta5', 'Ancap Ruta 5 km 32', 'opening', current_date, -50, 'USD');
  begin
    insert into public.trf_fuel_station_movements (station_key, station_name, kind, happened_on, amount, currency, method) values ('id:est-ruta5', 'Ancap Ruta 5 km 32', 'payment', current_date, 0, 'UYU', 'efectivo');
    raise exception 'lectura: pudo registrar un pago de cero';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_fuel_station_movements (station_key, station_name, kind, happened_on, amount, currency) values ('id:est-ruta5', 'Ancap Ruta 5 km 32', 'payment', current_date, 10, 'UYU');
    raise exception 'lectura: pudo registrar un pago sin forma de pago';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_fuel_station_movements (station_key, station_name, kind, happened_on, amount, currency, method) values ('name:', 'Sin nombre', 'payment', current_date, 10, 'UYU', 'efectivo');
    raise exception 'lectura: pudo registrar un pago sin estación';
  exception when check_violation then null;
  end;
  begin
    delete from public.trf_fuel_station_movements;
    raise exception 'lectura: pudo borrar pagos';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Mantenimiento y Documentación (decision of 20/10/2026): the panel accounts load, change and delete the services and
-- papers of the whole fleet (for good, like the app) and upload and delete their files. The database notes who saved
-- each one last.
do $$
declare
  me constant uuid := '00000000-0000-4000-8000-000000000002';
  doc constant uuid := '50000000-0000-4000-8000-000000000009';
  file constant text := '50000000-0000-4000-8000-000000000009/60000000-0000-4000-8000-000000000009.pdf';
  s public.trf_vehicle_maintenance;
  d public.trf_documents;
  n int;
begin
  -- A service every 10.000 km, due at 422.000.
  insert into public.trf_vehicle_maintenance (vehicle, kind, due_km, interval_km, created_by_name)
  values ('Ford Cargo 1722 · JKL3456', 'Cambio de filtros', 422000, 10000, 'Socio Lectura')
  returning * into s;
  if s.created_by is distinct from me or s.updated_by is distinct from me then raise exception 'lectura: el service nuevo tendría que quedar a su nombre'; end if;
  begin
    insert into public.trf_vehicle_maintenance (vehicle, kind, interval_km) values ('Ford Cargo 1722 · JKL3456', 'Cambio de aceite', 0);
    raise exception 'lectura: pudo guardar un service cada 0 km';
  exception when check_violation then null;
  end;
  begin
    insert into public.trf_vehicle_maintenance (vehicle, kind, due_km) values ('Ford Cargo 1722 · JKL3456', 'Cambio de aceite', -1);
    raise exception 'lectura: pudo guardar un service a los -1 km';
  exception when check_violation then null;
  end;
  -- A service someone else loaded in the app: marking it done notes who; then it is deleted for good.
  update public.trf_vehicle_maintenance set done_on = current_date, odometer_km = 300000 where id = '70000000-0000-4000-8000-000000000002' returning * into s;
  if s.id is null or s.done_on is null or s.updated_by is distinct from me then raise exception 'lectura: tendría que poder marcar como hecho un service de otro, y quedar anotado'; end if;
  delete from public.trf_vehicle_maintenance where id = s.id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'lectura: tendría que poder borrar un service'; end if;

  -- A driver's paper with its PDF: the file first, then the paper that points to it.
  insert into storage.objects (bucket_id, name) values ('trf-documents', file);
  insert into public.trf_documents (id, scope, driver_id, driver_name, kind, expires_on, object_path)
  values (doc, 'driver', '00000000-0000-4000-8000-000000000012', 'Bruno Díaz', 'Licencia de conducir', current_date + 300, file)
  returning * into d;
  if d.created_by is distinct from me or d.updated_by is distinct from me then raise exception 'lectura: el documento nuevo tendría que quedar a su nombre'; end if;
  begin
    update public.trf_documents set object_path = '50000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000009.pdf' where id = doc;
    raise exception 'lectura: un documento pudo apuntar a la carpeta de otro';
  exception when check_violation then null;
  end;
  begin
    update public.trf_documents set object_path = '50000000-0000-4000-8000-000000000009/60000000-0000-4000-8000-000000000009.exe' where id = doc;
    raise exception 'lectura: un documento pudo llevar un archivo que no es foto ni PDF';
  exception when check_violation then null;
  end;
  -- Someone else's paper (Ana's, loaded in the app): changing it notes who.
  update public.trf_documents set expires_on = current_date + 20 where id = '50000000-0000-4000-8000-000000000001' returning * into d;
  if d.updated_by is distinct from me then raise exception 'lectura: tendría que poder cambiar un documento de un chofer, y quedar anotado'; end if;
  -- Deleting: the paper, then its file.
  delete from public.trf_documents where id = doc;
  delete from storage.objects where bucket_id = 'trf-documents' and name = file;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'lectura: tendría que poder borrar el archivo de un documento'; end if;
  if (select count(*) from public.trf_documents) <> 5 or (select count(*) from storage.objects where bucket_id = 'trf-documents') <> 3 then raise exception 'lectura: tendrían que quedar los documentos y archivos de antes'; end if;
  -- The other folders keep their rules: the photos of remitos and receipts are read, never deleted.
  if (select count(*) from storage.objects where bucket_id in ('trf-trip-documents', 'trf-fuel-receipts')) <> 3 then raise exception 'lectura: tendría que ver las fotos de remitos y boletas'; end if;
  delete from storage.objects where bucket_id in ('trf-trip-documents', 'trf-fuel-receipts');
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'lectura: no tendría que poder borrar fotos de remitos ni de boletas'; end if;
end $$;
rollback;

-- The owner is a full administrator.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true) is not null as dueno;
do $$
begin
  if not (public.trf_is_panel_admin() and public.trf_is_admin()) then raise exception 'dueño: tendría que ser administrador'; end if;
  if (select count(*) from public.trf_driver_tracking_sessions) <> 6 then raise exception 'dueño: tendría que ver los 6 viajes'; end if;
end $$;
rollback;

-- A full administrator outside the panel list reads the trips but not the panel rows (edits and the bin), so the panel
-- does not open for that account.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true) is not null as admin;
do $$
declare
  n int;
begin
  if public.trf_is_panel_admin() or not public.trf_is_admin() then raise exception 'admin: tendría que ser administrador completo fuera de la lista del panel'; end if;
  if (select count(*) from public.trf_driver_tracking_sessions) <> 6 then raise exception 'admin: tendría que ver los 6 viajes'; end if;
  if (select count(*) from public.trf_panel_trips) <> 0 then raise exception 'admin: no tendría que leer los datos del panel'; end if;
  if (select count(*) from public.trf_driver_presence) <> 4 then raise exception 'admin: tendría que ver quién tiene la app abierta'; end if;
  begin
    insert into public.trf_panel_trips (source, departure_at, vehicle) values ('manual', now(), 'Volvo FH 460 · ABC1234');
    raise exception 'admin: pudo cargar un viaje sin estar en la lista del panel';
  exception when insufficient_privilege then null;
  end;
  update public.trf_panel_trips set client = 'Otro cliente';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'admin: no tendría que cambiar los datos del panel'; end if;
  -- The full administrators keep the access they had to receipts (receipts_admin_update), declared columns included.
  update public.trf_driver_fuel_receipts set liters = 251 where id = '40000000-0000-4000-8000-000000000003';
  if (select liters from public.trf_driver_fuel_receipts where id = '40000000-0000-4000-8000-000000000003') <> 251 then raise exception 'admin: tendría que conservar su permiso sobre las boletas'; end if;
  if (select count(*) from public.trf_fuel_station_movements) <> 0 then raise exception 'admin: no tendría que ver las cuentas de las estaciones sin estar en la lista del panel'; end if;
  -- The papers and their files are the fleet's managers', the full administrators too (as with the papers, from before).
  if (select count(*) from public.trf_documents) <> 5 or (select count(*) from storage.objects where bucket_id = 'trf-documents') <> 3 then raise exception 'admin: tendría que ver los documentos y sus archivos'; end if;
  begin
    insert into public.trf_fuel_station_movements (station_key, station_name, kind, happened_on, amount, currency, method) values ('id:est-ruta5', 'Ancap Ruta 5 km 32', 'payment', current_date, 100, 'UYU', 'efectivo');
    raise exception 'admin: pudo registrar un pago sin estar en la lista del panel';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- Without signing in nothing of the fleet can be read.
begin;
set local role anon;
do $$
begin
  if (select count(*) from public.trf_driver_tracking_sessions) <> 0 then raise exception 'anónimo: no tendría que ver viajes'; end if;
  if (select count(*) from public.trf_driver_location_history) <> 0 or (select count(*) from public.trf_driver_locations) <> 0 then raise exception 'anónimo: no tendría que ver el GPS'; end if;
  begin
    perform 1 from public.trf_driver_presence;
    raise exception 'anónimo: pudo leer quién tiene la app abierta';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.trf_fuel_station_movements;
    raise exception 'anónimo: pudo leer las cuentas de las estaciones';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.trf_mobile_catalog) <> 0 then raise exception 'anónimo: no tendría que leer el catálogo'; end if;
  begin
    insert into public.trf_panel_trips (source, departure_at, vehicle) values ('manual', now(), 'Volvo FH 460 · ABC1234');
    raise exception 'anónimo: pudo cargar un viaje';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.trf_documents;
    raise exception 'anónimo: pudo leer los documentos';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from storage.objects) <> 0 then raise exception 'anónimo: no tendría que ver ningún archivo'; end if;
  begin
    insert into storage.objects (bucket_id, name) values ('trf-documents', '50000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-0000000000aa.jpg');
    raise exception 'anónimo: pudo subir un archivo';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

select 'permisos OK' as resultado;
