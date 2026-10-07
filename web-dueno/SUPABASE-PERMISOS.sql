-- PERMISOS DE LECTURA PARA DUEÑOS (propuesta, NO ejecutada).
-- Revisar antes de pegar en Supabase > SQL Editor.
--
-- Qué hace: permite que los correos listados en trf_owners LEAN (solo lectura) las filas de
-- todos los choferes en las tablas del GPS. Los choferes siguen viendo solo lo suyo, porque las
-- políticas de Supabase se suman (si una permite, se permite).
--
-- IMPORTANTE:
--  1) Si el panel ya tiene su propio mecanismo de administradores, reemplazá el cuerpo de
--     trf_is_owner() por esa comprobación en vez de usar la tabla trf_owners.
--  2) Estas políticas solo tienen efecto si cada tabla tiene RLS activado
--     (alter table ... enable row level security). Verificalo antes.
--  3) La comprobación usa el correo de la sesión. Mantené desactivado el registro público de
--     usuarios y la confirmación de correo, para que nadie pueda crear una cuenta con un correo de dueño.

create table if not exists public.trf_owners (email text primary key);
alter table public.trf_owners enable row level security;   -- sin políticas: solo la función de abajo la lee

create or replace function public.trf_is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trf_owners
                 where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;
revoke all on function public.trf_is_owner() from public;
grant execute on function public.trf_is_owner() to authenticated;

insert into public.trf_owners (email) values ('luis@trferreira.com') on conflict do nothing;

do $$
declare t text;
begin
  foreach t in array array['trf_driver_locations','trf_driver_tracking_sessions',
                           'trf_driver_location_history','trf_driver_fuel_receipts'] loop
    execute format('drop policy if exists "trf owners read" on public.%I', t);
    execute format('create policy "trf owners read" on public.%I for select to authenticated using (public.trf_is_owner())', t);
  end loop;
end $$;

-- Para deshacer:
--   drop policy "trf owners read" on public.<tabla>;   (en cada una de las 4 tablas)
