-- App tables as the Android app writes them (columns taken from SyncWorker/TripStore/GpsService),
-- with the usual "each driver sees only their own rows" policies. TEST ONLY.
create table public.trf_driver_tracking_sessions (
  id uuid primary key,
  driver_id uuid not null,
  driver_name text,
  vehicle text,
  started_at timestamptz,
  ended_at timestamptz,
  active boolean default false,
  paused boolean default false,
  load_type text,
  distance_meters double precision default 0,
  origin_lat double precision,
  origin_lng double precision,
  arrival_lat double precision,
  arrival_lng double precision
);
create table public.trf_trip_details (
  trip_id uuid primary key,
  driver_id uuid not null,
  data jsonb not null default '{}'
);
create table public.trf_trip_documents (
  id uuid primary key,
  trip_id uuid,
  driver_id uuid not null,
  kind text,
  number text,
  cargo_type text,
  kg numeric,
  object_path text,
  created_at timestamptz default now()
);
create table public.trf_driver_location_history (
  id bigserial primary key,
  event_id uuid unique,
  trip_id uuid,
  driver_id uuid not null,
  vehicle text,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  speed_kmh double precision,
  heading double precision,
  recorded_at timestamptz,
  segment int default 0
);
create table public.trf_driver_locations (
  driver_id uuid primary key,
  driver_name text,
  vehicle text,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  speed_kmh double precision,
  heading double precision,
  recorded_at timestamptz,
  is_tracking boolean,
  updated_at timestamptz
);
create table public.trf_driver_fuel_receipts (
  id uuid primary key,
  trip_id uuid,
  driver_id uuid not null,
  driver_name text,
  vehicle text,
  recorded_at timestamptz,
  receipt_date text,
  distance_meters double precision,
  object_path text,
  station_id text,
  station_name text,
  liters numeric,
  total numeric,
  panel_data jsonb,
  archived boolean default false
);
create table public.trf_mobile_catalog (id text primary key, data jsonb not null default '{}');

do $$
declare t text;
begin
  foreach t in array array['trf_driver_tracking_sessions','trf_trip_details','trf_trip_documents',
                           'trf_driver_location_history','trf_driver_locations','trf_driver_fuel_receipts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy driver_own on public.%I for all to authenticated using (driver_id = auth.uid()) with check (driver_id = auth.uid())', t);
  end loop;
end $$;
alter table public.trf_mobile_catalog enable row level security;
create policy drivers_read_catalog on public.trf_mobile_catalog for select to authenticated using (true);

create policy driver_own_photos on storage.objects for select to authenticated
  using (split_part(name, '/', 1) = auth.uid()::text);

-- Accounts (must exist before the panel install script runs, which looks admins up by e-mail).
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'luis@trferreira.com'),
  ('22222222-2222-2222-2222-222222222222', 'immer@trferreira.com'),
  ('33333333-3333-3333-3333-333333333333', 'hugo@trferreira.com');
