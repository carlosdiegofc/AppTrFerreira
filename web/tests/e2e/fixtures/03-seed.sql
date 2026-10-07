-- Example data for the end-to-end tests (TEST ONLY). Times are relative to now() so the tests do not age.
insert into public.trf_mobile_catalog (id, data) values ('fleet', '{
  "equipos": [{"tipo": "Ford Cargo 1722", "matriculaCamion": "ITP2187"},
              {"tipo": "Mercedes-Benz 1618", "matriculaCamion": "SAB1234"},
              {"tipo": "Leyland", "matriculaCamion": "ABC1234"}],
  "clientes": ["Navios", "COOPAR", "Molino Florida"],
  "tiposCarga": ["Soja", "Trigo", "Maíz", "Fertilizante"],
  "clientesDetalle": [{"nombre": "Navios", "cargas": ["Soja", "Maíz"]}]
}');

-- T1: finished trip Young → Nueva Palmira (like the load order screenshot), not completed in the panel yet.
insert into public.trf_driver_tracking_sessions values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Immer Sampayo',
   'Ford Cargo 1722 · ITP2187', date_trunc('minute', now()) - interval '26 hours',
   date_trunc('minute', now()) - interval '26 hours' + interval '160 minutes', false, false, 'loaded', 184200,
   -32.698, -57.627, -33.870, -58.411);
insert into public.trf_trip_details values ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
  '{"destino": "Navios (N. Palmira)", "destination_lat": -33.870, "destination_lng": -58.411,
    "cliente": "Navios", "tipoCarga": "Soja", "kg": 30000}');
insert into public.trf_trip_documents values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'departure', 'R-1001', 'Soja', 30000, '22222222-2222-2222-2222-222222222222/aaaaaaaa-0000-0000-0000-000000000001/d1.jpg', now() - interval '26 hours'),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'arrival', 'R-1002', null, null, null, now() - interval '24 hours');
with wp(n, lat, lng) as (values (0, -32.698, -57.627), (1, -33.000, -57.760), (2, -33.252, -58.030),
                                (3, -33.560, -58.200), (4, -33.870, -58.411)),
legs as (select a.n, a.lat la, a.lng ga, b.lat lb, b.lng gb from wp a join wp b on b.n = a.n + 1),
pts as (select l.n, s.i, la + (lb - la) * s.i / 80.0 as lat, ga + (gb - ga) * s.i / 80.0 as lng
        from legs l cross join generate_series(0, 79) s(i)),
numbered as (select row_number() over (order by n, i) as k, lat, lng from pts)
insert into public.trf_driver_location_history (event_id, trip_id, driver_id, vehicle, latitude, longitude, accuracy_m, speed_kmh, recorded_at, segment)
select gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Ford Cargo 1722 · ITP2187',
       lat, lng, 6, 62 + (k % 25), date_trunc('minute', now()) - interval '26 hours' + k * interval '30 seconds', 0
from numbered;

-- T2: trip in progress right now (Hugo leaving Montevideo to the north).
insert into public.trf_driver_tracking_sessions values
  ('aaaaaaaa-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'Hugo Silva',
   'Mercedes-Benz 1618 · SAB1234', now() - interval '70 minutes', null, true, false, 'loaded', 61500,
   -34.860, -56.170, null, null);
insert into public.trf_driver_location_history (event_id, trip_id, driver_id, vehicle, latitude, longitude, accuracy_m, speed_kmh, recorded_at, segment)
select gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'Mercedes-Benz 1618 · SAB1234',
       -34.860 + s.i * 0.004, -56.170 + s.i * 0.0015, 5, 70, now() - interval '70 minutes' + s.i * interval '30 seconds', 0
from generate_series(0, 139) s(i);
insert into public.trf_driver_locations values
  ('33333333-3333-3333-3333-333333333333', 'Hugo Silva', 'Mercedes-Benz 1618 · SAB1234', -34.304, -55.961, 5, 72, 0,
   now() - interval '20 seconds', true, now() - interval '20 seconds'),
  ('22222222-2222-2222-2222-222222222222', 'Immer Sampayo', 'Ford Cargo 1722 · ITP2187', -33.870, -58.411, 6, 0, 0,
   now() - interval '23 hours', false, now() - interval '23 hours');

-- T3: finished 10 days ago and already completed in the panel.
insert into public.trf_driver_tracking_sessions values
  ('aaaaaaaa-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'Hugo Silva',
   'Mercedes-Benz 1618 · SAB1234', now() - interval '10 days', now() - interval '10 days' + interval '3 hours', false, false, 'loaded', 201000,
   -34.380, -55.240, -32.370, -54.170);
insert into public.trf_panel_trips (source, app_trip_id, departure_at, order_number, product, client, origin_name, destination_name, billable_km, kg, amount, currency)
select 'app', 'aaaaaaaa-0000-0000-0000-000000000003', started_at, '24001', 'Fertilizante', 'Molino Florida', 'Florida', 'Melo', 205, 27000, 38000, 'UYU'
from public.trf_driver_tracking_sessions where id = 'aaaaaaaa-0000-0000-0000-000000000003';

-- T4: finished 5 days ago and sent to the bin from the panel.
insert into public.trf_driver_tracking_sessions values
  ('aaaaaaaa-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'Immer Sampayo',
   'Ford Cargo 1722 · ITP2187', now() - interval '5 days', now() - interval '5 days' + interval '1 hour', false, false, 'empty', 8400,
   -34.900, -56.160, -34.850, -56.100);
insert into public.trf_panel_trips (source, app_trip_id, departure_at, deleted_at)
select 'app', id::text, started_at, now() - interval '4 days' from public.trf_driver_tracking_sessions
where id = 'aaaaaaaa-0000-0000-0000-000000000004';

-- M1: trip typed by hand in the panel.
insert into public.trf_panel_trips (id, source, departure_at, arrival_at, driver_name, vehicle, order_number, product, client,
                                    origin_name, origin_lat, origin_lng, destination_name, destination_lat, destination_lng,
                                    billable_km, kg, amount, currency, notes)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'manual', now() - interval '3 days', now() - interval '3 days' + interval '5 hours',
        'Luis Ferreira', 'Leyland · ABC1234', '24130', 'Trigo', 'COOPAR', 'Paysandú', -32.317, -58.081, 'Montevideo', -34.901, -56.164,
        380, 28000, 45000, 'UYU', 'Carga con lona');

-- Fuel receipts: one on T1, one outside a trip, one archived (must not appear).
insert into public.trf_driver_fuel_receipts values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Immer Sampayo',
   'Ford Cargo 1722 · ITP2187', now() - interval '25 hours', to_char(now() - interval '25 hours', 'YYYY-MM-DD'), 90000, null, null,
   'Ancap Young', 180, 9500, '{"estacionNombre": "Ancap Young", "litros": 180, "monto": 9500, "moneda": "UYU"}', false),
  ('cccccccc-0000-0000-0000-000000000002', null, '33333333-3333-3333-3333-333333333333', 'Hugo Silva',
   'Mercedes-Benz 1618 · SAB1234', now() - interval '2 days', to_char(now() - interval '2 days', 'YYYY-MM-DD'), 0, null, null,
   'Petrobras Durazno', 98.5, 5120, null, false),
  ('cccccccc-0000-0000-0000-000000000003', null, '33333333-3333-3333-3333-333333333333', 'Hugo Silva',
   'Mercedes-Benz 1618 · SAB1234', now() - interval '2 days', to_char(now() - interval '2 days', 'YYYY-MM-DD'), 0, null, null,
   'Archivada', 10, 10, null, true);
insert into storage.objects (bucket_id, name, owner) values
  ('trf-trip-documents', '22222222-2222-2222-2222-222222222222/aaaaaaaa-0000-0000-0000-000000000001/d1.jpg', '22222222-2222-2222-2222-222222222222');
