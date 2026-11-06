-- Confirmar los viajes que empiezan solos, y los modos de cada chofer (decisión del dueño del 6/11/2026).
-- Solo agrega: columnas nuevas en los viajes, dos disparadores, una función para confirmar y una tabla nueva. No cambia
-- datos ni permisos existentes: los viajes de siempre (y los que manda una versión anterior de la app) quedan sin
-- confirmación, que es lo mismo que confirmados.

-- 1. La confirmación de un viaje que empezó solo: con carga, vacío (retorno) o no es de la empresa (descartado). Lo
--    contesta el chofer desde la app o una cuenta del panel; un descartado no se borra y se puede volver a confirmar.
alter table public.trf_driver_tracking_sessions
  add column auto boolean not null default false,
  add column confirmation text,
  add column confirmed_by uuid,
  add column confirmed_role text,
  add column confirmed_at timestamptz,
  add constraint trf_sessions_confirmation check (confirmation is null or confirmation in ('pendiente', 'con_carga', 'vacio', 'descartado')),
  add constraint trf_sessions_confirmed_role check (confirmed_role is null or confirmed_role in ('chofer', 'panel'));

create index trf_sessions_pending on public.trf_driver_tracking_sessions (started_at desc) where confirmation = 'pendiente';

-- Un viaje que empezó solo nace «pendiente». La app manda «auto» en cada envío; la confirmación solo la cambia
-- trf_confirm_trip, así un envío repetido del teléfono nunca pisa lo que ya se contestó.
create or replace function trf_private.sessions_confirmation_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.confirmation := case when new.auto then 'pendiente' end;
    new.confirmed_by := null; new.confirmed_role := null; new.confirmed_at := null;
  elsif coalesce(current_setting('trf.confirming', true), '') <> 'on' then
    new.confirmation := old.confirmation; new.confirmed_by := old.confirmed_by;
    new.confirmed_role := old.confirmed_role; new.confirmed_at := old.confirmed_at;
    -- Un viaje que ya era automático lo sigue siendo, y uno manual no pasa a automático.
    new.auto := old.auto;
  end if;
  return new;
end $$;

create trigger trf_sessions_confirmation_guard before insert or update on public.trf_driver_tracking_sessions
  for each row execute function trf_private.sessions_confirmation_guard();

-- Confirmar: el chofer contesta solo sus viajes y solo mientras están pendientes (vale la primera respuesta); una cuenta
-- del panel contesta y corrige cualquiera. «vacio» y «con_carga» también dejan el tipo de carga del viaje.
create or replace function public.trf_confirm_trip(p_trip uuid, p_answer text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  panel boolean := public.trf_is_panel_admin() or trf_private.is_admin();
  t record;
begin
  if me is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  if p_answer not in ('con_carga', 'vacio', 'descartado') then raise exception 'respuesta no válida' using errcode = '22023'; end if;
  select id, driver_id, auto, confirmation into t from public.trf_driver_tracking_sessions where id = p_trip;
  if not found then raise exception 'viaje no encontrado' using errcode = 'P0002'; end if;
  if not panel then
    if t.driver_id <> me then raise exception 'no es tu viaje' using errcode = '42501'; end if;
    -- Ya contestado: queda como está y se devuelve lo que vale.
    if t.confirmation is distinct from 'pendiente' then return t.confirmation; end if;
  end if;
  perform set_config('trf.confirming', 'on', true);
  update public.trf_driver_tracking_sessions set
    confirmation = p_answer,
    confirmed_by = me,
    confirmed_role = case when panel and t.driver_id <> me then 'panel' else 'chofer' end,
    confirmed_at = now(),
    load_type = case p_answer when 'vacio' then 'empty' when 'con_carga' then 'loaded' else load_type end
  where id = p_trip;
  perform set_config('trf.confirming', 'off', true);
  return p_answer;
end $$;

revoke all on function public.trf_confirm_trip(uuid, text) from public, anon;
grant execute on function public.trf_confirm_trip(uuid, text) to authenticated;

-- 2. Los modos de cada chofer. Modo fantasma: la app no hace nada hasta esa fecha ('infinity' = hasta que se apague);
--    lo pone el chofer o una cuenta del panel. Modo zafra: el chofer lo prende y con él empiezan los viajes solos.
create table public.trf_driver_modes (
  driver_id uuid primary key,
  driver_name text not null default '',
  ghost_until timestamptz,
  ghost_by text,
  zafra boolean not null default false,
  zafra_since timestamptz,
  updated_at timestamptz not null default now(),
  constraint trf_driver_modes_ghost_by check (ghost_by is null or ghost_by in ('chofer', 'panel')),
  constraint trf_driver_modes_name check (length(driver_name) <= 200)
);

alter table public.trf_driver_modes enable row level security;
create policy drivers_read_own_modes on public.trf_driver_modes as permissive for select to authenticated using ((driver_id = (select auth.uid() as uid)));
create policy drivers_insert_own_modes on public.trf_driver_modes as permissive for insert to authenticated with check ((driver_id = (select auth.uid() as uid)));
create policy drivers_update_own_modes on public.trf_driver_modes as permissive for update to authenticated using ((driver_id = (select auth.uid() as uid))) with check ((driver_id = (select auth.uid() as uid)));
create policy panel_read_modes on public.trf_driver_modes as permissive for select to authenticated using ((select trf_is_panel_admin()) or (select trf_private.is_admin()));
create policy panel_insert_modes on public.trf_driver_modes as permissive for insert to authenticated with check ((select trf_is_panel_admin()) or (select trf_private.is_admin()));
create policy panel_update_modes on public.trf_driver_modes as permissive for update to authenticated using ((select trf_is_panel_admin()) or (select trf_private.is_admin())) with check (true);

revoke all on table public.trf_driver_modes from public, anon, authenticated, service_role;
grant select, insert, update on table public.trf_driver_modes to authenticated;
grant all on table public.trf_driver_modes to service_role;
