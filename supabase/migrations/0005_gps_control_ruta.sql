-- GPS control de ruta, aprobado el 21/10/2026. Solo agrega tablas y un observador del historial GPS.
-- No cambia viajes, posiciones ni boletas; no recalcula peajes anteriores al alta de los puntos.
create table public.trf_road_points (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  kind text not null check (kind in ('toll','scale','radar','place')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_m integer not null default 50 check (radius_m between 15 and 150),
  warning_m integer not null default 500 check (warning_m between radius_m * 2 and 5000),
  speed_limit numeric check (speed_limit > 0 and speed_limit <= 130),
  notes text not null default '' check (length(notes) <= 500),
  archived boolean not null default false,
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(), updated_by uuid default auth.uid(),
  check (latitude <> 0 or longitude <> 0)
);
create table public.trf_toll_rates (
  id uuid primary key default gen_random_uuid(),
  point_id uuid not null references public.trf_road_points(id),
  vehicle_key text not null check (vehicle_key ~ '^(plate|model):.+$' and length(vehicle_key) <= 200),
  amount numeric(14,2) not null check (amount >= 0 and amount < 10000000),
  valid_from timestamptz not null,
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  unique (point_id, vehicle_key, valid_from)
);
create table public.trf_road_events (
  id uuid primary key default gen_random_uuid(),
  point_id uuid not null references public.trf_road_points(id), point_name text not null,
  kind text not null, vehicle_key text not null, vehicle_name text not null,
  trip_id uuid not null references public.trf_driver_tracking_sessions(id),
  entered_at timestamptz not null, happened_at timestamptz not null,
  speed_kmh double precision, speed_limit numeric, accuracy_m double precision,
  amount numeric(14,2),
  unique (point_id, trip_id, entered_at)
);
create table public.trf_toll_movements (
  id uuid primary key default gen_random_uuid(),
  vehicle_key text not null check (vehicle_key ~ '^(plate|model):.+$' and length(vehicle_key) <= 200),
  vehicle_name text not null check (length(trim(vehicle_name)) between 1 and 200),
  kind text not null check (kind in ('credit','adjustment','passage')),
  amount numeric(14,2) not null check (amount <> 0 and abs(amount) < 10000000),
  happened_at timestamptz not null default now(),
  notes text not null check (length(trim(notes)) between 1 and 500),
  event_id uuid unique references public.trf_road_events(id),
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  check ((kind = 'credit' and amount > 0 and event_id is null) or (kind = 'adjustment' and event_id is null) or (kind = 'passage' and amount < 0 and event_id is not null))
);
create table public.trf_tank_references (
  vehicle_key text primary key check (vehicle_key ~ '^(plate|model):.+$' and length(vehicle_key) <= 200),
  vehicle_name text not null check (length(trim(vehicle_name)) between 1 and 200),
  capacity_l numeric not null check (capacity_l > 0 and capacity_l <= 5000),
  liters numeric not null check (liters >= 0 and liters <= capacity_l),
  consumption numeric not null check (consumption > 0 and consumption <= 200),
  warning_l numeric not null check (warning_l >= 0 and warning_l <= capacity_l),
  trip_meters jsonb not null check (jsonb_typeof(trip_meters) = 'object'),
  receipt_liters jsonb not null check (jsonb_typeof(receipt_liters) = 'object'),
  measured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), updated_by uuid default auth.uid()
);
create index trf_road_events_vehicle_time on public.trf_road_events(vehicle_key, happened_at desc);
create index trf_toll_movements_vehicle_time on public.trf_toll_movements(vehicle_key, happened_at desc);
create index trf_road_points_active on public.trf_road_points(latitude, longitude) where not archived;

create function trf_private.road_touch() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp(); new.updated_by := auth.uid();
  if tg_table_name = 'trf_tank_references' then
    new.measured_at := new.updated_at;
    if tg_op = 'UPDATE' then new.vehicle_key := old.vehicle_key; end if;
  elsif tg_op = 'INSERT' then new.created_at := new.updated_at; new.created_by := auth.uid();
  else new.id := old.id; new.created_at := old.created_at; new.created_by := old.created_by;
  end if;
  return new;
end; $$;
create trigger trf_road_points_touch before insert or update on public.trf_road_points for each row execute function trf_private.road_touch();
create trigger trf_tank_references_touch before insert or update on public.trf_tank_references for each row execute function trf_private.road_touch();

create function trf_private.road_append_stamp() returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_at := clock_timestamp(); new.created_by := auth.uid();
  if tg_table_name = 'trf_toll_rates' then
    if not exists(select 1 from public.trf_road_points where id=new.point_id and kind='toll' and not archived) then
      raise exception 'La tarifa necesita un peaje activo' using errcode='23514';
    end if;
  end if;
  return new;
end; $$;
create trigger road_rate_stamp before insert on public.trf_toll_rates for each row execute function trf_private.road_append_stamp();
create trigger road_movement_stamp before insert on public.trf_toll_movements for each row execute function trf_private.road_append_stamp();

-- Panel access follows the existing administrator list. Rates and movements are append-only; corrections are new rows.
do $$ declare t text; begin
  foreach t in array array['trf_road_points','trf_toll_rates','trf_road_events','trf_toll_movements','trf_tank_references'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy panel_read on public.%I for select to authenticated using ((select public.trf_is_panel_admin()))', t);
    if t <> 'trf_road_events' then
      execute format('grant insert on public.%I to authenticated', t);
      execute format('create policy panel_insert on public.%I for insert to authenticated with check ((select public.trf_is_panel_admin()))', t);
    end if;
    if t in ('trf_road_points','trf_tank_references') then
      execute format('grant update on public.%I to authenticated', t);
      execute format('create policy panel_update on public.%I for update to authenticated using ((select public.trf_is_panel_admin())) with check ((select public.trf_is_panel_admin()))', t);
    end if;
  end loop;
end $$;
-- No client can fabricate an automatic passage debit, even if it is a panel administrator.
drop policy panel_insert on public.trf_toll_movements;
create policy panel_insert on public.trf_toll_movements for insert to authenticated
  with check ((select public.trf_is_panel_admin()) and kind in ('credit','adjustment') and event_id is null and created_by = (select auth.uid()));

create function trf_private.road_distance(a double precision,b double precision,c double precision,d double precision)
returns double precision language sql immutable strict set search_path = '' as $$
  select 12742000 * asin(sqrt(least(1.0, power(sin(radians(c-a)/2),2) + cos(radians(a))*cos(radians(c))*power(sin(radians(d-b)/2),2))));
$$;
create function trf_private.road_vehicle_key(label text) returns text language sql immutable strict set search_path = '' as $$
  select case when strpos(label,' · ') > 0 then 'plate:' || lower(trim(regexp_replace(label,'^.* · ',''))) else 'model:' || lower(trim(label)) end;
$$;
-- Private per-trip state, never exposed through the API. No browser needs to remain open for a passage to be recorded.
create table trf_private.road_visits (
  trip_id uuid not null, point_id uuid not null, last_at timestamptz not null,
  lat double precision not null, lng double precision not null, segment integer not null,
  point_version timestamptz not null, entered_at timestamptz,
  approach_lat double precision, approach_lng double precision,
  samples integer not null default 0, peak_speed double precision, accuracy double precision,
  primary key(trip_id,point_id)
);
revoke all on trf_private.road_visits from public, anon, authenticated;

-- A qualified passage requires an approach, >=2 precise fixes inside the zone, then an exit on the opposite side.
-- Gaps >90s, segment changes, stale/out-of-order samples and inaccurate fixes do not create financial records.
-- This estimates passage, not an operator charge. Missed fixes/parallel roads still require reconciliation.
create function trf_private.observe_road_passage() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p public.trf_road_points; v trf_private.road_visits; dist double precision; k text;
  price numeric; event uuid; opposite boolean;
begin
  if new.trip_id is null or new.recorded_at > now() + interval '5 minutes' then return new; end if;
  -- Invoked only by the history trigger; authenticated uploads must own the trip (or be panel admins).
  if auth.uid() is not null and auth.uid() <> new.driver_id and not public.trf_is_panel_admin() then return new; end if;
  if not exists(select 1 from public.trf_driver_tracking_sessions s where s.id=new.trip_id and s.driver_id=new.driver_id and s.vehicle=new.vehicle
    and new.recorded_at >= s.started_at and (s.ended_at is null or new.recorded_at <= s.ended_at)) then return new; end if;
  k := trf_private.road_vehicle_key(new.vehicle);
  -- Serialize samples of this trip, including concurrent upload batches.
  perform pg_advisory_xact_lock(hashtextextended(new.trip_id::text, 0));
  if new.accuracy_m is null or new.accuracy_m < 0 or new.accuracy_m > 30
     or new.latitude not between -90 and 90 or new.longitude not between -180 and 180
     or (new.latitude = 0 and new.longitude = 0) then
    update trf_private.road_visits set entered_at=null,samples=0,last_at=new.recorded_at
      where trip_id=new.trip_id and last_at < new.recorded_at;
    return new;
  end if;
  for p in select * from public.trf_road_points where not archived and kind <> 'place' and created_at <= new.recorded_at and
    ((abs(latitude-new.latitude)<0.03 and abs(longitude-new.longitude)<0.04) or id in (select point_id from trf_private.road_visits where trip_id=new.trip_id and entered_at is not null)) loop
    dist := trf_private.road_distance(p.latitude,p.longitude,new.latitude,new.longitude);
    select * into v from trf_private.road_visits where trip_id=new.trip_id and point_id=p.id;
    if found and new.recorded_at <= v.last_at then continue; end if;
    if v.trip_id is null or new.recorded_at-v.last_at > interval '90 seconds' or v.segment <> new.segment or v.point_version <> p.updated_at or new.accuracy_m > p.radius_m/2.0 then
      insert into trf_private.road_visits(trip_id,point_id,last_at,lat,lng,segment,point_version)
      values(new.trip_id,p.id,new.recorded_at,new.latitude,new.longitude,new.segment,p.updated_at)
      on conflict(trip_id,point_id) do update set last_at=excluded.last_at,lat=excluded.lat,lng=excluded.lng,segment=excluded.segment,point_version=excluded.point_version,entered_at=null,samples=0;
      continue;
    end if;
    if dist <= p.radius_m then
      if v.entered_at is null and trf_private.road_distance(p.latitude,p.longitude,v.lat,v.lng) > p.radius_m then
        v.entered_at := new.recorded_at; v.approach_lat := v.lat; v.approach_lng := v.lng; v.samples := 0; v.peak_speed := null; v.accuracy := 0;
      end if;
      if v.entered_at is not null then
        v.samples := v.samples+1;
        if new.speed_kmh between 0 and 160 then v.peak_speed := greatest(v.peak_speed,new.speed_kmh); end if;
        v.accuracy := greatest(v.accuracy,new.accuracy_m);
      end if;
    elsif dist > p.radius_m * 2 and v.entered_at is not null then
      opposite := (v.approach_lat-p.latitude)*(new.latitude-p.latitude) +
        (v.approach_lng-p.longitude)*(new.longitude-p.longitude)*power(cos(radians(p.latitude)),2) < 0;
      if v.samples >= 2 and opposite then
        price := null;
        if p.kind='toll' then select amount into price from public.trf_toll_rates where point_id=p.id and vehicle_key=k and valid_from <= v.entered_at order by valid_from desc limit 1; end if;
        event := null;
        insert into public.trf_road_events(point_id,point_name,kind,vehicle_key,vehicle_name,trip_id,entered_at,happened_at,speed_kmh,speed_limit,accuracy_m,amount)
        values(p.id,p.name,p.kind,k,new.vehicle,new.trip_id,v.entered_at,new.recorded_at,v.peak_speed,p.speed_limit,v.accuracy,price)
        on conflict(point_id,trip_id,entered_at) do nothing returning id into event;
        if event is not null and price > 0 then
          insert into public.trf_toll_movements(vehicle_key,vehicle_name,kind,amount,happened_at,notes,event_id)
          values(k,new.vehicle,'passage',-price,new.recorded_at,'Paso GPS estimado · ' || p.name,event);
        end if;
      end if;
      v.entered_at := null; v.samples := 0;
    end if;
    update trf_private.road_visits set last_at=new.recorded_at,lat=new.latitude,lng=new.longitude,entered_at=v.entered_at,
      approach_lat=v.approach_lat,approach_lng=v.approach_lng,samples=v.samples,peak_speed=v.peak_speed,accuracy=v.accuracy
      where trip_id=new.trip_id and point_id=p.id;
  end loop;
  return new;
end; $$;
revoke all on function trf_private.observe_road_passage() from public, anon, authenticated;
create trigger trf_observe_road_passage after insert on public.trf_driver_location_history
  for each row execute function trf_private.observe_road_passage();

-- Audit configuration and corrections without exposing old values to unauthenticated clients.
create table trf_private.road_audit(id bigint generated always as identity primary key, changed_at timestamptz not null default now(), actor uuid, entity text not null, before_row jsonb, after_row jsonb);
revoke all on trf_private.road_audit from public, anon, authenticated;
create function trf_private.audit_road() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into trf_private.road_audit(actor,entity,before_row,after_row) values(auth.uid(),tg_table_name,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  return new;
end; $$;
revoke all on function trf_private.audit_road() from public, anon, authenticated;
create trigger road_points_audit after insert or update on public.trf_road_points for each row execute function trf_private.audit_road();
create trigger road_tank_audit after insert or update on public.trf_tank_references for each row execute function trf_private.audit_road();
notify pgrst, 'reload schema';

