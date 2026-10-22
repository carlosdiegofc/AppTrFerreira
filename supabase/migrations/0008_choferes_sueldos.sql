-- Choferes (decisión del 22/10/2026): la ficha de cada chofer, su sueldo del mes y los pagos que se le hacen.
-- Solo agrega: tres tablas nuevas con sus controles, su historial privado de cambios y sus permisos. No cambia datos ni
-- permisos existentes. Fichas, sueldos y pagos los ven y los cargan solo las cuentas del panel: los choferes no los ven,
-- ni siquiera los suyos. Nada se borra: un sueldo o un pago anulado queda con deleted_at, y la ficha de quien ya no
-- trabaja queda inactiva, con el día en que dejó de trabajar.

-- La ficha. La cuenta de la app (la misma de sus viajes, sus papeles y su posición) es opcional: un chofer nuevo puede
-- tener ficha antes de usar la app. Una ficha por cuenta.
create table public.trf_drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  name text not null,
  phone text not null default '',
  -- Cédula de identidad, como se escribe.
  document_id text not null default '',
  hired_on date,
  -- Categoría de la libreta de conducir. Su vencimiento y su foto van con los papeles, en Documentación.
  license_category text not null default '',
  -- Cómo se le paga: el medio de siempre, el banco y la cuenta.
  pay_method text not null default '',
  bank text not null default '',
  bank_account text not null default '',
  notes text not null default '',
  active boolean not null default true,
  -- El día en que dejó de trabajar: desde el mes siguiente no se le cuenta sueldo. Lo tiene toda ficha inactiva, y solo ella.
  left_on date,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint trf_drivers_texts check (
    length(trim(name)) between 1 and 120 and length(phone) <= 40 and length(document_id) <= 20
    and length(license_category) <= 20 and length(bank) <= 80 and length(bank_account) <= 60 and length(notes) <= 1000
  ),
  constraint trf_drivers_pay_method check (pay_method in ('', 'efectivo', 'transferencia', 'cheque', 'otro')),
  constraint trf_drivers_hired_on check (hired_on is null or hired_on >= date '1950-01-01'),
  constraint trf_drivers_left_on check (left_on is null or (left_on >= date '1950-01-01' and (hired_on is null or left_on >= hired_on))),
  constraint trf_drivers_active_left_on check (active = (left_on is null))
);

-- El sueldo del mes: desde qué mes rige cada monto. Uno nuevo no borra el anterior, que sigue valiendo para sus meses.
create table public.trf_driver_salaries (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.trf_drivers (id),
  -- El primer día del mes desde el que rige.
  starts_on date not null,
  amount numeric(14, 2) not null,
  currency text not null,
  notes text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint trf_driver_salaries_month check (extract(day from starts_on) = 1 and starts_on >= date '2000-01-01'),
  constraint trf_driver_salaries_amount check (amount > 0 and amount < 100000000),
  constraint trf_driver_salaries_currency check (currency in ('UYU', 'USD')),
  constraint trf_driver_salaries_notes check (length(notes) <= 500)
);

-- Un sueldo vigente por chofer y mes de inicio; los anulados no cuentan.
create unique index trf_driver_salaries_one_per_month on public.trf_driver_salaries (driver_id, starts_on)
  where deleted_at is null;

-- Cada pago: cuándo se hizo, a qué mes del sueldo corresponde y qué es. Los adelantos y el sueldo se restan del sueldo
-- de ese mes; el aguinaldo, la licencia, los viáticos y lo demás se muestran aparte.
create table public.trf_driver_payments (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.trf_drivers (id),
  paid_on date not null,
  -- El primer día del mes al que corresponde.
  period date not null,
  amount numeric(14, 2) not null,
  currency text not null,
  concept text not null,
  method text not null,
  notes text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint trf_driver_payments_dates check (
    extract(day from period) = 1 and period >= date '2000-01-01' and paid_on >= date '2000-01-01'
  ),
  constraint trf_driver_payments_amount check (amount > 0 and amount < 100000000),
  constraint trf_driver_payments_currency check (currency in ('UYU', 'USD')),
  constraint trf_driver_payments_concept check (concept in ('adelanto', 'sueldo', 'aguinaldo', 'vacaciones', 'viatico', 'otro')),
  constraint trf_driver_payments_method check (method in ('efectivo', 'transferencia', 'cheque', 'otro')),
  constraint trf_driver_payments_notes check (length(notes) <= 500)
);

create index trf_driver_payments_driver_period on public.trf_driver_payments (driver_id, period);
create index trf_driver_salaries_driver on public.trf_driver_salaries (driver_id, starts_on);

-- Cada guardado anota cuándo y quién, y deja fijos quién y cuándo lo creó (y, en sueldos y pagos, de qué chofer es: un
-- pago a otro chofer se anula y se carga de nuevo). Un respaldo se restaura con los disparadores apagados, así conserva
-- lo que tenía.
create function trf_private.driver_touch()
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
    if tg_table_name <> 'trf_drivers' then
      new.driver_id := old.driver_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger trf_drivers_touch before insert or update on public.trf_drivers
  for each row execute function trf_private.driver_touch();
create trigger trf_driver_salaries_touch before insert or update on public.trf_driver_salaries
  for each row execute function trf_private.driver_touch();
create trigger trf_driver_payments_touch before insert or update on public.trf_driver_payments
  for each row execute function trf_private.driver_touch();

-- Historial privado: cada alta y cada cambio, con quién lo hizo y cómo quedó antes y después. No lo lee ningún cliente.
create table trf_private.driver_audit (
  id bigint generated always as identity primary key,
  changed_at timestamptz not null default now(),
  actor uuid,
  entity text not null,
  row_id uuid not null,
  before_row jsonb,
  after_row jsonb not null
);
revoke all on trf_private.driver_audit from public, anon, authenticated;

create function trf_private.driver_audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into trf_private.driver_audit (actor, entity, row_id, before_row, after_row)
  values (auth.uid(), tg_table_name, new.id, case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
  return new;
end;
$$;
revoke all on function trf_private.driver_audit_row() from public, anon, authenticated;

create trigger trf_drivers_audit after insert or update on public.trf_drivers
  for each row execute function trf_private.driver_audit_row();
create trigger trf_driver_salaries_audit after insert or update on public.trf_driver_salaries
  for each row execute function trf_private.driver_audit_row();
create trigger trf_driver_payments_audit after insert or update on public.trf_driver_payments
  for each row execute function trf_private.driver_audit_row();

-- Las cuentas del panel leen, dan de alta y corrigen; nadie borra. Una tabla nueva no lleva los permisos amplios que
-- Supabase da por defecto: sin ingresar no se ve ni se escribe nada.
do $$
declare
  t text;
begin
  foreach t in array array['trf_drivers', 'trf_driver_salaries', 'trf_driver_payments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update on table public.%I to authenticated', t);
    execute format('create policy panel_read on public.%I for select to authenticated using ((select public.trf_is_panel_admin()))', t);
    execute format('create policy panel_insert on public.%I for insert to authenticated with check ((select public.trf_is_panel_admin()))', t);
    execute format('create policy panel_update on public.%I for update to authenticated using ((select public.trf_is_panel_admin())) with check ((select public.trf_is_panel_admin()))', t);
  end loop;
end
$$;

notify pgrst, 'reload schema';
