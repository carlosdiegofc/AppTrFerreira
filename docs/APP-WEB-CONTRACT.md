# App/web integration — 0.15.0

Base: Claude 0.12.0, commit e8cc20437fc73ac9cdb82b2ca64ded17ae1ede31.
Android source is app/ at repository root. The nested 0.10.1 folder is historical and is not compiled.

- Trips can start without business fields or GPS permission. Empty returns export empty cargo and kg.
- Current transport vehicle uses the catalog label `tipo · matriculaCamion`; web must prefer unique full label/plate and refuse ambiguous model-only matches.
- Driver histories remain owner-only for drivers. Owner accounts (luis@trferreira.com, transportesferreirauy@gmail.com) open the fleet panel instead of the driver home; its fleet-wide reads rely on administrator row security. luis@ is in trf_panel_admins (read-only); transportesferreirauy@ is a full administrator. Catalog access before first trip is granted through trf_driver_catalog_access to the existing authorized drivers. An administrator must enroll new drivers.
- trf_vehicle_maintenance (vehicle, kind, due_on, done_on, odometer_km, notes) and trf_documents (scope driver|vehicle, driver_id and driver_name or vehicle, kind, expires_on, notes) use the catalog vehicle label. Enrolled drivers read services and truck papers; drivers manage their own papers and the services they created; administrators of either kind manage everything; other accounts see nothing. SQL: docs/sql/app_maintenance_documents.sql.
- panel_data on fuel is authoritative, including moneda. Prices/contact data are never added to mobile catalog.
- pending_documents, synced_at and other local bookkeeping fields must never be sent as database columns.
- Pretrip documents are persisted on the trip and recovered with stable IDs. Failed attachments remain pending and do not stop other records.
- GPS rejects impossible fixes both from distance and map upload. Raw older routes are not rewritten.
- 0.15.0 changes no data exchanged with the web. It targets API 36, no longer declares background location (trip GPS runs in the location foreground service) and is distributed through Google Play; a Play install has a different signature, so the old APK must be uninstalled once after its pending records are sent.
- The app and website use independent deployments. Build an APK from the desired branch; changing main is not required to test this version.

Validation: workflow runs assembleDebug, JVM unit tests and bundleRelease (signed with the Play upload key from the repository secrets, or a throwaway key when they are missing). Physical GPS, camera, battery restrictions and display remain device acceptance tests.
