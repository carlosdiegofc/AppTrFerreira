-- Applied to project jpwtsffatezwnfhunqrz as migration trf_panel_admin_read_photos (2026-10-10).

-- Panel administrators can open the photos of fuel receipts and remitos of every driver (read only).
-- Same policy as section 3 of web/sql/001_panel_web.sql; it was missing on storage.objects.
create policy trf_panel_admin_read_photos on storage.objects
  for select to authenticated
  using (bucket_id in ('trf-fuel-receipts', 'trf-trip-documents') and public.trf_is_panel_admin());
