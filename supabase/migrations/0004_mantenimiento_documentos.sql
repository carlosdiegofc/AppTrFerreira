-- Mantenimiento y Documentación (decisión del 20/10/2026): los services también vencen por kilómetros, los documentos
-- llevan su archivo (foto o PDF) y la base anota quién cambió cada uno por última vez.
-- Solo agrega: cuatro columnas con sus controles, una función con dos disparadores, una carpeta privada para los archivos
-- y sus reglas. No cambia datos ni quita permisos: la app y el panel siguen borrando services y documentos para siempre,
-- como hasta ahora (decisión del 20/10/2026).

alter table public.trf_vehicle_maintenance
  -- «Cada N km»: cuando se hace, el próximo vence N km después del kilometraje de ese día.
  add column interval_km integer,
  -- Vence cuando el camión llega a este kilometraje (además de la fecha prevista, o en su lugar).
  add column due_km integer,
  add column updated_by uuid,
  add constraint trf_maintenance_interval_km check (interval_km is null or interval_km between 1 and 1000000),
  add constraint trf_maintenance_due_km check (due_km is null or due_km between 0 and 10000000);

alter table public.trf_documents
  -- El archivo del documento en la carpeta trf-documents: «<id del documento>/<id del archivo>.jpg» o «.pdf».
  add column object_path text,
  add column updated_by uuid,
  add constraint trf_documents_object_path check (
    object_path is null or (object_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|pdf)$' and starts_with(object_path, id::text || '/'))
  );

-- Quién lo guardó por última vez (la fecha ya la anota trf_private.touch_updated_at). Sin sesión (el SQL del dueño, un
-- respaldo) queda vacío. Un respaldo se restaura con los disparadores apagados, así conserva lo que tenía.
create or replace function public.trf_note_updated_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger trf_maintenance_updated_by
  before insert or update on public.trf_vehicle_maintenance
  for each row execute function public.trf_note_updated_by();

create trigger trf_documents_updated_by
  before insert or update on public.trf_documents
  for each row execute function public.trf_note_updated_by();

-- La carpeta privada de los archivos de los documentos: fotos (JPEG, como las achica el panel) y PDF, hasta 10 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trf-documents', 'trf-documents', false, 10485760, array['image/jpeg', 'application/pdf'])
on conflict (id) do nothing;

-- Los suben y los borran las cuentas que administran la flota (el panel y los administradores completos). Los abren
-- ellas y, para la app, quien puede ver el documento: el chofer el suyo, y los choferes de la flota los de los camiones.
create policy trf_documents_files_insert on storage.objects
  as permissive for insert to authenticated
  with check (bucket_id = 'trf-documents' and (select trf_private.is_fleet_manager()));

create policy trf_documents_files_read on storage.objects
  as permissive for select to authenticated
  using (
    bucket_id = 'trf-documents' and (
      (select trf_private.is_fleet_manager())
      or exists (
        select 1 from public.trf_documents d
        where d.object_path = storage.objects.name
          and ((d.scope = 'driver' and d.driver_id = (select auth.uid())) or (d.scope = 'vehicle' and (select trf_private.is_fleet_member())))
      )
    )
  );

create policy trf_documents_files_delete on storage.objects
  as permissive for delete to authenticated
  using (bucket_id = 'trf-documents' and (select trf_private.is_fleet_manager()));
