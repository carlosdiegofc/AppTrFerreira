-- Applied to project jpwtsffatezwnfhunqrz as migration trf_maintenance_and_documents (app 0.14.0).

-- Fleet members: drivers with app access, plus both kinds of administrators.
create or replace function trf_private.is_fleet_manager() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    trf_private.is_admin()
    or exists (select 1 from public.trf_panel_admins p where p.user_id = auth.uid()));
$$;

create or replace function trf_private.is_fleet_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists (select 1 from public.trf_driver_catalog_access a where a.driver_id = auth.uid())
    or exists (select 1 from public.trf_driver_tracking_sessions s where s.driver_id = auth.uid())
    or trf_private.is_fleet_manager());
$$;

revoke all on function trf_private.is_fleet_manager() from public, anon;
revoke all on function trf_private.is_fleet_member() from public, anon;
grant execute on function trf_private.is_fleet_manager() to authenticated;
grant execute on function trf_private.is_fleet_member() to authenticated;

create or replace function trf_private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Truck services: planned (due_on) and done (done_on).
create table public.trf_vehicle_maintenance (
  id uuid primary key default gen_random_uuid(),
  vehicle text not null check (length(trim(vehicle)) > 0),
  kind text not null check (length(trim(kind)) > 0),
  due_on date,
  done_on date,
  odometer_km integer check (odometer_km is null or odometer_km >= 0),
  notes text not null default '',
  created_by uuid default auth.uid(),
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index trf_maintenance_vehicle on public.trf_vehicle_maintenance (vehicle);
create trigger trf_maintenance_touch before update on public.trf_vehicle_maintenance
  for each row execute function trf_private.touch_updated_at();
alter table public.trf_vehicle_maintenance enable row level security;
revoke all on table public.trf_vehicle_maintenance from anon;
grant select, insert, update, delete on table public.trf_vehicle_maintenance to authenticated;
create policy maintenance_read on public.trf_vehicle_maintenance for select to authenticated
  using ((select trf_private.is_fleet_member()));
create policy maintenance_insert on public.trf_vehicle_maintenance for insert to authenticated
  with check ((select trf_private.is_fleet_member()) and created_by = (select auth.uid()));
create policy maintenance_update on public.trf_vehicle_maintenance for update to authenticated
  using (created_by = (select auth.uid()) or (select trf_private.is_fleet_manager()))
  with check ((select trf_private.is_fleet_member()));
create policy maintenance_delete on public.trf_vehicle_maintenance for delete to authenticated
  using (created_by = (select auth.uid()) or (select trf_private.is_fleet_manager()));

-- Expiry dates: driver papers (licencia, carné de salud) and truck papers (SOA, patente, MTOP).
create table public.trf_documents (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('driver', 'vehicle')),
  driver_id uuid default auth.uid(),
  driver_name text not null default '',
  vehicle text not null default '',
  kind text not null check (length(trim(kind)) > 0),
  expires_on date,
  notes text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trf_documents_owner check (
    (scope = 'driver' and driver_id is not null) or (scope = 'vehicle' and length(trim(vehicle)) > 0))
);
create index trf_documents_driver on public.trf_documents (driver_id);
create trigger trf_documents_touch before update on public.trf_documents
  for each row execute function trf_private.touch_updated_at();
alter table public.trf_documents enable row level security;
revoke all on table public.trf_documents from anon;
grant select, insert, update, delete on table public.trf_documents to authenticated;
create policy documents_read on public.trf_documents for select to authenticated
  using ((scope = 'driver' and driver_id = (select auth.uid()))
    or (scope = 'vehicle' and (select trf_private.is_fleet_member()))
    or (select trf_private.is_fleet_manager()));
create policy documents_insert on public.trf_documents for insert to authenticated
  with check ((scope = 'driver' and driver_id = (select auth.uid()) and (select trf_private.is_fleet_member()))
    or (select trf_private.is_fleet_manager()));
create policy documents_update on public.trf_documents for update to authenticated
  using ((scope = 'driver' and driver_id = (select auth.uid())) or (select trf_private.is_fleet_manager()))
  with check ((scope = 'driver' and driver_id = (select auth.uid())) or (select trf_private.is_fleet_manager()));
create policy documents_delete on public.trf_documents for delete to authenticated
  using ((scope = 'driver' and driver_id = (select auth.uid())) or (select trf_private.is_fleet_manager()));
