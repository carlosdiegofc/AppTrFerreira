-- Gastos (decisión del 26/10/2026, primera parte de Gastos y finanzas): cada gasto de la empresa, con su factura. Solo
-- agrega: una tabla nueva con sus controles, una carpeta privada para las facturas con sus reglas, el historial privado
-- de cambios y los permisos. No cambia datos ni permisos existentes. Los ven y los cargan solo las cuentas del panel,
-- como Choferes. Nada se borra: un gasto mal cargado se corrige o se anula. El combustible, los peajes del telepeaje y
-- los sueldos siguen en sus secciones: acá van los demás gastos.

create table public.trf_expenses (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null,
  -- El tipo: uno de la lista del panel («Reparación y repuestos», «Cubiertas»…) o uno escrito a mano.
  category text not null,
  amount numeric(14, 2) not null,
  currency text not null,
  -- A qué va: la empresa, un camión (su clave, la misma del tanque y de su ficha), un acoplado (su ficha), un chofer (su
  -- ficha) o un viaje (su clave en el panel: «app:» y el id del viaje de la app, o «web:» y el del viaje cargado en el
  -- panel).
  target text not null,
  vehicle_key text,
  trailer_id uuid references public.trf_fleet_units (id),
  driver_id uuid references public.trf_drivers (id),
  trip_key text,
  -- Cómo se llamaba eso al guardar el gasto («Volvo FH 460 · ABC1234»), para nombrarlo aunque después cambie.
  target_name text not null default '',
  -- El service hecho del que es el costo, cuando se anota desde Mantenimiento. Un service se puede borrar para siempre
  -- (decisión del 20/10/2026): el gasto queda igual.
  service_id uuid,
  supplier text not null default '',
  method text not null,
  notes text not null default '',
  -- La factura, en la carpeta trf-expense-files: «<id del gasto>/<id del archivo>.jpg» o «.pdf». Una nueva no borra la
  -- anterior.
  file_path text,
  -- Un gasto mal cargado se anula: queda guardado, pero no cuenta.
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint trf_expenses_spent_on check (spent_on >= date '2000-01-01'),
  constraint trf_expenses_amount check (amount > 0 and amount < 100000000),
  constraint trf_expenses_currency check (currency in ('UYU', 'USD')),
  constraint trf_expenses_method check (method in ('efectivo', 'transferencia', 'cheque', 'tarjeta', 'otro')),
  constraint trf_expenses_texts check (
    length(trim(category)) between 1 and 60 and category = trim(category) and length(supplier) <= 120
    and length(notes) <= 1000 and length(target_name) <= 200
  ),
  constraint trf_expenses_target check (
    (target = 'company' and vehicle_key is null and trailer_id is null and driver_id is null and trip_key is null)
    or (target = 'truck' and vehicle_key ~ '^(plate|model):.+$' and length(vehicle_key) <= 200
      and trailer_id is null and driver_id is null and trip_key is null)
    or (target = 'trailer' and trailer_id is not null and vehicle_key is null and driver_id is null and trip_key is null)
    or (target = 'driver' and driver_id is not null and vehicle_key is null and trailer_id is null and trip_key is null)
    or (target = 'trip' and trip_key ~ '^(app|web):[0-9a-f-]{36}$' and vehicle_key is null and trailer_id is null and driver_id is null)
  ),
  -- El costo de un service es del camión del service.
  constraint trf_expenses_service check (service_id is null or target = 'truck'),
  constraint trf_expenses_file check (
    file_path is null or (file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|pdf)$' and starts_with(file_path, id::text || '/'))
  )
);

-- Un service tiene un solo costo que cuenta: uno mal cargado se anula y se carga de nuevo.
create unique index trf_expenses_one_per_service on public.trf_expenses (service_id) where service_id is not null and deleted_at is null;
create index trf_expenses_spent_on on public.trf_expenses (spent_on);
create index trf_expenses_vehicle on public.trf_expenses (vehicle_key) where vehicle_key is not null;
create index trf_expenses_trailer on public.trf_expenses (trailer_id) where trailer_id is not null;
create index trf_expenses_driver on public.trf_expenses (driver_id) where driver_id is not null;
create index trf_expenses_trip on public.trf_expenses (trip_key) where trip_key is not null;

-- Cada guardado anota cuándo y quién, y deja fijos quién y cuándo lo creó y de qué service es el costo (uno equivocado se
-- anula y se carga de nuevo). Un gasto de un acoplado va con la ficha de un acoplado. Un respaldo se restaura con los
-- disparadores apagados, así conserva lo que tenía.
create function trf_private.expense_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ts timestamptz := clock_timestamp();
begin
  new.updated_at := ts;
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    new.created_at := ts;
    new.created_by := auth.uid();
  else
    new.id := old.id;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.service_id := old.service_id;
  end if;
  if new.target = 'trailer' and not exists (
    select 1 from public.trf_fleet_units u where u.id = new.trailer_id and u.kind = 'trailer'
  ) then
    raise exception 'Ese vehículo no es un acoplado' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function trf_private.expense_touch() from public, anon, authenticated;

create trigger trf_expenses_touch before insert or update on public.trf_expenses
  for each row execute function trf_private.expense_touch();

-- El mismo historial privado que la flota y el tanque de cada camión: cada alta y cada cambio, con quién lo hizo y cómo
-- quedó antes y después.
create trigger trf_expenses_audit after insert or update on public.trf_expenses
  for each row execute function trf_private.audit_road();

-- Las cuentas del panel leen, dan de alta y corrigen; nadie borra. Sin ingresar no se ve ni se escribe nada.
alter table public.trf_expenses enable row level security;
revoke all on table public.trf_expenses from public, anon, authenticated;
grant select, insert, update on table public.trf_expenses to authenticated;
create policy panel_read on public.trf_expenses for select to authenticated using ((select public.trf_is_panel_admin()));
create policy panel_insert on public.trf_expenses for insert to authenticated with check ((select public.trf_is_panel_admin()));
create policy panel_update on public.trf_expenses for update to authenticated
  using ((select public.trf_is_panel_admin())) with check ((select public.trf_is_panel_admin()));

-- La carpeta privada de las facturas: fotos (JPEG, como las achica el panel) y PDF, hasta 10 MB. Las suben y las abren
-- solo las cuentas del panel. Nadie las reemplaza ni las borra: una factura nueva va con otro nombre.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trf-expense-files', 'trf-expense-files', false, 10485760, array['image/jpeg', 'application/pdf'])
on conflict (id) do nothing;

create policy trf_expense_files_insert on storage.objects
  as permissive for insert to authenticated
  with check (bucket_id = 'trf-expense-files' and (select public.trf_is_panel_admin()));

create policy trf_expense_files_read on storage.objects
  as permissive for select to authenticated
  using (bucket_id = 'trf-expense-files' and (select public.trf_is_panel_admin()));

notify pgrst, 'reload schema';
