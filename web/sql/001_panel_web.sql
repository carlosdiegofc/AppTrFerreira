-- =====================================================================
--  Panel web TR Ferreira · Instalación 001
-- ---------------------------------------------------------------------
--  Dónde: Supabase → SQL Editor → New query → pegar todo → Run.
--  Se puede ejecutar más de una vez: no duplica nada.
--
--  Qué hace:
--   1. Crea la lista de administradores del panel (trf_panel_admins).
--   2. Crea la tabla de viajes del panel (trf_panel_trips): ahí se guarda
--      lo que completás o cargás a mano. Los viajes de la app NO se copian
--      ni se modifican: el panel los lee y les suma tus datos.
--   3. Da permiso de LECTURA a los administradores sobre las tablas de la
--      app (viajes GPS, recorridos, ubicaciones, remitos, combustible).
--      Los choferes siguen viendo solo lo suyo.
--
--  Qué NO hace: no borra ni cambia datos ni permisos existentes de la app.
--  Al final muestra un informe: revisá que todo diga "OK".
-- =====================================================================

begin;
-- Solo mostrar avisos importantes (los "does not exist, skipping" de la primera vez se ocultan).
set local client_min_messages = warning;

-- ---------------------------------------------------------------------
-- 1. Administradores del panel
-- ---------------------------------------------------------------------
create table if not exists public.trf_panel_admins (
  user_id    uuid primary key,
  email      text not null,
  created_at timestamptz not null default now()
);
alter table public.trf_panel_admins enable row level security;
-- Sin políticas a propósito: desde la web nadie puede leerla ni cambiarla.
revoke all on table public.trf_panel_admins from anon, authenticated;

create or replace function public.trf_is_panel_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.trf_panel_admins where user_id = auth.uid());
$$;
revoke all on function public.trf_is_panel_admin() from public;
revoke all on function public.trf_is_panel_admin() from anon;
grant execute on function public.trf_is_panel_admin() to authenticated;

-- ✏️  EDITÁ ESTA LISTA: correos de las cuentas que administran el panel.
--     Tienen que ser cuentas que ya existen (Supabase → Authentication → Users).
insert into public.trf_panel_admins (user_id, email)
select u.id, u.email
from auth.users u
where lower(u.email) in (
  'luis@trferreira.com'
  -- , 'otro-administrador@correo.com'
)
on conflict (user_id) do update set email = excluded.email;

-- ---------------------------------------------------------------------
-- 2. Viajes del panel
-- ---------------------------------------------------------------------
create table if not exists public.trf_panel_trips (
  id               uuid primary key default gen_random_uuid(),
  source           text not null default 'manual',
  app_trip_id      text unique,          -- id del viaje de la app; vacío = cargado a mano
  departure_at     timestamptz,
  arrival_at       timestamptz,
  driver_id        uuid,
  driver_name      text,
  vehicle          text,
  order_number     text,
  product          text,
  client           text,
  origin_name      text,
  origin_lat       double precision,
  origin_lng       double precision,
  destination_name text,
  destination_lat  double precision,
  destination_lng  double precision,
  billable_km      numeric(10,1),
  kg               numeric(12,1),
  amount           numeric(14,2),
  currency         text not null default 'UYU',
  notes            text,
  deleted_at       timestamptz,          -- con fecha = en la papelera
  created_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid default auth.uid(),
  constraint trf_panel_trips_source       check (source in ('app', 'manual')),
  constraint trf_panel_trips_source_link  check ((source = 'app') = (app_trip_id is not null)),
  constraint trf_panel_trips_manual_date  check (source = 'app' or departure_at is not null),
  constraint trf_panel_trips_dates        check (arrival_at is null or departure_at is null or arrival_at >= departure_at),
  constraint trf_panel_trips_numbers      check (coalesce(billable_km, 0) >= 0 and coalesce(kg, 0) >= 0 and coalesce(amount, 0) >= 0),
  constraint trf_panel_trips_currency     check (currency in ('UYU', 'USD')),
  constraint trf_panel_trips_origin       check ((origin_lat is null) = (origin_lng is null)
                                                 and coalesce(abs(origin_lat), 0) <= 90 and coalesce(abs(origin_lng), 0) <= 180),
  constraint trf_panel_trips_destination  check ((destination_lat is null) = (destination_lng is null)
                                                 and coalesce(abs(destination_lat), 0) <= 90 and coalesce(abs(destination_lng), 0) <= 180),
  constraint trf_panel_trips_lengths      check (coalesce(length(order_number), 0) <= 60
                                                 and coalesce(length(product), 0) <= 120
                                                 and coalesce(length(client), 0) <= 160
                                                 and coalesce(length(origin_name), 0) <= 200
                                                 and coalesce(length(destination_name), 0) <= 200
                                                 and coalesce(length(driver_name), 0) <= 120
                                                 and coalesce(length(vehicle), 0) <= 120
                                                 and coalesce(length(notes), 0) <= 2000)
);
create index if not exists trf_panel_trips_departure_idx on public.trf_panel_trips (departure_at desc);

-- Fecha de modificación automática y campos que no se pueden cambiar.
create or replace function public.trf_panel_trips_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' then
    new.id          := old.id;
    new.source      := old.source;
    new.app_trip_id := old.app_trip_id;
    new.created_at  := old.created_at;
    new.created_by  := old.created_by;
  end if;
  return new;
end;
$$;
drop trigger if exists trf_panel_trips_touch on public.trf_panel_trips;
create trigger trf_panel_trips_touch
  before insert or update on public.trf_panel_trips
  for each row execute function public.trf_panel_trips_touch();

alter table public.trf_panel_trips enable row level security;
drop policy if exists trf_panel_trips_admin_select on public.trf_panel_trips;
drop policy if exists trf_panel_trips_admin_insert on public.trf_panel_trips;
drop policy if exists trf_panel_trips_admin_update on public.trf_panel_trips;
create policy trf_panel_trips_admin_select on public.trf_panel_trips
  for select to authenticated using (public.trf_is_panel_admin());
create policy trf_panel_trips_admin_insert on public.trf_panel_trips
  for insert to authenticated with check (public.trf_is_panel_admin());
create policy trf_panel_trips_admin_update on public.trf_panel_trips
  for update to authenticated using (public.trf_is_panel_admin()) with check (public.trf_is_panel_admin());
-- Sin política de borrado: un viaje eliminado va a la papelera (deleted_at) y se puede restaurar.
revoke all on table public.trf_panel_trips from anon;
revoke delete, truncate on table public.trf_panel_trips from authenticated;
grant select, insert, update on table public.trf_panel_trips to authenticated;

-- ---------------------------------------------------------------------
-- 3. Lectura de los datos de la app para los administradores
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'trf_driver_tracking_sessions', 'trf_trip_details', 'trf_trip_documents',
    'trf_driver_location_history', 'trf_driver_locations', 'trf_driver_fuel_receipts',
    'trf_mobile_catalog'
  ] loop
    if to_regclass('public.' || t) is null then
      raise warning 'Tabla % no encontrada: se omite.', t;
      continue;
    end if;
    begin
      execute format('drop policy if exists trf_panel_admin_read on public.%I', t);
      execute format('create policy trf_panel_admin_read on public.%I for select to authenticated using (public.trf_is_panel_admin())', t);
      execute format('grant select on table public.%I to authenticated', t);
    exception when others then
      raise warning 'No se pudo dar lectura en %: %', t, sqlerrm;
    end;
  end loop;
end;
$$;

-- Fotos de boletas y remitos (solo lectura para administradores).
do $$
begin
  if to_regclass('storage.objects') is null then
    raise warning 'Storage no encontrado: se omite el permiso de fotos.';
    return;
  end if;
  begin
    execute 'drop policy if exists trf_panel_admin_read_photos on storage.objects';
    execute $p$create policy trf_panel_admin_read_photos on storage.objects
      for select to authenticated
      using (bucket_id in ('trf-fuel-receipts', 'trf-trip-documents') and public.trf_is_panel_admin())$p$;
  exception when others then
    raise warning 'No se pudo dar lectura de fotos: %', sqlerrm;
  end;
end;
$$;

commit;

-- ---------------------------------------------------------------------
-- Informe: todo debería decir OK.
-- ---------------------------------------------------------------------
select revisar, resultado from (
select 0 as orden, 'Administradores' as revisar,
       coalesce(string_agg(email, ', ' order by email), 'NINGUNO: agregá tu correo en la lista y volvé a ejecutar') as resultado
from public.trf_panel_admins
union all
select t.orden, 'Tabla ' || t.name,
       case
         when c.oid is null then 'no existe (se omitió)'
         when not c.relrowsecurity then 'OK (sin RLS: la tabla ya es visible para todos los usuarios)'
         when exists (select 1 from pg_policies p
                      where p.schemaname = 'public' and p.tablename = t.name
                        and p.policyname in ('trf_panel_admin_read', 'trf_panel_trips_admin_select')) then 'OK'
         else 'FALTA el permiso de lectura'
       end
from unnest(array[
  'trf_panel_trips', 'trf_driver_tracking_sessions', 'trf_trip_details', 'trf_trip_documents',
  'trf_driver_location_history', 'trf_driver_locations', 'trf_driver_fuel_receipts', 'trf_mobile_catalog'
]) with ordinality as t(name, orden)
left join pg_class c on c.oid = to_regclass('public.' || t.name)
union all
select 99, 'Fotos (Storage)',
       case when exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                         and policyname = 'trf_panel_admin_read_photos') then 'OK'
            else 'sin permiso: las fotos no se podrán abrir desde el panel' end
) informe
order by orden;
