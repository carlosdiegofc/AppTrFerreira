-- Estructura de la base «Ferreira Gestión» (Supabase, PostgreSQL 17) tal como estaba el 2026-10-18.
-- Leída de los catálogos de la base: tablas, funciones, restricciones, índices, seguridad por filas,
-- políticas (también las de las fotos en storage.objects), triggers, permisos y buckets. No tiene datos.
-- Incluye lo que instalaron web/sql/001_panel_web.sql, docs/sql/app_maintenance_documents.sql y
-- docs/sql/panel_admin_read_photos.sql.
-- Sirve para crear una base igual (entorno de pruebas o restauración) en un proyecto de Supabase vacío.
-- No se ejecuta en la base de producción: ahí todo esto ya existe.

set check_function_bodies = off;

-- Esquemas propios
create schema if not exists trf_private;

-- Extensiones instaladas en el proyecto (las trae Supabase; solo como referencia): pg_stat_statements 1.11, pgcrypto 1.3, plpgsql 1.0, supabase_vault 0.3.1, uuid-ossp 1.1

CREATE OR REPLACE FUNCTION public.trf_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select trf_private.is_admin(); $function$
;

CREATE OR REPLACE FUNCTION public.trf_is_panel_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.trf_panel_admins where user_id = auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION public.trf_stop_my_tracking()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
 update public.trf_driver_locations set is_tracking=false, updated_at=now() where driver_id=(select auth.uid());
 update public.trf_driver_tracking_sessions set active=false, ended_at=now() where driver_id=(select auth.uid()) and active=true;
end $function$
;

CREATE OR REPLACE FUNCTION trf_private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select auth.uid() is not null and exists(select 1 from auth.users u join trf_private.admin_emails a on a.email=lower(u.email) where u.id=auth.uid() and u.email_confirmed_at is not null);
$function$
;

CREATE OR REPLACE FUNCTION trf_private.is_fleet_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select auth.uid() is not null and (
    trf_private.is_admin()
    or exists (select 1 from public.trf_panel_admins p where p.user_id = auth.uid()));
$function$
;

CREATE OR REPLACE FUNCTION trf_private.is_fleet_member()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select auth.uid() is not null and (
    exists (select 1 from public.trf_driver_catalog_access a where a.driver_id = auth.uid())
    or exists (select 1 from public.trf_driver_tracking_sessions s where s.driver_id = auth.uid())
    or trf_private.is_fleet_manager());
$function$
;

CREATE OR REPLACE FUNCTION trf_private.prepare_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d jsonb=new.data;r public.trf_rates;km numeric;q numeric;unit numeric;vservice text;
begin
 if auth.uid() is null then raise exception 'Iniciá sesión';end if;
 new.user_id=auth.uid();new.created=now();new.status='Pendiente';new.amount=null;new.reply=null;new.estimate=null;
 -- Serialize each account's inserts to enforce a bounded submission rate.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if (select count(*) from public.trf_requests where user_id=auth.uid() and created>now()-interval '1 hour')>=20 then raise exception 'Alcanzaste el límite de solicitudes por hora. Intentá más tarde.';end if;
 vservice=d->>'service';
 if vservice is null or vservice not in ('consulta','granos','mercaderia') then raise exception 'Servicio inválido';end if;
 if length(coalesce(d->>'notes',''))>2000 then raise exception 'Mensaje demasiado largo';end if;
 if vservice='consulta' then
  if length(trim(coalesce(d->>'notes','')))=0 then raise exception 'Escribí tu consulta';end if;
  km=0;q=0;
 else
  if length(trim(coalesce(d->>'origin',''))) not between 1 and 150 or length(trim(coalesce(d->>'destination',''))) not between 1 and 150 then raise exception 'Completá el recorrido';end if;
  km=(d->>'km')::numeric;q=(d->>'quantity')::numeric;
  if km is null or q is null or km<=0 or km>2000 or q<=0 or q>100000 or km::text='NaN' or q::text='NaN' then raise exception 'Revisá kilómetros y cantidad';end if;
  select * into r from public.trf_rates where id='default';
  if vservice='granos' then
   select (b->>'price')::numeric into unit from jsonb_array_elements(r.bands) b where (b->>'max')::numeric>=km order by (b->>'max')::numeric limit 1;
   new.estimate=round(unit*q,2);
  else
   unit=case when d->>'mode'='pallet' then r.pallet else r.km end;
   if unit>0 then new.estimate=round(greatest(r.minimum,unit*case when d->>'mode'='pallet' then q else km end),2);end if;
  end if;
 end if;
 new.data=jsonb_build_object('service',vservice,'mode',case when d->>'mode'='pallet' then 'pallet' else 'viaje' end,'origin',left(trim(coalesce(d->>'origin','')),150),'destination',left(trim(coalesce(d->>'destination','')),150),'km',km,'quantity',q,'cargo',left(coalesce(d->>'cargo',''),100),'date',left(coalesce(d->>'date',''),20),'notes',trim(coalesce(d->>'notes','')));
 return new;
end;$function$
;

CREATE OR REPLACE FUNCTION trf_private.profile_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or new.id<>auth.uid() then raise exception 'Acceso no permitido'; end if;
 select email into new.email from auth.users where id=auth.uid();return new;
end;$function$
;

CREATE OR REPLACE FUNCTION trf_private.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION trf_private.validate_rates()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare b jsonb;seen numeric[]='{}';m numeric;p numeric;
begin
 if jsonb_typeof(new.bands)<>'array' or jsonb_array_length(new.bands)>100 then raise exception 'Revisá los tramos';end if;
 for b in select value from jsonb_array_elements(new.bands) loop
  if jsonb_typeof(b->'max') is distinct from 'number' or jsonb_typeof(b->'price') is distinct from 'number' then raise exception 'Revisá las tarifas';end if;
  m=(b->>'max')::numeric;p=(b->>'price')::numeric;
  if m<=0 or m>2000 or p<=0 or p>1000000000 or m=any(seen) then raise exception 'Revisá las tarifas y distancias';end if;seen=array_append(seen,m);
 end loop;return new;
end;$function$
;

create table public.trf_documents (
  id uuid default gen_random_uuid() not null,
  scope text not null,
  driver_id uuid default auth.uid(),
  driver_name text default ''::text not null,
  vehicle text default ''::text not null,
  kind text not null,
  expires_on date,
  notes text default ''::text not null,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.trf_driver_catalog_access (
  driver_id uuid not null
);

create table public.trf_driver_fuel_receipts (
  id uuid not null,
  trip_id uuid,
  driver_id uuid not null,
  driver_name text not null,
  vehicle text not null,
  recorded_at timestamp with time zone default now() not null,
  receipt_date date default CURRENT_DATE not null,
  distance_meters double precision default 0 not null,
  object_path text,
  archived boolean default false not null,
  station_id text default ''::text not null,
  station_name text default ''::text not null,
  liters numeric,
  total numeric,
  panel_data jsonb
);

create table public.trf_driver_location_history (
  id bigint generated by default as identity not null,
  driver_id uuid not null,
  vehicle text not null,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m double precision,
  speed_kmh double precision,
  heading double precision,
  recorded_at timestamp with time zone default now() not null,
  trip_id uuid,
  event_id uuid,
  segment integer default 0 not null
);

create table public.trf_driver_locations (
  driver_id uuid not null,
  driver_name text not null,
  vehicle text not null,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m double precision,
  speed_kmh double precision,
  heading double precision,
  recorded_at timestamp with time zone default now() not null,
  is_tracking boolean default true not null,
  updated_at timestamp with time zone default now() not null
);

create table public.trf_driver_tracking_sessions (
  id uuid default gen_random_uuid() not null,
  driver_id uuid not null,
  driver_name text not null,
  vehicle text not null,
  started_at timestamp with time zone default now() not null,
  ended_at timestamp with time zone,
  active boolean default true not null,
  paused boolean default false not null,
  load_type text default 'loaded'::text not null,
  distance_meters double precision default 0 not null,
  origin_lat double precision,
  origin_lng double precision,
  arrival_lat double precision,
  arrival_lng double precision
);

create table public.trf_mobile_catalog (
  id text not null,
  data jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now() not null
);

create table public.trf_panel_admins (
  user_id uuid not null,
  email text not null,
  created_at timestamp with time zone default now() not null
);

create table public.trf_panel_trips (
  id uuid default gen_random_uuid() not null,
  source text default 'manual'::text not null,
  app_trip_id text,
  departure_at timestamp with time zone,
  arrival_at timestamp with time zone,
  driver_id uuid,
  driver_name text,
  vehicle text,
  order_number text,
  product text,
  client text,
  origin_name text,
  origin_lat double precision,
  origin_lng double precision,
  destination_name text,
  destination_lat double precision,
  destination_lng double precision,
  billable_km numeric(10,1),
  kg numeric(12,1),
  amount numeric(14,2),
  currency text default 'UYU'::text not null,
  notes text,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  created_by uuid default auth.uid(),
  updated_at timestamp with time zone default now() not null,
  updated_by uuid default auth.uid()
);

create table public.trf_profiles (
  id uuid default auth.uid() not null,
  email text default ''::text not null,
  name text not null,
  phone text not null,
  company text default ''::text not null
);

create table public.trf_rates (
  id text not null,
  bands jsonb default '[]'::jsonb not null,
  pallet numeric default 0 not null,
  km numeric default 0 not null,
  minimum numeric default 0 not null,
  whatsapp text default ''::text not null
);

create table public.trf_requests (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  data jsonb not null,
  estimate numeric,
  amount numeric,
  status text default 'Pendiente'::text not null,
  reply text,
  created timestamp with time zone default now() not null
);

create table public.trf_trip_details (
  trip_id uuid not null,
  driver_id uuid not null,
  data jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now() not null
);

create table public.trf_trip_documents (
  id uuid not null,
  trip_id uuid not null,
  driver_id uuid not null,
  kind text not null,
  number text default ''::text not null,
  cargo_type text default ''::text not null,
  kg numeric,
  object_path text,
  created_at timestamp with time zone default now() not null
);

create table public.trf_vehicle_maintenance (
  id uuid default gen_random_uuid() not null,
  vehicle text not null,
  kind text not null,
  due_on date,
  done_on date,
  odometer_km integer,
  notes text default ''::text not null,
  created_by uuid default auth.uid(),
  created_by_name text default ''::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table trf_private.admin_emails (
  email text not null
);

alter table public.trf_documents add constraint trf_documents_kind_check CHECK ((length(TRIM(BOTH FROM kind)) > 0));

alter table public.trf_documents add constraint trf_documents_owner CHECK ((((scope = 'driver'::text) AND (driver_id IS NOT NULL)) OR ((scope = 'vehicle'::text) AND (length(TRIM(BOTH FROM vehicle)) > 0))));

alter table public.trf_documents add constraint trf_documents_pkey PRIMARY KEY (id);

alter table public.trf_documents add constraint trf_documents_scope_check CHECK ((scope = ANY (ARRAY['driver'::text, 'vehicle'::text])));

alter table public.trf_driver_catalog_access add constraint trf_driver_catalog_access_pkey PRIMARY KEY (driver_id);

alter table public.trf_driver_fuel_receipts add constraint trf_driver_fuel_receipts_distance_meters_check CHECK ((distance_meters >= (0)::double precision));

alter table public.trf_driver_fuel_receipts add constraint trf_driver_fuel_receipts_liters_check CHECK ((liters >= (0)::numeric));

alter table public.trf_driver_fuel_receipts add constraint trf_driver_fuel_receipts_object_path_key UNIQUE (object_path);

alter table public.trf_driver_fuel_receipts add constraint trf_driver_fuel_receipts_pkey PRIMARY KEY (id);

alter table public.trf_driver_fuel_receipts add constraint trf_driver_fuel_receipts_total_check CHECK ((total >= (0)::numeric));

alter table public.trf_driver_fuel_receipts add constraint trf_fuel_path CHECK (((object_path IS NULL) OR (object_path = ((((((driver_id)::text || '/'::text) || COALESCE((trip_id)::text, 'standalone'::text)) || '/'::text) || (id)::text) || '.jpg'::text))));

alter table public.trf_driver_location_history add constraint trf_driver_location_history_event_id_key UNIQUE (event_id);

alter table public.trf_driver_location_history add constraint trf_driver_location_history_latitude_check CHECK (((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision)));

alter table public.trf_driver_location_history add constraint trf_driver_location_history_longitude_check CHECK (((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision)));

alter table public.trf_driver_location_history add constraint trf_driver_location_history_pkey PRIMARY KEY (id);

alter table public.trf_driver_locations add constraint trf_driver_locations_driver_name_check CHECK (((length(TRIM(BOTH FROM driver_name)) >= 1) AND (length(TRIM(BOTH FROM driver_name)) <= 100)));

alter table public.trf_driver_locations add constraint trf_driver_locations_latitude_check CHECK (((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision)));

alter table public.trf_driver_locations add constraint trf_driver_locations_longitude_check CHECK (((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision)));

alter table public.trf_driver_locations add constraint trf_driver_locations_pkey PRIMARY KEY (driver_id);

alter table public.trf_driver_locations add constraint trf_driver_locations_vehicle_check CHECK (((length(TRIM(BOTH FROM vehicle)) >= 1) AND (length(TRIM(BOTH FROM vehicle)) <= 100)));

alter table public.trf_driver_tracking_sessions add constraint trf_driver_tracking_sessions_distance_meters_check CHECK ((distance_meters >= (0)::double precision));

alter table public.trf_driver_tracking_sessions add constraint trf_driver_tracking_sessions_driver_name_check CHECK (((length(TRIM(BOTH FROM driver_name)) >= 1) AND (length(TRIM(BOTH FROM driver_name)) <= 100)));

alter table public.trf_driver_tracking_sessions add constraint trf_driver_tracking_sessions_load_type_check CHECK ((load_type = ANY (ARRAY['loaded'::text, 'empty'::text])));

alter table public.trf_driver_tracking_sessions add constraint trf_driver_tracking_sessions_pkey PRIMARY KEY (id);

alter table public.trf_driver_tracking_sessions add constraint trf_driver_tracking_sessions_vehicle_check CHECK (((length(TRIM(BOTH FROM vehicle)) >= 1) AND (length(TRIM(BOTH FROM vehicle)) <= 100)));

alter table public.trf_driver_tracking_sessions add constraint trf_session_driver_unique UNIQUE (id, driver_id);

alter table public.trf_mobile_catalog add constraint trf_mobile_catalog_id_check CHECK ((id = 'fleet'::text));

alter table public.trf_mobile_catalog add constraint trf_mobile_catalog_pkey PRIMARY KEY (id);

alter table public.trf_panel_admins add constraint trf_panel_admins_pkey PRIMARY KEY (user_id);

alter table public.trf_panel_trips add constraint trf_panel_trips_app_trip_id_key UNIQUE (app_trip_id);

alter table public.trf_panel_trips add constraint trf_panel_trips_currency CHECK ((currency = ANY (ARRAY['UYU'::text, 'USD'::text])));

alter table public.trf_panel_trips add constraint trf_panel_trips_dates CHECK (((arrival_at IS NULL) OR (departure_at IS NULL) OR (arrival_at >= departure_at)));

alter table public.trf_panel_trips add constraint trf_panel_trips_destination CHECK ((((destination_lat IS NULL) = (destination_lng IS NULL)) AND (COALESCE(abs(destination_lat), (0)::double precision) <= (90)::double precision) AND (COALESCE(abs(destination_lng), (0)::double precision) <= (180)::double precision)));

alter table public.trf_panel_trips add constraint trf_panel_trips_lengths CHECK (((COALESCE(length(order_number), 0) <= 60) AND (COALESCE(length(product), 0) <= 120) AND (COALESCE(length(client), 0) <= 160) AND (COALESCE(length(origin_name), 0) <= 200) AND (COALESCE(length(destination_name), 0) <= 200) AND (COALESCE(length(driver_name), 0) <= 120) AND (COALESCE(length(vehicle), 0) <= 120) AND (COALESCE(length(notes), 0) <= 2000)));

alter table public.trf_panel_trips add constraint trf_panel_trips_manual_date CHECK (((source = 'app'::text) OR (departure_at IS NOT NULL)));

alter table public.trf_panel_trips add constraint trf_panel_trips_numbers CHECK (((COALESCE(billable_km, (0)::numeric) >= (0)::numeric) AND (COALESCE(kg, (0)::numeric) >= (0)::numeric) AND (COALESCE(amount, (0)::numeric) >= (0)::numeric)));

alter table public.trf_panel_trips add constraint trf_panel_trips_origin CHECK ((((origin_lat IS NULL) = (origin_lng IS NULL)) AND (COALESCE(abs(origin_lat), (0)::double precision) <= (90)::double precision) AND (COALESCE(abs(origin_lng), (0)::double precision) <= (180)::double precision)));

alter table public.trf_panel_trips add constraint trf_panel_trips_pkey PRIMARY KEY (id);

alter table public.trf_panel_trips add constraint trf_panel_trips_source CHECK ((source = ANY (ARRAY['app'::text, 'manual'::text])));

alter table public.trf_panel_trips add constraint trf_panel_trips_source_link CHECK (((source = 'app'::text) = (app_trip_id IS NOT NULL)));

alter table public.trf_profiles add constraint trf_profiles_company_check CHECK ((length(company) <= 150));

alter table public.trf_profiles add constraint trf_profiles_name_check CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 100)));

alter table public.trf_profiles add constraint trf_profiles_phone_check CHECK (((length(TRIM(BOTH FROM phone)) >= 1) AND (length(TRIM(BOTH FROM phone)) <= 40)));

alter table public.trf_profiles add constraint trf_profiles_pkey PRIMARY KEY (id);

alter table public.trf_rates add constraint trf_rates_id_check CHECK ((id = 'default'::text));

alter table public.trf_rates add constraint trf_rates_km_check CHECK (((km >= (0)::numeric) AND (km <= (1000000000)::numeric)));

alter table public.trf_rates add constraint trf_rates_minimum_check CHECK (((minimum >= (0)::numeric) AND (minimum <= (1000000000)::numeric)));

alter table public.trf_rates add constraint trf_rates_pallet_check CHECK (((pallet >= (0)::numeric) AND (pallet <= (1000000000)::numeric)));

alter table public.trf_rates add constraint trf_rates_pkey PRIMARY KEY (id);

alter table public.trf_rates add constraint trf_rates_whatsapp_check CHECK ((whatsapp ~ '^[0-9]{0,20}$'::text));

alter table public.trf_requests add constraint trf_requests_check CHECK (((status = 'Pendiente'::text) OR ((reply IS NOT NULL) AND (length(TRIM(BOTH FROM reply)) > 0))));

alter table public.trf_requests add constraint trf_requests_check1 CHECK ((((status = 'Aprobada'::text) AND (amount > (0)::numeric) AND (amount <= ('1000000000000000'::bigint)::numeric)) OR ((status <> 'Aprobada'::text) AND (amount IS NULL))));

alter table public.trf_requests add constraint trf_requests_pkey PRIMARY KEY (id);

alter table public.trf_requests add constraint trf_requests_reply_check CHECK (((reply IS NULL) OR (length(reply) <= 2000)));

alter table public.trf_requests add constraint trf_requests_status_check CHECK ((status = ANY (ARRAY['Pendiente'::text, 'Aprobada'::text, 'Respondida'::text, 'Rechazada'::text])));

alter table public.trf_trip_details add constraint trf_trip_details_pkey PRIMARY KEY (trip_id);

alter table public.trf_trip_documents add constraint trf_trip_documents_check CHECK (((object_path IS NULL) OR (object_path = ((((((driver_id)::text || '/'::text) || (trip_id)::text) || '/'::text) || (id)::text) || '.jpg'::text))));

alter table public.trf_trip_documents add constraint trf_trip_documents_kg_check CHECK ((kg >= (0)::numeric));

alter table public.trf_trip_documents add constraint trf_trip_documents_kind_check CHECK ((kind = ANY (ARRAY['departure'::text, 'arrival'::text])));

alter table public.trf_trip_documents add constraint trf_trip_documents_object_path_key UNIQUE (object_path);

alter table public.trf_trip_documents add constraint trf_trip_documents_pkey PRIMARY KEY (id);

alter table public.trf_vehicle_maintenance add constraint trf_vehicle_maintenance_kind_check CHECK ((length(TRIM(BOTH FROM kind)) > 0));

alter table public.trf_vehicle_maintenance add constraint trf_vehicle_maintenance_odometer_km_check CHECK (((odometer_km IS NULL) OR (odometer_km >= 0)));

alter table public.trf_vehicle_maintenance add constraint trf_vehicle_maintenance_pkey PRIMARY KEY (id);

alter table public.trf_vehicle_maintenance add constraint trf_vehicle_maintenance_vehicle_check CHECK ((length(TRIM(BOTH FROM vehicle)) > 0));

alter table trf_private.admin_emails add constraint admin_emails_pkey PRIMARY KEY (email);

alter table public.trf_driver_catalog_access add constraint trf_driver_catalog_access_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.trf_driver_fuel_receipts add constraint trf_driver_fuel_receipts_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES auth.users(id);

alter table public.trf_driver_fuel_receipts add constraint trf_driver_fuel_receipts_trip_id_driver_id_fkey FOREIGN KEY (trip_id, driver_id) REFERENCES trf_driver_tracking_sessions(id, driver_id);

alter table public.trf_driver_location_history add constraint trf_driver_location_history_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.trf_driver_location_history add constraint trf_driver_location_history_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES trf_driver_tracking_sessions(id);

alter table public.trf_driver_location_history add constraint trf_history_owned_trip FOREIGN KEY (trip_id, driver_id) REFERENCES trf_driver_tracking_sessions(id, driver_id);

alter table public.trf_driver_locations add constraint trf_driver_locations_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.trf_driver_tracking_sessions add constraint trf_driver_tracking_sessions_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.trf_profiles add constraint trf_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.trf_requests add constraint trf_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES trf_profiles(id);

alter table public.trf_trip_details add constraint trf_trip_details_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES auth.users(id);

alter table public.trf_trip_details add constraint trf_trip_details_trip_id_driver_id_fkey FOREIGN KEY (trip_id, driver_id) REFERENCES trf_driver_tracking_sessions(id, driver_id);

alter table public.trf_trip_documents add constraint trf_trip_documents_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES auth.users(id);

alter table public.trf_trip_documents add constraint trf_trip_documents_trip_id_driver_id_fkey FOREIGN KEY (trip_id, driver_id) REFERENCES trf_driver_tracking_sessions(id, driver_id);

CREATE INDEX trf_details_driver ON public.trf_trip_details USING btree (driver_id);

CREATE INDEX trf_docs_driver ON public.trf_trip_documents USING btree (driver_id);

CREATE INDEX trf_docs_trip ON public.trf_trip_documents USING btree (trip_id);

CREATE INDEX trf_documents_driver ON public.trf_documents USING btree (driver_id);

CREATE INDEX trf_driver_location_history_driver_time_idx ON public.trf_driver_location_history USING btree (driver_id, recorded_at DESC);

CREATE INDEX trf_driver_tracking_sessions_driver_started_idx ON public.trf_driver_tracking_sessions USING btree (driver_id, started_at DESC);

CREATE INDEX trf_history_trip_time ON public.trf_driver_location_history USING btree (trip_id, recorded_at);

CREATE INDEX trf_maintenance_vehicle ON public.trf_vehicle_maintenance USING btree (vehicle);

CREATE INDEX trf_panel_trips_departure_idx ON public.trf_panel_trips USING btree (departure_at DESC);

CREATE INDEX trf_receipts_driver ON public.trf_driver_fuel_receipts USING btree (driver_id);

CREATE INDEX trf_receipts_trip ON public.trf_driver_fuel_receipts USING btree (trip_id);

CREATE INDEX trf_requests_user_created ON public.trf_requests USING btree (user_id, created DESC);

alter table public.trf_documents enable row level security;

alter table public.trf_driver_catalog_access enable row level security;

alter table public.trf_driver_fuel_receipts enable row level security;

alter table public.trf_driver_location_history enable row level security;

alter table public.trf_driver_locations enable row level security;

alter table public.trf_driver_tracking_sessions enable row level security;

alter table public.trf_mobile_catalog enable row level security;

alter table public.trf_panel_admins enable row level security;

alter table public.trf_panel_trips enable row level security;

alter table public.trf_profiles enable row level security;

alter table public.trf_rates enable row level security;

alter table public.trf_requests enable row level security;

alter table public.trf_trip_details enable row level security;

alter table public.trf_trip_documents enable row level security;

alter table public.trf_vehicle_maintenance enable row level security;

alter table trf_private.admin_emails enable row level security;

create policy documents_delete on public.trf_documents as permissive for delete to authenticated using ((((scope = 'driver'::text) AND (driver_id = ( SELECT auth.uid() AS uid))) OR ( SELECT trf_private.is_fleet_manager() AS is_fleet_manager)));

create policy documents_insert on public.trf_documents as permissive for insert to authenticated with check ((((scope = 'driver'::text) AND (driver_id = ( SELECT auth.uid() AS uid)) AND ( SELECT trf_private.is_fleet_member() AS is_fleet_member)) OR ( SELECT trf_private.is_fleet_manager() AS is_fleet_manager)));

create policy documents_read on public.trf_documents as permissive for select to authenticated using ((((scope = 'driver'::text) AND (driver_id = ( SELECT auth.uid() AS uid))) OR ((scope = 'vehicle'::text) AND ( SELECT trf_private.is_fleet_member() AS is_fleet_member)) OR ( SELECT trf_private.is_fleet_manager() AS is_fleet_manager)));

create policy documents_update on public.trf_documents as permissive for update to authenticated using ((((scope = 'driver'::text) AND (driver_id = ( SELECT auth.uid() AS uid))) OR ( SELECT trf_private.is_fleet_manager() AS is_fleet_manager))) with check ((((scope = 'driver'::text) AND (driver_id = ( SELECT auth.uid() AS uid))) OR ( SELECT trf_private.is_fleet_manager() AS is_fleet_manager)));

create policy catalog_access_admin on public.trf_driver_catalog_access as permissive for all to authenticated using (( SELECT trf_private.is_admin() AS is_admin)) with check (( SELECT trf_private.is_admin() AS is_admin));

create policy catalog_access_read on public.trf_driver_catalog_access as permissive for select to authenticated using (((driver_id = ( SELECT auth.uid() AS uid)) OR ( SELECT trf_private.is_admin() AS is_admin)));

create policy receipts_admin_update on public.trf_driver_fuel_receipts as permissive for update to authenticated using (( SELECT trf_private.is_admin() AS is_admin)) with check (( SELECT trf_private.is_admin() AS is_admin));

create policy receipts_insert on public.trf_driver_fuel_receipts as permissive for insert to authenticated with check (((driver_id = ( SELECT auth.uid() AS uid)) AND ((trip_id IS NULL) OR (EXISTS ( SELECT 1
   FROM trf_driver_tracking_sessions s
  WHERE ((s.id = trf_driver_fuel_receipts.trip_id) AND (s.driver_id = ( SELECT auth.uid() AS uid))))))));

create policy receipts_read on public.trf_driver_fuel_receipts as permissive for select to authenticated using (((driver_id = ( SELECT auth.uid() AS uid)) OR ( SELECT trf_private.is_admin() AS is_admin)));

create policy trf_panel_admin_read on public.trf_driver_fuel_receipts as permissive for select to authenticated using (trf_is_panel_admin());

create policy drivers_insert_own_history on public.trf_driver_location_history as permissive for insert to authenticated with check ((driver_id = ( SELECT auth.uid() AS uid)));

create policy drivers_read_own_history on public.trf_driver_location_history as permissive for select to authenticated using ((driver_id = ( SELECT auth.uid() AS uid)));

create policy "gps admins can read location history" on public.trf_driver_location_history as permissive for select to authenticated using (( SELECT trf_private.is_admin() AS is_admin));

create policy trf_panel_admin_read on public.trf_driver_location_history as permissive for select to authenticated using (trf_is_panel_admin());

create policy drivers_insert_own_location on public.trf_driver_locations as permissive for insert to authenticated with check ((driver_id = ( SELECT auth.uid() AS uid)));

create policy drivers_read_own_location on public.trf_driver_locations as permissive for select to authenticated using ((driver_id = ( SELECT auth.uid() AS uid)));

create policy drivers_update_own_location on public.trf_driver_locations as permissive for update to authenticated using ((driver_id = ( SELECT auth.uid() AS uid))) with check ((driver_id = ( SELECT auth.uid() AS uid)));

create policy "gps admins can read driver locations" on public.trf_driver_locations as permissive for select to authenticated using (( SELECT trf_private.is_admin() AS is_admin));

create policy trf_panel_admin_read on public.trf_driver_locations as permissive for select to authenticated using (trf_is_panel_admin());

create policy drivers_manage_own_sessions on public.trf_driver_tracking_sessions as permissive for all to authenticated using ((driver_id = ( SELECT auth.uid() AS uid))) with check ((driver_id = ( SELECT auth.uid() AS uid)));

create policy "gps admins can read tracking sessions" on public.trf_driver_tracking_sessions as permissive for select to authenticated using (( SELECT trf_private.is_admin() AS is_admin));

create policy trf_panel_admin_read on public.trf_driver_tracking_sessions as permissive for select to authenticated using (trf_is_panel_admin());

create policy mobile_catalog_admin on public.trf_mobile_catalog as permissive for all to authenticated using (( SELECT trf_private.is_admin() AS is_admin)) with check (( SELECT trf_private.is_admin() AS is_admin));

create policy mobile_catalog_read on public.trf_mobile_catalog as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM trf_driver_tracking_sessions
  WHERE (trf_driver_tracking_sessions.driver_id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM trf_driver_catalog_access
  WHERE (trf_driver_catalog_access.driver_id = ( SELECT auth.uid() AS uid)))) OR ( SELECT trf_private.is_admin() AS is_admin)));

create policy trf_panel_admin_read on public.trf_mobile_catalog as permissive for select to authenticated using (trf_is_panel_admin());

create policy trf_panel_trips_admin_select on public.trf_panel_trips as permissive for select to authenticated using (trf_is_panel_admin());

create policy trf_profile_create on public.trf_profiles as permissive for insert to authenticated with check ((id = ( SELECT auth.uid() AS uid)));

create policy trf_profile_read on public.trf_profiles as permissive for select to authenticated using (((id = ( SELECT auth.uid() AS uid)) OR ( SELECT trf_private.is_admin() AS is_admin)));

create policy trf_profile_update on public.trf_profiles as permissive for update to authenticated using ((id = ( SELECT auth.uid() AS uid))) with check ((id = ( SELECT auth.uid() AS uid)));

create policy trf_rates_read on public.trf_rates as permissive for select to anon, authenticated using (true);

create policy trf_rates_update on public.trf_rates as permissive for update to authenticated using (( SELECT trf_private.is_admin() AS is_admin)) with check (( SELECT trf_private.is_admin() AS is_admin));

create policy trf_request_create on public.trf_requests as permissive for insert to authenticated with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy trf_request_read on public.trf_requests as permissive for select to authenticated using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT trf_private.is_admin() AS is_admin)));

create policy trf_request_reply on public.trf_requests as permissive for update to authenticated using (( SELECT trf_private.is_admin() AS is_admin)) with check (( SELECT trf_private.is_admin() AS is_admin));

create policy trf_panel_admin_read on public.trf_trip_details as permissive for select to authenticated using (trf_is_panel_admin());

create policy trip_details_admin_update on public.trf_trip_details as permissive for update to authenticated using (( SELECT trf_private.is_admin() AS is_admin)) with check (( SELECT trf_private.is_admin() AS is_admin));

create policy trip_details_insert on public.trf_trip_details as permissive for insert to authenticated with check (((driver_id = ( SELECT auth.uid() AS uid)) OR ( SELECT trf_private.is_admin() AS is_admin)));

create policy trip_details_read on public.trf_trip_details as permissive for select to authenticated using (((driver_id = ( SELECT auth.uid() AS uid)) OR ( SELECT trf_private.is_admin() AS is_admin)));

create policy trf_panel_admin_read on public.trf_trip_documents as permissive for select to authenticated using (trf_is_panel_admin());

create policy trip_docs_admin_update on public.trf_trip_documents as permissive for update to authenticated using (( SELECT trf_private.is_admin() AS is_admin)) with check (( SELECT trf_private.is_admin() AS is_admin));

create policy trip_docs_insert on public.trf_trip_documents as permissive for insert to authenticated with check ((driver_id = ( SELECT auth.uid() AS uid)));

create policy trip_docs_read on public.trf_trip_documents as permissive for select to authenticated using (((driver_id = ( SELECT auth.uid() AS uid)) OR ( SELECT trf_private.is_admin() AS is_admin)));

create policy maintenance_delete on public.trf_vehicle_maintenance as permissive for delete to authenticated using (((created_by = ( SELECT auth.uid() AS uid)) OR ( SELECT trf_private.is_fleet_manager() AS is_fleet_manager)));

create policy maintenance_insert on public.trf_vehicle_maintenance as permissive for insert to authenticated with check ((( SELECT trf_private.is_fleet_member() AS is_fleet_member) AND (created_by = ( SELECT auth.uid() AS uid))));

create policy maintenance_read on public.trf_vehicle_maintenance as permissive for select to authenticated using (( SELECT trf_private.is_fleet_member() AS is_fleet_member));

create policy maintenance_update on public.trf_vehicle_maintenance as permissive for update to authenticated using (((created_by = ( SELECT auth.uid() AS uid)) OR ( SELECT trf_private.is_fleet_manager() AS is_fleet_manager))) with check (( SELECT trf_private.is_fleet_member() AS is_fleet_member));

create policy fuel_photos_insert on storage.objects as permissive for insert to authenticated with check (((bucket_id = 'trf-fuel-receipts'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND (((storage.foldername(name))[2] = 'standalone'::text) OR (EXISTS ( SELECT 1
   FROM trf_driver_tracking_sessions s
  WHERE (((s.id)::text = (storage.foldername(objects.name))[2]) AND (s.driver_id = ( SELECT auth.uid() AS uid))))))));

create policy fuel_photos_read on storage.objects as permissive for select to authenticated using (((bucket_id = 'trf-fuel-receipts'::text) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR ( SELECT trf_private.is_admin() AS is_admin))));

create policy trf_panel_admin_read_photos on storage.objects as permissive for select to authenticated using (((bucket_id = ANY (ARRAY['trf-fuel-receipts'::text, 'trf-trip-documents'::text])) AND trf_is_panel_admin()));

create policy trip_document_photos_insert on storage.objects as permissive for insert to authenticated with check (((bucket_id = 'trf-trip-documents'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM trf_driver_tracking_sessions s
  WHERE (((s.id)::text = (storage.foldername(objects.name))[2]) AND (s.driver_id = ( SELECT auth.uid() AS uid)))))));

create policy trip_document_photos_read on storage.objects as permissive for select to authenticated using (((bucket_id = 'trf-trip-documents'::text) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR ( SELECT trf_private.is_admin() AS is_admin))));

CREATE TRIGGER trf_documents_touch BEFORE UPDATE ON public.trf_documents FOR EACH ROW EXECUTE FUNCTION trf_private.touch_updated_at();

CREATE TRIGGER trf_profile_email BEFORE INSERT OR UPDATE ON public.trf_profiles FOR EACH ROW EXECUTE FUNCTION trf_private.profile_email();

CREATE TRIGGER trf_rates_validation BEFORE INSERT OR UPDATE ON public.trf_rates FOR EACH ROW EXECUTE FUNCTION trf_private.validate_rates();

CREATE TRIGGER trf_request_validation BEFORE INSERT ON public.trf_requests FOR EACH ROW EXECUTE FUNCTION trf_private.prepare_request();

CREATE TRIGGER trf_maintenance_touch BEFORE UPDATE ON public.trf_vehicle_maintenance FOR EACH ROW EXECUTE FUNCTION trf_private.touch_updated_at();

revoke all on table public.trf_documents from public, anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_documents to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_documents to service_role;

revoke all on table public.trf_driver_catalog_access from public, anon, authenticated, service_role;
grant delete, insert, select, update on table public.trf_driver_catalog_access to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_driver_catalog_access to service_role;

revoke all on table public.trf_driver_fuel_receipts from public, anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_driver_fuel_receipts to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_driver_fuel_receipts to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_driver_fuel_receipts to service_role;

revoke all on table public.trf_driver_location_history from public, anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_driver_location_history to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_driver_location_history to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_driver_location_history to service_role;

revoke all on table public.trf_driver_locations from public, anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_driver_locations to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_driver_locations to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_driver_locations to service_role;

revoke all on table public.trf_driver_tracking_sessions from public, anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_driver_tracking_sessions to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_driver_tracking_sessions to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_driver_tracking_sessions to service_role;

revoke all on table public.trf_mobile_catalog from public, anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_mobile_catalog to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_mobile_catalog to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_mobile_catalog to service_role;

revoke all on table public.trf_panel_admins from public, anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_panel_admins to service_role;

revoke all on table public.trf_panel_trips from public, anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_panel_trips to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_panel_trips to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_panel_trips to service_role;

revoke all on table public.trf_profiles from public, anon, authenticated, service_role;
grant select on table public.trf_profiles to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_profiles to service_role;

revoke all on table public.trf_rates from public, anon, authenticated, service_role;
grant select on table public.trf_rates to anon;
grant select on table public.trf_rates to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_rates to service_role;

revoke all on table public.trf_requests from public, anon, authenticated, service_role;
grant select on table public.trf_requests to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_requests to service_role;

revoke all on table public.trf_trip_details from public, anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_trip_details to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_trip_details to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_trip_details to service_role;

revoke all on table public.trf_trip_documents from public, anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_trip_documents to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_trip_documents to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_trip_documents to service_role;

revoke all on table public.trf_vehicle_maintenance from public, anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_vehicle_maintenance to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.trf_vehicle_maintenance to service_role;

revoke all on function public.trf_is_admin() from public, anon, authenticated, service_role;
grant execute on function public.trf_is_admin() to authenticated;
grant execute on function public.trf_is_admin() to service_role;

revoke all on function public.trf_is_panel_admin() from public, anon, authenticated, service_role;
grant execute on function public.trf_is_panel_admin() to authenticated;
grant execute on function public.trf_is_panel_admin() to service_role;

revoke all on function public.trf_stop_my_tracking() from public, anon, authenticated, service_role;
grant execute on function public.trf_stop_my_tracking() to anon;
grant execute on function public.trf_stop_my_tracking() to authenticated;
grant execute on function public.trf_stop_my_tracking() to public;
grant execute on function public.trf_stop_my_tracking() to service_role;

revoke all on function trf_private.is_admin() from public, anon, authenticated, service_role;
grant execute on function trf_private.is_admin() to authenticated;

revoke all on function trf_private.is_fleet_manager() from public, anon, authenticated, service_role;
grant execute on function trf_private.is_fleet_manager() to authenticated;

revoke all on function trf_private.is_fleet_member() from public, anon, authenticated, service_role;
grant execute on function trf_private.is_fleet_member() to authenticated;

revoke all on function trf_private.prepare_request() from public, anon, authenticated, service_role;

revoke all on function trf_private.profile_email() from public, anon, authenticated, service_role;

revoke all on function trf_private.validate_rates() from public, anon, authenticated, service_role;

grant usage on schema trf_private to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('trf-fuel-receipts', 'trf-fuel-receipts', false, 10485760, '{image/jpeg}'::text[]) on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('trf-trip-documents', 'trf-trip-documents', false, 10485760, '{image/jpeg}'::text[]) on conflict (id) do nothing;
