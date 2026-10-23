-- Invented example data for the end-to-end tests (TEST ONLY). Every time is relative to :'base', the instant the
-- browser clock is fixed at, so the tests give the same result at any hour. psql -v base='2026-10-15T15:00:00Z'
\set ON_ERROR_STOP on
create temporary table t0 as select :'base'::timestamptz as now, (:'base'::timestamptz at time zone 'America/Montevideo')::date as today;

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'dueno@ejemplo.uy', now(), '{"full_name":"Dueño de Prueba"}'),
  ('00000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'lectura@ejemplo.uy', now(), '{"full_name":"Socio Lectura"}'),
  ('00000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'admin@ejemplo.uy', now(), '{"full_name":"Administración"}'),
  ('00000000-0000-4000-8000-000000000011', 'authenticated', 'authenticated', 'chofer1@ejemplo.uy', now(), '{"full_name":"Ana Pereira"}'),
  ('00000000-0000-4000-8000-000000000012', 'authenticated', 'authenticated', 'chofer2@ejemplo.uy', now(), '{"full_name":"Bruno Díaz"}'),
  ('00000000-0000-4000-8000-000000000013', 'authenticated', 'authenticated', 'chofer3@ejemplo.uy', now(), '{"full_name":"Carla Méndez"}'),
  ('00000000-0000-4000-8000-000000000014', 'authenticated', 'authenticated', 'chofer4@ejemplo.uy', now(), '{"full_name":"Diego Silva"}');

-- The owner is a full administrator; the partner reads the fleet like the owner who drives. admin@ is a full
-- administrator outside the panel list: the panel does not open for it.
insert into trf_private.admin_emails (email) values ('dueno@ejemplo.uy'), ('admin@ejemplo.uy');
insert into public.trf_panel_admins (user_id, email) values
  ('00000000-0000-4000-8000-000000000001', 'dueno@ejemplo.uy'),
  ('00000000-0000-4000-8000-000000000002', 'lectura@ejemplo.uy');
insert into public.trf_driver_catalog_access (driver_id) values
  ('00000000-0000-4000-8000-000000000011'), ('00000000-0000-4000-8000-000000000012'),
  ('00000000-0000-4000-8000-000000000013'), ('00000000-0000-4000-8000-000000000014');

insert into public.trf_mobile_catalog (id, data) values ('fleet', '{
  "equipos": [
    {"id": "e1", "tipo": "Volvo FH 460", "matriculaCamion": "ABC1234"},
    {"id": "e2", "tipo": "Scania R450", "matriculaCamion": "DEF5678"},
    {"id": "e3", "tipo": "Mercedes Benz Actros", "matriculaCamion": "GHI9012"},
    {"id": "e4", "tipo": "Ford Cargo 1722", "matriculaCamion": "JKL3456"},
    {"id": "e5", "tipo": "Iveco Stralis", "matriculaCamion": "MNO7890"}
  ],
  "clientes": ["Cliente Uno"], "tiposCarga": ["Granos"], "clientesDetalle": [],
  "estaciones": [{"id": "est-ruta5", "nombre": "Ancap Ruta 5 km 32"}, {"id": "est-salto", "nombre": "Petrobras Salto"}, {"id": "est-young", "nombre": "Ducsa Young"}]
}');

-- Trips: on the road, stopped, without signal (older label without plate), finished today, deleted today, yesterday.
insert into public.trf_driver_tracking_sessions (id, driver_id, driver_name, vehicle, started_at, ended_at, active, paused, load_type, distance_meters, origin_lat, origin_lng, arrival_lat, arrival_lng)
select * from (values
  ('10000000-0000-4000-8000-00000000000a'::uuid, '00000000-0000-4000-8000-000000000011'::uuid, 'Ana Pereira', 'Volvo FH 460 · ABC1234', (select now from t0) - interval '2 hours', null::timestamptz, true, false, 'loaded', 152300.0, -34.86, -56.17, null::float8, null::float8),
  ('10000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000012', 'Bruno Díaz', 'Scania R450 · DEF5678', (select now from t0) - interval '1 hour', null, true, false, 'loaded', 40100.0, -34.75, -57.4, null, null),
  ('10000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-000000000013', 'Carla Méndez', 'Mercedes Benz Actros', (select now from t0) - interval '3 hours', null, true, false, 'empty', 210500.0, -33.25, -58.03, null, null),
  ('10000000-0000-4000-8000-00000000000d', '00000000-0000-4000-8000-000000000014', 'Diego Silva', 'Ford Cargo 1722 · JKL3456', (select now from t0) - interval '6 hours', (select now from t0) - interval '4 hours', false, false, 'loaded', 95000.0, -32.32, -58.08, -31.383, -57.967),
  ('10000000-0000-4000-8000-00000000000e', '00000000-0000-4000-8000-000000000014', 'Diego Silva', 'Ford Cargo 1722 · JKL3456', (select now from t0) - interval '3 hours 30 minutes', (select now from t0) - interval '3 hours', false, false, 'loaded', 1200.0, -31.383, -57.967, -31.39, -57.96),
  ('10000000-0000-4000-8000-00000000000f', '00000000-0000-4000-8000-000000000011', 'Ana Pereira', 'Iveco Stralis · MNO7890', (select now from t0) - interval '26 hours', (select now from t0) - interval '22 hours', false, false, 'empty', 132000.0, -34.88, -56.1, -34.909, -54.958)
) as v;

-- The trip of 3 hours 30 minutes ago was sent to the trash in the old panel: it must not count.
insert into public.trf_panel_trips (source, app_trip_id, departure_at, driver_id, driver_name, deleted_at)
values ('app', '10000000-0000-4000-8000-00000000000e', (select now from t0) - interval '3 hours 30 minutes', '00000000-0000-4000-8000-000000000014', 'Diego Silva', (select now from t0) - interval '1 hour');

-- GPS readings: twelve along Ruta 5 for the truck on the road, a minute apart, in three stretches: the trip was paused
-- after the sixth (new segment) and the signal was lost for five minutes after the ninth. One more reading of that trip
-- has no fix (0,0) and is not drawn. One reading each for the others; Bruno's comes from an older app version that
-- saved readings without trip, so it only counts inside the time window of his trip.
insert into public.trf_driver_location_history (driver_id, vehicle, latitude, longitude, speed_kmh, recorded_at, trip_id, segment)
select '00000000-0000-4000-8000-000000000011', 'Volvo FH 460 · ABC1234', -34.86 + i * 0.0445, -56.17 - i * 0.0285, case when i = 11 then 78 else 80 end,
       (select now from t0) - (12 - i) * interval '1 minute' - case when i < 9 then interval '5 minutes' else interval '0 minutes' end,
       '10000000-0000-4000-8000-00000000000a', case when i < 6 then 0 else 1 end
from generate_series(0, 11) as i;
insert into public.trf_driver_location_history (driver_id, vehicle, latitude, longitude, speed_kmh, recorded_at, trip_id, segment) values
  ('00000000-0000-4000-8000-000000000011', 'Volvo FH 460 · ABC1234', 0, 0, 80, (select now from t0) - interval '14 minutes 30 seconds', '10000000-0000-4000-8000-00000000000a', 0);
insert into public.trf_driver_location_history (driver_id, vehicle, latitude, longitude, speed_kmh, recorded_at, trip_id) values
  ('00000000-0000-4000-8000-000000000012', 'Scania R450 · DEF5678', -34.471, -57.844, 0, (select now from t0) - interval '3 minutes', null),
  ('00000000-0000-4000-8000-000000000013', 'Mercedes Benz Actros', -32.318, -58.081, 64, (select now from t0) - interval '40 minutes', '10000000-0000-4000-8000-00000000000c');

-- The latest position of each driver, as the phones update it with each reading: what the live maps read every few
-- seconds. Ana's is her last reading on Ruta 5, Bruno's and Carla's their only one, Diego's where his last trip ended.
insert into public.trf_driver_locations (driver_id, driver_name, vehicle, latitude, longitude, speed_kmh, recorded_at, is_tracking, updated_at) values
  ('00000000-0000-4000-8000-000000000011', 'Ana Pereira', 'Volvo FH 460 · ABC1234', -34.3705, -56.4835, 78, (select now from t0) - interval '1 minute', true, (select now from t0) - interval '1 minute'),
  ('00000000-0000-4000-8000-000000000012', 'Bruno Díaz', 'Scania R450 · DEF5678', -34.471, -57.844, 0, (select now from t0) - interval '3 minutes', true, (select now from t0) - interval '3 minutes'),
  ('00000000-0000-4000-8000-000000000013', 'Carla Méndez', 'Mercedes Benz Actros', -32.318, -58.081, 64, (select now from t0) - interval '40 minutes', true, (select now from t0) - interval '40 minutes'),
  ('00000000-0000-4000-8000-000000000014', 'Diego Silva', 'Ford Cargo 1722 · JKL3456', -31.39, -57.96, 0, (select now from t0) - interval '3 hours', false, (select now from t0) - interval '3 hours');

-- Who has the app open («chofer activo»): Ana and Bruno, on their trips; Diego, without a trip and with the app open
-- next to his truck in Salto; Carla opened it three hours ago. Ana and Diego have a newer version (invented, like
-- everything here) than Bruno and Carla. The server sets seen_at; here it is fixed to the base.
alter table public.trf_driver_presence disable trigger trf_driver_presence_touch;
insert into public.trf_driver_presence (driver_id, driver_name, vehicle, app_version, seen_at, latitude, longitude, accuracy_m, located_at) values
  ('00000000-0000-4000-8000-000000000011', 'Ana Pereira', 'Volvo FH 460 · ABC1234', '0.17.1', (select now from t0) - interval '1 minute', null, null, null, null),
  ('00000000-0000-4000-8000-000000000012', 'Bruno Díaz', 'Scania R450 · DEF5678', '0.17.0', (select now from t0) - interval '4 minutes', null, null, null, null),
  ('00000000-0000-4000-8000-000000000013', 'Carla Méndez', 'Mercedes Benz Actros', '0.17.0', (select now from t0) - interval '3 hours', null, null, null, null),
  ('00000000-0000-4000-8000-000000000014', 'Diego Silva', 'Ford Cargo 1722 · JKL3456', '0.17.1', (select now from t0) - interval '2 minutes', -31.385, -57.955, 12, (select now from t0) - interval '2 minutes');
alter table public.trf_driver_presence enable trigger trf_driver_presence_touch;

-- Papers: expired, about to expire, far away, without date. Ana's licence has its photo and the Mercedes' SOA its PDF,
-- uploaded in the panel; Bruno's health card, far off, has its photo too.
insert into public.trf_documents (id, scope, driver_id, driver_name, vehicle, kind, expires_on, notes, object_path) values
  ('50000000-0000-4000-8000-000000000001', 'driver', '00000000-0000-4000-8000-000000000011', 'Ana Pereira', '', 'Licencia de conducir', (select today from t0) + 10, 'Categoría E',
   '50000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001.jpg'),
  ('50000000-0000-4000-8000-000000000002', 'vehicle', null, '', 'Mercedes Benz Actros · GHI9012', 'SOA', (select today from t0) - 3, '',
   '50000000-0000-4000-8000-000000000002/60000000-0000-4000-8000-000000000002.pdf'),
  ('50000000-0000-4000-8000-000000000003', 'vehicle', null, '', 'Volvo FH 460 · ABC1234', 'Habilitación MTOP', (select today from t0) + 200, '', null),
  ('50000000-0000-4000-8000-000000000004', 'driver', '00000000-0000-4000-8000-000000000012', 'Bruno Díaz', '', 'Carné de salud', (select today from t0) + 400, '',
   '50000000-0000-4000-8000-000000000004/60000000-0000-4000-8000-000000000004.jpg'),
  ('50000000-0000-4000-8000-000000000005', 'vehicle', null, '', 'Scania R450 · DEF5678', 'Patente', null, '', null);
insert into storage.objects (bucket_id, name) values
  ('trf-documents', '50000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001.jpg'),
  ('trf-documents', '50000000-0000-4000-8000-000000000002/60000000-0000-4000-8000-000000000002.pdf'),
  ('trf-documents', '50000000-0000-4000-8000-000000000004/60000000-0000-4000-8000-000000000004.jpg');

-- Services: late, coming up, done. The Ford's oil every 10.000 km is due at 412.500: it has about 412.095 (412.000
-- declared 18 days ago, plus the 95 km of the trip that ended today; the trip deleted in the panel does not count). The
-- Scania has about 250.040 (250.000 a month ago, plus the trip on the road). The Volvo's filters have no kilometres to
-- compare with.
insert into public.trf_vehicle_maintenance (id, vehicle, kind, due_on, done_on, odometer_km, due_km, interval_km, notes, created_by_name) values
  ('70000000-0000-4000-8000-000000000001', 'Scania R450 · DEF5678', 'Cambio de aceite', (select today from t0) + 5, null, null, null, null, '', 'Dueño de Prueba'),
  ('70000000-0000-4000-8000-000000000002', 'Volvo FH 460 · ABC1234', 'Frenos', (select today from t0) - 2, null, null, null, null, '', 'Ana Pereira'),
  ('70000000-0000-4000-8000-000000000003', 'Ford Cargo 1722 · JKL3456', 'Cubiertas', (select today from t0) - 20, (select today from t0) - 18, 412000, null, null, 'Taller Salto', 'Diego Silva'),
  ('70000000-0000-4000-8000-000000000004', 'Ford Cargo 1722 · JKL3456', 'Cambio de aceite', null, null, null, 412500, 10000, '', 'Dueño de Prueba'),
  ('70000000-0000-4000-8000-000000000005', 'Scania R450 · DEF5678', 'Revisión general', null, (select today from t0) - 30, 250000, null, null, '', 'Bruno Díaz'),
  ('70000000-0000-4000-8000-000000000006', 'Volvo FH 460 · ABC1234', 'Cambio de filtros', null, null, null, 160000, null, '', 'Dueño de Prueba');

-- Viajes: the office completed the trip that ended today and typed one by hand three days ago, in dollars. The trip on
-- the road has what Ana typed on the phone, its two delivery notes (the departure one with photo) and a fuel receipt
-- the office corrected.
insert into public.trf_panel_trips (source, app_trip_id, departure_at, driver_id, driver_name, order_number, client, product, origin_name, destination_name, destination_lat, destination_lng, billable_km, kg, amount, currency)
values ('app', '10000000-0000-4000-8000-00000000000d', (select now from t0) - interval '6 hours', '00000000-0000-4000-8000-000000000014', 'Diego Silva', '24129', 'Molino San José', 'Trigo', 'Paysandú', 'Salto', -31.388, -57.96, 120, 28000, 38500, 'UYU');
insert into public.trf_panel_trips (id, source, departure_at, arrival_at, driver_name, vehicle, order_number, client, product, origin_name, destination_name, billable_km, kg, amount, currency, notes)
values ('20000000-0000-4000-8000-000000000001', 'manual', (select now from t0) - interval '3 days', (select now from t0) - interval '3 days' + interval '5 hours', 'Ana Pereira', 'Iveco Stralis · MNO7890', '24101', 'Cooperativa Agraria', 'Soja', 'Young', 'Nueva Palmira', 180, 30000, 1250.5, 'USD', 'Pagado por transferencia.');
insert into public.trf_trip_details (trip_id, driver_id, data) values
  ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000011', '{"destino": "Puerto de Montevideo", "cliente": "Navios", "tipoCarga": "Soja", "kg": "30.000"}');
insert into public.trf_trip_documents (id, trip_id, driver_id, kind, number, cargo_type, kg, object_path, created_at) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000011', 'departure', '0001-00012345', 'Soja', 30000,
   '00000000-0000-4000-8000-000000000011/10000000-0000-4000-8000-00000000000a/30000000-0000-4000-8000-000000000001.jpg', (select now from t0) - interval '110 minutes'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000011', 'arrival', '', '', null, null, (select now from t0) - interval '100 minutes');
insert into public.trf_driver_fuel_receipts (id, trip_id, driver_id, driver_name, vehicle, recorded_at, receipt_date, object_path, station_name, liters, total, panel_data, updated_at) values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000011', 'Ana Pereira', 'Volvo FH 460 · ABC1234', (select now from t0) - interval '90 minutes', (select today from t0),
   '00000000-0000-4000-8000-000000000011/10000000-0000-4000-8000-00000000000a/40000000-0000-4000-8000-000000000001.jpg', 'Ancap Ruta 5 km 32', 180, 9800, '{"litros": "182,5", "monto": "9.950"}', (select now from t0) - interval '60 minutes');

-- Combustible: receipts out of a trip too. Diego typed a catalog station in his own way (it counts for that station) and
-- sent the photo; Bruno's receipt on his trip is in dollars; Carla loaded at a station that is not in the list; Ana's
-- of twenty days ago is older than the opening balance of her station; Diego's of yesterday is in the trash.
insert into public.trf_driver_fuel_receipts (id, trip_id, driver_id, driver_name, vehicle, recorded_at, receipt_date, object_path, station_id, station_name, liters, total, panel_data, archived) values
  ('40000000-0000-4000-8000-000000000002', null, '00000000-0000-4000-8000-000000000014', 'Diego Silva', 'Ford Cargo 1722 · JKL3456', (select now from t0) - interval '2 days', (select today from t0) - 2,
   '00000000-0000-4000-8000-000000000014/standalone/40000000-0000-4000-8000-000000000002.jpg', '', 'ANCAP  ruta 5 KM 32', 300, 16500, null, false),
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000012', 'Bruno Díaz', 'Scania R450 · DEF5678', (select now from t0) - interval '30 minutes', (select today from t0),
   null, 'est-salto', 'Petrobras Salto', 250, 310, '{"moneda": "USD"}', false),
  ('40000000-0000-4000-8000-000000000004', null, '00000000-0000-4000-8000-000000000013', 'Carla Méndez', 'Mercedes Benz Actros', (select now from t0) - interval '5 days', (select today from t0) - 5,
   null, '', 'Estación El Tala', 120, 6600, null, false),
  ('40000000-0000-4000-8000-000000000005', null, '00000000-0000-4000-8000-000000000014', 'Diego Silva', 'Ford Cargo 1722 · JKL3456', (select now from t0) - interval '1 day', (select today from t0) - 1,
   null, 'est-salto', 'Petrobras Salto', 50, 2700, null, true),
  ('40000000-0000-4000-8000-000000000006', null, '00000000-0000-4000-8000-000000000011', 'Ana Pereira', 'Iveco Stralis · MNO7890', (select now from t0) - interval '20 days', (select today from t0) - 20,
   null, 'est-ruta5', 'Ancap Ruta 5 km 32', 200, 11000, null, false);
-- The photos those rows point to, in the storage (server.mjs hands out the pictures).
insert into storage.objects (bucket_id, name) values
  ('trf-trip-documents', '00000000-0000-4000-8000-000000000011/10000000-0000-4000-8000-00000000000a/30000000-0000-4000-8000-000000000001.jpg'),
  ('trf-fuel-receipts', '00000000-0000-4000-8000-000000000011/10000000-0000-4000-8000-00000000000a/40000000-0000-4000-8000-000000000001.jpg'),
  ('trf-fuel-receipts', '00000000-0000-4000-8000-000000000014/standalone/40000000-0000-4000-8000-000000000002.jpg');

-- The account of each station: Ancap Ruta 5 started with what was owed ten days ago and got a transfer three days ago;
-- Petrobras Salto got a cash payment in dollars yesterday.
insert into public.trf_fuel_station_movements (station_key, station_name, kind, happened_on, amount, currency, method, notes) values
  ('id:est-ruta5', 'Ancap Ruta 5 km 32', 'opening', (select today from t0) - 10, 25000, 'UYU', null, null),
  ('id:est-ruta5', 'Ancap Ruta 5 km 32', 'payment', (select today from t0) - 3, 20000, 'UYU', 'transferencia', 'Transferencia BROU'),
  ('id:est-salto', 'Petrobras Salto', 'payment', (select today from t0) - 1, 100, 'USD', 'efectivo', null);

-- Choferes (migration 0008). Ana has her card, a salary since last month and the payments of last month (up to date)
-- and of this one (an advance, and a viático apart); Bruno has a card without a salary and an advance in dollars; Eduardo
-- started this month without the app; Ramón no longer works. Carla and Diego use the app without a card.
insert into public.trf_drivers (id, user_id, name, phone, document_id, hired_on, license_category, pay_method, bank, bank_account, notes, active, left_on) values
  ('70000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', 'Ana Pereira', '099 111 222', '1.111.111-1', (select today from t0) - 600, 'E', 'transferencia', 'BROU', '001122334-00001', '', true, null),
  ('70000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000012', 'Bruno Díaz', '098 333 444', '2.222.222-2', (select today from t0) - 90, 'E', 'efectivo', '', '', '', true, null),
  ('70000000-0000-4000-8000-000000000003', null, 'Eduardo Núñez', '', '', (select today from t0) - 10, 'C', '', '', '', 'Entró este mes; todavía no usa la app.', true, null),
  -- He stopped working 45 days ago: his salary stops with that month.
  ('70000000-0000-4000-8000-000000000004', null, 'Ramón Sosa', '', '', null, '', '', '', '', '', false, (select today from t0) - 45);
insert into public.trf_driver_salaries (driver_id, starts_on, amount, currency) values
  ('70000000-0000-4000-8000-000000000001', (date_trunc('month', (select today from t0)) - interval '1 month')::date, 45000, 'UYU'),
  ('70000000-0000-4000-8000-000000000004', (date_trunc('month', (select today from t0)) - interval '3 months')::date, 30000, 'UYU');
insert into public.trf_driver_payments (driver_id, paid_on, period, amount, currency, concept, method, notes) values
  ('70000000-0000-4000-8000-000000000001', (date_trunc('month', (select today from t0)) - interval '1 month')::date + 9, (date_trunc('month', (select today from t0)) - interval '1 month')::date, 15000, 'UYU', 'adelanto', 'efectivo', ''),
  ('70000000-0000-4000-8000-000000000001', date_trunc('month', (select today from t0))::date, (date_trunc('month', (select today from t0)) - interval '1 month')::date, 30000, 'UYU', 'sueldo', 'transferencia', 'Transferencia BROU'),
  ('70000000-0000-4000-8000-000000000001', (select today from t0) - 5, date_trunc('month', (select today from t0))::date, 10000, 'UYU', 'adelanto', 'efectivo', ''),
  ('70000000-0000-4000-8000-000000000001', (select today from t0) - 3, date_trunc('month', (select today from t0))::date, 3500, 'UYU', 'viatico', 'efectivo', 'Viaje a Salto'),
  -- Ramón's settlement, for the month after he left.
  ('70000000-0000-4000-8000-000000000004', (select today from t0) - 30, (date_trunc('month', (select today from t0)) - interval '1 month')::date, 12000, 'UYU', 'sueldo', 'efectivo', 'Liquidación'),
  ('70000000-0000-4000-8000-000000000002', (select today from t0) - 2, date_trunc('month', (select today from t0))::date, 100, 'USD', 'adelanto', 'efectivo', '');
