# Pruebas de punta a punta del panel nuevo

El panel corre en Chromium (Playwright) contra un **PostgREST real** conectado a un PostgreSQL local con:

1. `db/00-supabase-local.sql`: lo mínimo de Supabase que usa la estructura (roles de la API, `auth.uid()`, `auth.users`, `storage`).
2. Todas las migraciones de `supabase/migrations`, en orden: la misma estructura y los mismos permisos que producción.
3. `db/seed.sql`: datos inventados (camiones, viajes en ruta, detenidos y sin señal, papeles y services por vencer).

`server.mjs` sirve el panel y reemplaza el ingreso de Supabase. El reloj del navegador queda fijo en el instante base de los datos (15/10/2026 al mediodía en Uruguay), así que el resultado es el mismo a cualquier hora. Los mapas no se descargan de OpenStreetMap durante las pruebas.

`db/permissions.sql` revisa la seguridad por filas con los mismos datos: un chofer ve solo lo suyo, la administración ve toda la flota y sin ingresar no se ve nada.

Para correrlas en una computadora:
```bash
# PostgreSQL 16 o 17 con un superusuario en PGHOST/PGPORT/PGUSER, y PostgREST 12 en el puerto 3301 con:
#   db-uri = "postgres://authenticator@<host>:<puerto>/panel_e2e"   db-schemas = "public"   db-anon-role = "anon"
#   jwt-secret = "local-test-secret-for-trf-panel-0123456789"
bash tests/e2e/db/reset.sh
psql -d panel_e2e -f tests/e2e/db/permissions.sql
npx playwright install chromium
npm run e2e        # capturas en tests/e2e/shots
```
