# Pruebas de punta a punta del panel nuevo

El panel corre en Chromium (Playwright) contra un **PostgREST real** conectado a un PostgreSQL local con:

1. `db/00-supabase-local.sql`: lo mínimo de Supabase que usa la estructura (roles de la API, `auth.uid()`, `auth.users`, `storage`).
2. Todas las migraciones de `supabase/migrations`, en orden: la misma estructura y los mismos permisos que producción. La 0006 carga los peajes y las balanzas del MTOP y la 0007 sus radares, así que el mapa de GPS los muestra como en producción.
3. `db/seed.sql`: datos inventados (camiones, viajes en ruta, detenidos y sin señal, viajes completados en el panel, uno cargado a mano y uno en la papelera, remitos y combustible, papeles y services por vencer). En mantenimiento: services vencidos, próximos por fecha y por kilómetros (el Ford tiene unos 412.095 km estimados y su cambio de aceite cada 10.000 km toca a los 412.500), hechos con su kilometraje y uno sin kilómetros para comparar. En documentación: papeles de camiones y de choferes, vencidos, por vencer, vigentes y sin fecha, uno con foto, otro con PDF y otro de un chofer que Ana no puede ver. En combustible: tres estaciones en la lista del catálogo, boletas de un viaje y sin viaje, una con la estación escrita de otra manera, una en dólares, una en una estación escrita a mano, una anterior al saldo inicial y una en la papelera, más un saldo inicial y dos pagos). En flota: la ficha del Volvo con su foto y su semirremolque desde marzo de 2025, el acoplado que llevó antes y se vendió, y un cisterna libre. En gastos: los de octubre (una reparación del Volvo con su factura, el seguro en dólares, los peajes en efectivo del viaje de Diego, viáticos de Bruno, el lavado del semirremolque y una multa anulada) y los del mes anterior (las cubiertas del Ford, como costo de su service, y la patente del Mercedes). En cobros: el saldo inicial y un cobro con cheque del Molino San José, un cobro en dólares de la Cooperativa Agraria y una transferencia anulada de Navios; Navios tiene su viaje en ruta, todavía sin importe, y Cliente Uno, de la lista de la app, no tiene viajes.

`server.mjs` sirve el panel y reemplaza el ingreso de Supabase, los enlaces firmados de las fotos (devuelve una imagen de prueba, y solo a las cuentas del panel) la subida de fotos de boletas (solo JPEG, en la carpeta propia y sin viaje, como la regla del almacenamiento) la subida y el borrado de los archivos de los papeles (foto o PDF, en la carpeta del papel, solo las cuentas del panel) la subida de las fotos de camiones y acoplados (solo JPEG, en la carpeta de la ficha, solo las cuentas del panel) y la de las facturas de los gastos (foto o PDF, solo las cuentas del panel, sin borrar ninguna). El reloj del navegador queda fijo en el instante base de los datos (15/10/2026 al mediodía en Uruguay), así que el resultado es el mismo a cualquier hora. Los mapas no se descargan de OpenStreetMap durante las pruebas.

`db/permissions.sql` revisa la seguridad por filas con los mismos datos: un chofer ve solo lo suyo, la administración ve toda la flota, un administrador que no está en la lista del panel no lee los datos del panel y sin ingresar no se ve nada. También revisa lo que se guarda en `trf_panel_trips`: solo las cuentas del panel completan, cargan y mandan a la papelera; la base anota quién y cuándo, no deja cambiar el origen de una fila, un guardado con una fecha de modificación vieja no cambia nada y borrar no borra. Y el aviso de «chofer activo» (`trf_driver_presence`): cada chofer escribe solo el suyo, la hora la pone el servidor, las cuentas de la flota lo leen y sin ingresar no se lee. Y el combustible: el chofer ve solo sus boletas y no las corrige; las cuentas del panel cargan boletas solo a su nombre, las corrigen sin poder cambiar lo declarado, las mandan a la papelera y nunca las borran; los pagos y saldos de las estaciones los leen y escriben solo ellas, con un saldo inicial por estación y moneda, sin pagos de cero ni sin forma de pago, y sin borrar; un administrador completo conserva su permiso sobre las boletas pero no ve las cuentas, y sin ingresar no se ve nada. Y mantenimiento y documentación: las cuentas del panel cargan, cambian y borran services y papeles de cualquiera y la base anota quién; un service no puede repetirse cada 0 km ni vencer a kilómetros negativos; el archivo de un papel tiene que estar en la carpeta de ese papel y ser foto o PDF; los archivos los suben y borran las cuentas que administran la flota, un chofer ve el de sus papeles y los de los camiones pero no los de otro chofer, y sin ingresar no se ve ninguno; las fotos de remitos y boletas no se borran.

Las pruebas corren con «reducir movimiento», así los mapas no animan y los camiones saltan a cada posición nueva. `movimiento.spec.ts` lo permite (solo en la computadora: en el celular el código del mapa es el mismo) y comprueba dos cosas. En GPS en vivo, un camión que avanza 2,5 km se desliza por las posiciones intermedias y la línea del recorrido llega hasta él. En la página de un viaje en curso, el camión recorre la lectura nueva.

`mapa.spec.ts` revisa la pantalla completa de los mapas de GPS y de un viaje, y el mapa de Google: las calles, el satélite y el tráfico, también en Inicio y de noche. Las respuestas de Google (las sesiones, los créditos y las imágenes) las da un reemplazo dentro del navegador (`googleStandIn` de `helpers.ts`, que usan todas las pruebas), así que ningún pedido sale de la computadora, y el panel de las pruebas se arma con una clave inventada (`.env.e2e`). Comprueba el logo de Google Maps y su tamaño, los créditos como texto con el enlace a los términos, qué pide cada sesión, que la elección quede guardada, y que el mapa pase a OpenStreetMap, con un aviso, cuando Google no responde o deja de dar las imágenes.

`mantenimiento.spec.ts` revisa los kilómetros estimados de cada camión, los services por fecha y por kilómetros y sus filtros (volver atrás trae de nuevo la búsqueda), y que sin un service hecho con sus kilómetros actualizar no lea los viajes; `documentacion.spec.ts`, los papeles agrupados por camión y chofer, su estado, la foto, el PDF y los filtros, y que los avisos de Inicio lleven a su sección. `metricas.spec.ts` revisa los números del mes por camión y por chofer (las mismas cuentas que «Rendimiento» en la app: sin los viajes de la papelera, pesos y dólares por separado, cada boleta en su fecha), los gráficos con sus valores al pasar el mouse y con el teclado, el consumo contra el promedio de la flota, la tabla que se ordena y lleva a los viajes del camión, los camiones sin movimientos de otro mes, lo facturado de los últimos 12 meses y los archivos de Excel y PDF.

`combustible.spec.ts` revisa las estaciones con lo cargado y su cuenta, la lista de boletas con sus filtros, la foto y la papelera, y el estado de cuenta en pesos y en dólares.

`choferes.spec.ts` revisa la lista de choferes: las fichas con los viajes y kilómetros del mes, los papeles y cómo va el sueldo del mes, lo que falta pagar, los choferes de la app sin ficha y los que ya no trabajan. También la ficha de un chofer, con sus datos, la libreta, la actividad, los papeles y el sueldo mes a mes con cada pago. `db/drivers.sql` revisa en la base fichas, sueldos y pagos:
- solo las cuentas del panel los leen y los cargan, y se corrigen sin cambiar de chofer ni de autor;
- se anulan sin borrar y nadie los borra;
- un sueldo por mes de inicio, el mes empieza el 1, sin importes en cero ni otras monedas o conceptos, y una ficha por cuenta de la app;
- cada cambio queda en el historial privado con quién lo hizo;
- ningún chofer, ni el de la ficha, ve ni cambia nada, y sin ingresar no se ve nada.

`flota.spec.ts` revisa Flota:
- la lista de camiones del catálogo, primero los que tienen algo para atender, con su acoplado, el tanque, los kilómetros, el service, los papeles y el mes;
- la foto del Volvo, los acoplados y los de baja;
- la ficha del camión, con sus datos, su acoplado y los anteriores, cómo está, el mes, los services, los papeles y quién lo manejó cada mes;
- la ficha del acoplado, un camión sin ficha y los acoplados entre los vehículos de Documentación;
- que si no se puede leer el último viaje de cada camión, lo dice en vez de darlo por sabido;
- que sin los kilómetros de los viajes los services siguen avisando por su fecha;
- que si las fichas o los papeles dejan de responder después de leerse, la lista y las fichas avisan que se ve lo último que se leyó.

`db/fleet.sql` revisa en la base las fichas y los enganches:
- solo las cuentas del panel los leen y los cargan, y nadie los borra;
- una ficha sigue siendo de su clase, y la de un camión, de su camión;
- la clave de un acoplado es su matrícula, hay una ficha por clave, y dos fichas no tienen la misma matrícula, aunque esté escrita de otra manera;
- los controles de año, capacidad, foto y baja;
- el cambio de acoplado en un solo paso, que no guarda nada si otra persona lo cambió y que un pedido repetido no duplica;
- los días de un camión o de un acoplado no se pisan, también en una corrección que intenta cambiarle el camión, y un enganche se anula sin borrarlo;
- la baja de un acoplado o de un camión enganchado lo desengancha el día anterior, tiene que ser posterior al enganche, y lo dado de baja no se engancha; corregir el día de la baja mueve el final de ese enganche, sin pisar otro ni pasar la baja del otro vehículo;
- corregir la baja no alarga un enganche que terminó por otra razón (desenganchado a mano, o por un cambio de acoplado), y nada sigue desde el día de la baja: un enganche que pasaría de ese día termina el anterior, y no se guarda uno que siga después;
- solo la baja anota qué enganche cerró, y cambiarle el último día a mano lo borra;
- las fotos las suben y las ven solo las cuentas del panel, y nadie las borra;
- cada cambio queda en el historial privado.

`db/expenses.sql` revisa en la base los gastos:
- solo las cuentas del panel los leen, los cargan y los corrigen, y nadie los borra; un chofer no ve ni cambia ninguno;
- la base anota quién y cuándo, y una corrección no cambia quién lo cargó ni de qué service es el costo;
- los controles de importe, moneda, medio de pago, día, tipo y proveedor;
- cada gasto va a una sola cosa (la empresa, un camión, un acoplado, un chofer o un viaje) con su clave, y el de un acoplado, con la ficha de un acoplado;
- un service tiene un solo costo que cuenta: el mal cargado se anula y se carga de nuevo, y el anulado no vuelve sobre el correcto;
- la factura va en la carpeta de su gasto y es foto o PDF; la suben y la ven solo las cuentas del panel, y nadie la borra;
- cada cambio queda en el historial privado.

`db/clients.sql` revisa en la base los cobros y los saldos iniciales de los clientes:
- solo las cuentas del panel los leen, los registran y los corrigen, y nadie los borra; un chofer y un administrador fuera de la lista del panel no ven ni cambian ninguno, y sin ingresar no se ve nada;
- la base anota quién y cuándo, y una corrección puede cambiar el cliente, el día y el importe, pero no el tipo ni quién lo registró;
- los controles de importe (sin cobros de cero, negativos ni imposibles), moneda, forma de cobro, día, clave y nombre del cliente y nota;
- un saldo inicial por cliente y moneda, también a favor del cliente o en cero: el mal cargado se anula y se carga de nuevo, y el anulado no vuelve sobre el correcto;
- cada cambio queda en el historial privado.

`cobros.spec.ts` revisa Cobros, en Gastos y finanzas:
- lo que deben los clientes, lo facturado y lo cobrado en el período, en pesos y en dólares por separado, y los viajes sin importe;
- los clientes con su saldo, primero los de actividad más reciente, y la búsqueda escrita de cualquier manera;
- el estado de cuenta de un cliente desde su saldo inicial, con el saldo de cada renglón, el viaje que lleva a su página y la página del viaje que vuelve a la cuenta;
- el viaje en ruta todavía sin importe, que no suma ni se pide completar;
- los cobros del período, su búsqueda, los anulados aparte, y el mes anterior;
- el buscador de arriba, que lleva a los clientes;
- que si no se pueden leer los cobros, lo dice y se puede reintentar.

`finanzas.spec.ts` revisa Gastos y finanzas:
- los gastos del mes, de cada uno con a qué fue, con lo gastado en pesos y en dólares por separado, lo que más pesó, lo de los camiones y acoplados y los que no tienen factura, y la foto de la factura;
- los filtros (período, tipo, a qué va y búsqueda), que quedan en la dirección, la suma por tipo y por a qué fue cada gasto, que llevan a sus gastos, y la multa anulada, aparte y sin contar;
- el costo de cada service hecho en Mantenimiento, los gastos de un viaje en su página y «Ver sus gastos» de un camión, un acoplado y un chofer;
- que si no se pueden leer los gastos, lo dice y se puede reintentar.

`barra.spec.ts` revisa la barra de arriba y el menú de íconos del diseño del 26/10/2026:
- el buscador:
  - vacío ofrece las doce secciones;
  - una matrícula escrita con un espacio encuentra el camión, y Enter abre su ficha;
  - encuentra un chofer escrito sin tilde y un acoplado de baja;
  - con las flechas lleva a buscar el texto en Viajes, en los últimos 90 días;
  - Esc primero borra el texto y después lo cierra;
  - si no se pueden leer los choferes, lo dice en vez de «No hay…», los camiones se siguen encontrando y «Reintentar» trae al chofer;
- la campana, desde Viajes: cuenta los mismos seis avisos de Inicio, Esc la cierra y vuelve a ella, y cada aviso lleva a su sección;
- la cuenta: las iniciales, el tema oscuro (queda guardado al recargar) y volver al de la computadora;
- el menú de íconos: el nombre aparece al pasar el mouse, y marca la sección abierta.

`tanques.spec.ts` revisa el tanque de cada camión en Combustible: el Ford con poco combustible (primero, y avisado en Combustible y en Inicio), el Volvo desde la carga que lo llenó en el viaje de Ana, el Iveco que espera saber cuánto tiene y los camiones sin tanque. Si los tanques dejan de responder, Inicio y la campana siguen avisando del Ford y dicen que es de la última lectura. `db/tanks.sql` revisa en la base la marca «Tanque lleno» y el tanque de cada camión: el chofer la declara en su boleta y no ve los tanques; las cuentas del panel la corrigen en `panel_data` sin tocar lo declarado y cargan los tanques sin borrarlos; los administradores completos conservan su permiso sobre lo declarado, y sin ingresar no se ve nada.

Las pruebas que guardan están en `edicion.spec.ts`, `edicion-choferes.spec.ts`, `edicion-cobros.spec.ts`, `edicion-combustible.spec.ts`, `edicion-documentos.spec.ts`, `edicion-finanzas.spec.ts`, `edicion-flota.spec.ts`, `edicion-mantenimiento.spec.ts`, `edicion-ruta.spec.ts` y `edicion-tanques.spec.ts`, y corren al final (proyecto *edicion*), cuando las demás ya leyeron los datos como los deja `seed.sql`. En viajes: completar un viaje de la app, cargar uno a mano, la papelera y restaurar, dos pestañas que guardan el mismo viaje a la vez y el formulario en el celular. En choferes: la ficha de un chofer de la app, su sueldo, un adelanto que se corrige y se anula, un viático que va aparte, una ficha de alguien que ya no trabaja, dos pestañas que cambian la misma ficha, y un cambio de ficha y una anulación de pago cuya respuesta se corta (el reintento los da por hechos). En combustible: una boleta nueva con foto (una foto de verdad, armada por el navegador), corregir una boleta, la papelera y restaurar, registrar y anular un pago, corregir el saldo inicial, y dos pestañas que corrigen la misma boleta a la vez. En documentación: un papel de un camión con foto, uno de un chofer con PDF (un archivo que no es PDF no se acepta), quitar el archivo de un papel, borrar un papel con el suyo, dos pestañas que cambian el mismo papel (el archivo nuevo del guardado rechazado se borra) y un cambio de archivo cuya respuesta se corta (el reintento lo da por guardado, deja el archivo nuevo y borra el que reemplazó), el alta de un papel cuya respuesta se corta antes de cambiarle el archivo (el papel queda con el primero y el segundo se borra) y un borrado cuya respuesta se corta (lo da por borrado y su archivo también se borra). En mantenimiento: marcar como hecho un service que se repite (se agenda el próximo y cambia el kilometraje del camión), lo mismo cuando se corta la respuesta al marcarlo o al agendar el próximo (el próximo queda una sola vez), uno nuevo con un tipo escrito a mano, borrar uno, dos pestañas que cambian el mismo service y dos que lo marcan como hecho a la vez (el próximo queda una sola vez). En tanques: el tanque de un camión en km por litro (30 km por litro no se acepta) y medido lleno, una carga marcada «Tanque lleno» al corregir su boleta, que arranca el tanque desde lleno, y una boleta nueva con el tanque lleno y la hora de la carga, que cuenta los viajes hechos desde esa hora (una hora posterior a ahora no se acepta).

En flota:
- la ficha de un camión con su foto;
- el cisterna enganchado y anulado, y un cambio de acoplado desde el mismo día que no se acepta;
- el semirremolque que pasa del Volvo al Scania y queda en el historial del Volvo;
- un acoplado nuevo, que no acepta la matrícula de un camión, enganchado al Iveco y dado de baja: no acepta una baja del mismo día del enganche, al guardarla deja de ir en el Iveco, y corregir el día de la baja mueve el final de ese enganche;
- dos pestañas que cambian la misma ficha;
- una ficha y un enganche cuya respuesta se corta: el reintento los da por guardados una sola vez, y si el enganche se reintenta con otro día, avisa que quedó el del primer intento.

En gastos:
- un gasto de un camión con la foto de su factura (una foto de verdad, armada por el navegador), que se corrige sin perder la factura, se anula y se restaura;
- un tipo escrito a mano, de la empresa, con un PDF (un archivo que no es PDF no se acepta), que después se ofrece en el filtro;
- el costo de un service hecho anotado desde Mantenimiento, con su camión, su día y su tipo, que no se acepta dos veces aunque lo anoten dos pestañas, y que se corrige desde ahí;
- un gasto de un viaje desde su página, que queda de ese viaje al corregirlo;
- un gasto cuya respuesta se corta: el reintento lo da por anotado una sola vez;
- dos pestañas que corrigen el mismo gasto.

En cobros:
- un cobro registrado desde la página de un cliente, que baja su saldo;
- el saldo inicial corregido desde su renglón, y uno segundo en la misma moneda que no se acepta;
- un cobro anulado, que deja de contar, y restaurado desde «Anulados»;
- el cobro de un cliente escrito a mano, que aparece como cliente nuevo, y que al corregirlo con el nombre de otro escrito de otra manera pasa a su cuenta;
- el cobro anulado de un cliente que no tiene nada más, que en «Anulados» no lleva a una cuenta que ya no existe, y que restaurado la vuelve a tener;
- un cobro cuya respuesta se corta: el reintento lo da por registrado una sola vez;
- dos pestañas que corrigen el mismo cobro.

Para correrlas en una computadora:
```bash
# PostgreSQL 16 o 17 con un superusuario en PGHOST/PGPORT/PGUSER, y PostgREST 12 en el puerto 3301 con:
#   db-uri = "postgres://authenticator@<host>:<puerto>/panel_e2e"   db-schemas = "public"   db-anon-role = "anon"
#   jwt-secret = "local-test-secret-for-trf-panel-0123456789"
bash tests/e2e/db/reset.sh
psql -d panel_e2e -f tests/e2e/db/permissions.sql
psql -d panel_e2e -f tests/e2e/db/road.sql
psql -d panel_e2e -f tests/e2e/db/drivers.sql
psql -d panel_e2e -f tests/e2e/db/tanks.sql
psql -d panel_e2e -f tests/e2e/db/fleet.sql
psql -d panel_e2e -f tests/e2e/db/expenses.sql
psql -d panel_e2e -f tests/e2e/db/clients.sql
npx playwright install chromium
npm run e2e        # capturas en tests/e2e/shots; las descargas de Viajes se revisan por dentro
```
