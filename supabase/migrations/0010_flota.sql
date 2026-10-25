-- Flota (decisión del 24/10/2026): la ficha de cada camión y de cada acoplado, con su foto, y qué acoplado lleva cada
-- camión. Solo agrega: dos tablas nuevas con sus controles, una función para cambiar el acoplado de un camión, una carpeta
-- privada para las fotos con sus reglas, el historial privado de cambios y los permisos. No cambia datos ni permisos
-- existentes. La lista de camiones sigue siendo la del catálogo que usa la app (trf_mobile_catalog): la ficha se une a su
-- camión por la matrícula, con la misma clave que el tanque (trf_tank_settings). Las ven y las cargan solo las cuentas del
-- panel. Nada se borra: un camión o un acoplado que se vende queda con su fecha de baja, y un enganche mal cargado se
-- anula. Al darlo de baja deja de llevar su acoplado, o de ir en su camión, desde ese día.

-- La ficha de un camión del catálogo o de un acoplado.
create table public.trf_fleet_units (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  -- Como en el tanque y en las cuentas de ruta: «plate:» y la matrícula en minúsculas, o «model:» y el modelo si el
  -- camión del catálogo no tiene matrícula («model:» y la matrícula si tiene matrícula pero no modelo). Un acoplado va
  -- siempre con su matrícula.
  vehicle_key text not null unique,
  plate text not null default '',
  -- Cómo nombra al camión la lista de la app («Volvo FH 460 · ABC1234»), el nombre de sus viajes, papeles y services. Si
  -- sale de la lista, la ficha lo sigue nombrando así aunque se le corrijan la marca o el modelo. Un acoplado no lleva.
  catalog_name text not null default '',
  brand text not null default '',
  model text not null default '',
  -- El tipo de acoplado (semirremolque, cisterna, volcadora…); un camión no lleva.
  body text not null default '',
  year integer,
  -- Los números de chasis y de motor, como figuran en la libreta de propiedad.
  chassis text not null default '',
  engine text not null default '',
  -- Lo que lleva: kilos, o metros cúbicos si es cisterna.
  capacity numeric(10, 2),
  capacity_unit text,
  notes text not null default '',
  -- La foto, en la carpeta trf-fleet-photos: «<id de la ficha>/<id de la foto>.jpg». Una foto nueva no borra la anterior.
  photo_path text,
  -- El día en que se vendió o dejó de usarse, y por qué. La ficha queda con su historial.
  left_on date,
  left_reason text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint trf_fleet_units_kind check (kind in ('truck', 'trailer')),
  constraint trf_fleet_units_key check (
    (plate <> '' and vehicle_key = 'plate:' || lower(plate))
    or (kind = 'truck' and vehicle_key ~ '^model:.+$' and (plate = '' or vehicle_key = 'model:' || lower(plate)))
  ),
  constraint trf_fleet_units_texts check (
    plate = trim(plate) and length(plate) <= 20 and length(vehicle_key) <= 200 and length(brand) <= 60
    and length(model) <= 80 and length(body) <= 40 and length(chassis) <= 40 and length(engine) <= 40
    and length(notes) <= 1000 and length(left_reason) <= 200 and length(catalog_name) <= 200
  ),
  constraint trf_fleet_units_body check (kind = 'trailer' or body = ''),
  constraint trf_fleet_units_catalog_name check (kind = 'truck' or catalog_name = ''),
  constraint trf_fleet_units_year check (year is null or year between 1950 and 2100),
  constraint trf_fleet_units_capacity check (
    (capacity is null and capacity_unit is null)
    or (capacity is not null and capacity > 0 and capacity < 1000000 and capacity_unit is not null and capacity_unit in ('kg', 'm3'))
  ),
  constraint trf_fleet_units_photo check (
    photo_path is null or (photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' and starts_with(photo_path, id::text || '/'))
  ),
  constraint trf_fleet_units_left check (left_on is null or left_on >= date '1950-01-01'),
  constraint trf_fleet_units_left_reason check (left_on is not null or left_reason = '')
);

-- Qué acoplado llevó cada camión, del primer al último día. Sin último día, lo lleva ahora. El camión va con su clave
-- (la del catálogo y la de su ficha, si la tiene).
create table public.trf_fleet_hitches (
  id uuid primary key default gen_random_uuid(),
  trailer_id uuid not null references public.trf_fleet_units (id),
  truck_key text not null,
  from_on date not null,
  to_on date,
  notes text not null default '',
  -- Un enganche mal cargado se anula: queda guardado, pero no cuenta.
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint trf_fleet_hitches_truck check (truck_key ~ '^(plate|model):.+$' and length(truck_key) <= 200),
  constraint trf_fleet_hitches_dates check (from_on >= date '1950-01-01' and (to_on is null or to_on >= from_on)),
  constraint trf_fleet_hitches_notes check (length(notes) <= 500)
);

-- Ahora, un acoplado va en un solo camión y un camión lleva un solo acoplado.
create unique index trf_fleet_hitches_trailer_now on public.trf_fleet_hitches (trailer_id) where to_on is null and deleted_at is null;
create unique index trf_fleet_hitches_truck_now on public.trf_fleet_hitches (truck_key) where to_on is null and deleted_at is null;
create index trf_fleet_hitches_truck on public.trf_fleet_hitches (truck_key, from_on);

-- Cada guardado anota cuándo y quién, y deja fijos quién y cuándo lo creó. Una ficha sigue siendo de su clase, y la de un
-- camión, de su camión del catálogo. Un enganche sigue siendo del mismo acoplado y del mismo camión: uno equivocado se
-- anula y se carga de nuevo. Un respaldo se restaura con los disparadores apagados, así conserva lo que tenía.
create function trf_private.fleet_touch()
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
    if tg_table_name = 'trf_fleet_units' then
      new.kind := old.kind;
      if old.kind = 'truck' then
        new.vehicle_key := old.vehicle_key;
        new.plate := old.plate;
      end if;
    else
      new.trailer_id := old.trailer_id;
      new.truck_key := old.truck_key;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function trf_private.fleet_touch() from public, anon, authenticated;

create trigger trf_fleet_units_touch before insert or update on public.trf_fleet_units
  for each row execute function trf_private.fleet_touch();
create trigger trf_fleet_hitches_touch before insert or update on public.trf_fleet_hitches
  for each row execute function trf_private.fleet_touch();

-- Un enganche es de un acoplado, y sus días no se pisan con otro del mismo acoplado ni con otro del mismo camión (los
-- anulados no cuentan). Un camión o un acoplado dado de baja no queda enganchado. Los cambios que pueden pisar a otro
-- enganche se hacen de a uno, con un solo turno para todos: así dos cambios nunca se esperan entre sí.
create function trf_private.fleet_hitch_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Un enganche anulado no cuenta, y uno que termina antes de empezar lo rechaza el control de la tabla.
  if new.deleted_at is not null or new.to_on < new.from_on then
    return new;
  end if;
  -- Achicar los días de uno que cuenta (desengancharlo, o cambiarle la nota) no puede pisar a otro: no espera turno.
  if tg_op = 'UPDATE' and old.deleted_at is null and new.from_on >= old.from_on
    and (old.to_on is null or (new.to_on is not null and new.to_on <= old.to_on)) then
    return new;
  end if;
  if not exists (select 1 from public.trf_fleet_units u where u.id = new.trailer_id and u.kind = 'trailer') then
    raise exception 'Solo se engancha un acoplado' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('trf_fleet_hitches', 0));
  if new.to_on is null and exists (
    select 1 from public.trf_fleet_units u
    where u.left_on is not null
      and ((u.kind = 'trailer' and u.id = new.trailer_id) or (u.kind = 'truck' and u.vehicle_key = new.truck_key))
  ) then
    raise exception 'Ese camión o ese acoplado está dado de baja' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.trf_fleet_hitches h
    where h.id <> new.id and h.deleted_at is null
      and (h.trailer_id = new.trailer_id or h.truck_key = new.truck_key)
      and daterange(h.from_on, h.to_on, '[]') && daterange(new.from_on, new.to_on, '[]')
  ) then
    raise exception 'Esos días se pisan con otro enganche del mismo camión o del mismo acoplado' using errcode = '23P01';
  end if;
  return new;
end;
$$;
revoke all on function trf_private.fleet_hitch_check() from public, anon, authenticated;

-- Después de trf_fleet_hitches_touch (los disparadores corren por orden alfabético): revisa el enganche como queda.
create trigger trf_fleet_hitches_verify before insert or update on public.trf_fleet_hitches
  for each row execute function trf_private.fleet_hitch_check();

-- Un camión o un acoplado que se da de baja deja de llevar su acoplado, o de ir en su camión, desde ese día: el enganche
-- de ahora queda hasta el día anterior, en el historial de los dos. Si después se corrige el día de la baja, el enganche
-- que terminó con ella pasa a terminar el día anterior al nuevo. Por eso la baja tiene que ser posterior al día en que se
-- enganchó, y no puede alargar ese enganche sobre otro. Volver a ponerlo en uso no lo engancha de nuevo. Espera el mismo
-- turno que los cambios de enganche, así nadie lo engancha mientras tanto. Corre con los permisos de quien guarda la baja.
create function trf_private.fleet_leave()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('trf_fleet_hitches', 0));
  -- El enganche que termina con la baja: el de ahora, o el que terminó con la baja que se corrige.
  if exists (
    select 1 from public.trf_fleet_hitches h
    where h.deleted_at is null and h.from_on >= new.left_on
      and (case when old.left_on is null then h.to_on is null else h.to_on = old.left_on - 1 end)
      and (case when new.kind = 'trailer' then h.trailer_id = new.id else h.truck_key = new.vehicle_key end)
  ) then
    raise exception 'La baja tiene que ser posterior al día en que se enganchó' using errcode = '23514';
  end if;
  update public.trf_fleet_hitches h set to_on = new.left_on - 1
  where h.deleted_at is null
    and (case when old.left_on is null then h.to_on is null else h.to_on = old.left_on - 1 end)
    and (case when new.kind = 'trailer' then h.trailer_id = new.id else h.truck_key = new.vehicle_key end);
  return null;
end;
$$;
revoke all on function trf_private.fleet_leave() from public, anon, authenticated;

create trigger trf_fleet_units_leave after update on public.trf_fleet_units
  for each row when (new.left_on is not null and old.left_on is distinct from new.left_on) execute function trf_private.fleet_leave();

-- El mismo historial privado que el tanque de cada camión (migración 0009): cada alta y cada cambio, con quién lo hizo y
-- cómo quedó antes y después.
create trigger trf_fleet_units_audit after insert or update on public.trf_fleet_units
  for each row execute function trf_private.audit_road();
create trigger trf_fleet_hitches_audit after insert or update on public.trf_fleet_hitches
  for each row execute function trf_private.audit_road();

-- Enganchar un acoplado a un camión desde un día, de una vez: el acoplado que llevaba el camión y el camión en el que
-- iba el acoplado quedan hasta el día anterior. Corre con los permisos de quien la llama (solo las cuentas del panel
-- escriben). Si otra persona cambió el acoplado del camión o el camión del acoplado mientras se elegía, no guarda nada.
-- Un pedido repetido porque se cortó la respuesta encuentra su enganche y lo devuelve.
create function public.trf_fleet_hitch(
  p_id uuid,
  p_truck_key text,
  p_trailer_id uuid,
  p_from date,
  p_truck_current uuid,
  p_trailer_current uuid,
  p_notes text default ''
)
returns public.trf_fleet_hitches
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved public.trf_fleet_hitches;
begin
  perform pg_advisory_xact_lock(hashtextextended('trf_fleet_hitches', 0));
  -- Después de esperar su turno: un pedido repetido mientras el primero todavía se guardaba también lo encuentra.
  select * into saved from public.trf_fleet_hitches where id = p_id;
  if found then
    return saved;
  end if;
  if (select h.id from public.trf_fleet_hitches h where h.truck_key = p_truck_key and h.to_on is null and h.deleted_at is null) is distinct from p_truck_current
    or (select h.id from public.trf_fleet_hitches h where h.trailer_id = p_trailer_id and h.to_on is null and h.deleted_at is null) is distinct from p_trailer_current then
    raise exception 'Otra persona cambió el acoplado mientras se elegía' using errcode = '40001';
  end if;
  update public.trf_fleet_hitches set to_on = p_from - 1
  where to_on is null and deleted_at is null and (truck_key = p_truck_key or trailer_id = p_trailer_id);
  insert into public.trf_fleet_hitches (id, trailer_id, truck_key, from_on, notes)
  values (p_id, p_trailer_id, p_truck_key, p_from, coalesce(p_notes, ''))
  returning * into saved;
  return saved;
end;
$$;
revoke all on function public.trf_fleet_hitch(uuid, text, uuid, date, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.trf_fleet_hitch(uuid, text, uuid, date, uuid, uuid, text) to authenticated;

-- Las cuentas del panel leen, dan de alta y corrigen; nadie borra. Sin ingresar no se ve ni se escribe nada.
do $$
declare
  t text;
begin
  foreach t in array array['trf_fleet_units', 'trf_fleet_hitches'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update on table public.%I to authenticated', t);
    execute format('create policy panel_read on public.%I for select to authenticated using ((select public.trf_is_panel_admin()))', t);
    execute format('create policy panel_insert on public.%I for insert to authenticated with check ((select public.trf_is_panel_admin()))', t);
    execute format('create policy panel_update on public.%I for update to authenticated using ((select public.trf_is_panel_admin())) with check ((select public.trf_is_panel_admin()))', t);
  end loop;
end
$$;

-- La carpeta privada de las fotos de la flota: JPEG, como las achica el panel, hasta 10 MB. Las suben y las abren solo las
-- cuentas del panel. Nadie las reemplaza ni las borra: una foto nueva va con otro nombre.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trf-fleet-photos', 'trf-fleet-photos', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

create policy trf_fleet_photos_insert on storage.objects
  as permissive for insert to authenticated
  with check (bucket_id = 'trf-fleet-photos' and (select public.trf_is_panel_admin()));

create policy trf_fleet_photos_read on storage.objects
  as permissive for select to authenticated
  using (bucket_id = 'trf-fleet-photos' and (select public.trf_is_panel_admin()));

notify pgrst, 'reload schema';
