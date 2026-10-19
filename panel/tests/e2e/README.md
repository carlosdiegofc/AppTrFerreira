# Pruebas de punta a punta del panel nuevo

El panel corre en Chromium (Playwright) contra un **PostgREST real** conectado a un PostgreSQL local con:

1. `db/00-supabase-local.sql`: lo mínimo de Supabase que usa la estructura (roles de la API, `auth.uid()`, `auth.users`, `storage`).
2. Todas las migraciones de `supabase/migrations`, en orden: la misma estructura y los mismos permisos que producción.
3. `db/seed.sql`: datos inventados (camiones, viajes en ruta, detenidos y sin señal, viajes completados en el panel, uno cargado a mano y uno en la papelera, remitos y combustible, papeles y services por vencer).

`server.mjs` sirve el panel y reemplaza el ingreso de Supabase y los enlaces firmados de las fotos (devuelve una imagen de prueba, y solo a las cuentas del panel). El reloj del navegador queda fijo en el instante base de los datos (15/10/2026 al mediodía en Uruguay), así que el resultado es el mismo a cualquier hora. Los mapas no se descargan de OpenStreetMap durante las pruebas.

`db/permissions.sql` revisa la seguridad por filas con los mismos datos: un chofer ve solo lo suyo, la administración ve toda la flota, un administrador que no está en la lista del panel no lee los datos del panel y sin ingresar no se ve nada. También revisa lo que se guarda en `trf_panel_trips`: solo las cuentas del panel completan, cargan y mandan a la papelera; la base anota quién y cuándo, no deja cambiar el origen de una fila, un guardado con una fecha de modificación vieja no cambia nada y borrar no borra. Y el aviso de «chofer activo» (`trf_driver_presence`): cada chofer escribe solo el suyo, la hora la pone el servidor, las cuentas de la flota lo leen y sin ingresar no se lee.

Las pruebas corren con «reducir movimiento», así los mapas no animan y los camiones saltan a cada posición nueva. `movimiento.spec.ts` lo permite (solo en la computadora: en el celular el código del mapa es el mismo) y comprueba dos cosas. En GPS en vivo, un camión que avanza 2,5 km se desliza por las posiciones intermedias y la línea del recorrido llega hasta él. En la página de un viaje en curso, el camión recorre la lectura nueva.

Las pruebas que guardan están en `edicion.spec.ts` y corren al final (proyecto *edicion*), cuando las demás ya leyeron los datos como los deja `seed.sql`: completar un viaje de la app, cargar uno a mano, la papelera y restaurar, dos pestañas que guardan el mismo viaje a la vez y el formulario en el celular.

Para correrlas en una computadora:
```bash
# PostgreSQL 16 o 17 con un superusuario en PGHOST/PGPORT/PGUSER, y PostgREST 12 en el puerto 3301 con:
#   db-uri = "postgres://authenticator@<host>:<puerto>/panel_e2e"   db-schemas = "public"   db-anon-role = "anon"
#   jwt-secret = "local-test-secret-for-trf-panel-0123456789"
bash tests/e2e/db/reset.sh
psql -d panel_e2e -f tests/e2e/db/permissions.sql
npx playwright install chromium
npm run e2e        # capturas en tests/e2e/shots; las descargas de Viajes se revisan por dentro
```
