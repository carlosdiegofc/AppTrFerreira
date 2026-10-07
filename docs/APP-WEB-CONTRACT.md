# App/web integration — 0.12.1

Base: Claude 0.12.0, commit e8cc20437fc73ac9cdb82b2ca64ded17ae1ede31.
Android source is app/ at repository root. The nested 0.10.1 folder is historical and is not compiled.

- Trips can start without business fields or GPS permission. Empty returns export empty cargo and kg.
- Current transport vehicle uses the catalog label `tipo · matriculaCamion`; web must prefer unique full label/plate and refuse ambiguous model-only matches.
- Driver histories remain owner-only. Catalog access before first trip is granted through trf_driver_catalog_access to the existing authorized drivers. An administrator must enroll new drivers.
- panel_data on fuel is authoritative, including moneda. Prices/contact data are never added to mobile catalog.
- pending_documents, synced_at and other local bookkeeping fields must never be sent as database columns.
- Pretrip documents are persisted on the trip and recovered with stable IDs. Failed attachments remain pending and do not stop other records.
- GPS rejects impossible fixes both from distance and map upload. Raw older routes are not rewritten.
- The app and website use independent deployments. Build an APK from the desired branch; changing main is not required to test this version.

Validation: workflow runs assembleDebug and JVM unit tests. Physical GPS, camera, battery restrictions and display remain device acceptance tests.
