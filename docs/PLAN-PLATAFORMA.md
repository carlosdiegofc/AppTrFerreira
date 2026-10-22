# Plataforma Transportes Ferreira: plan de trabajo

Rumbo aprobado el 16/10/2026: convertir la app y el panel actuales en un sistema multiempresa, completo y listo para vender, avanzando por etapas. Cada etapa se presenta, se aprueba y recién entonces se programa. Este archivo es la referencia de todas las sesiones de trabajo: se actualiza cuando una etapa avanza o se toma una decisión.

El diagnóstico completo, el esquema de la base (unas 50 tablas), las funciones del servidor, los costos de la IA y la lista de decisiones están en el documento «Transportes Ferreira — Diagnóstico, arquitectura y plan» (privado): https://claude.ai/artifact/TVnReY2uHwYJnPNuaKKCDq

## Reglas
1. No se borra ni se sobrescribe nada que ya funcione sin autorización y sin un respaldo previo.
2. La base cambia solo con migraciones aditivas: tablas y columnas nuevas. Las tablas `trf_*` siguen funcionando mientras la app y el panel las usen; quitarlas o renombrarlas es un paso aparte, con respaldo y aprobación.
3. Cada migración es un archivo numerado en `supabase/migrations/`. Se prueba primero en una base local (CI) y en el entorno de pruebas, y recién después se aplica en producción, con un respaldo completo descargado justo antes.
4. Los permisos y los límites de cada plan se controlan en la base (RLS y triggers), no solo en las pantallas.
5. Lo medido (GPS, odómetro), lo declarado (chofer, oficina) y lo estimado (cálculos) se guardan por separado, y las pantallas dicen siempre cuál es cuál.
6. Cada versión de la app tiene que funcionar con la base vigente: los choferes no actualizan todos el mismo día. El acuerdo entre la app y el panel está en [APP-WEB-CONTRACT.md](APP-WEB-CONTRACT.md).
7. El repositorio es público: nunca llaves, contraseñas, datos de clientes ni volcados de la base.

## Arquitectura
- **Supabase como núcleo:** Postgres con RLS por empresa, Auth, Storage, Realtime y funciones del servidor (Edge Functions, TypeScript) para todo lo que necesita claves secretas: WhatsApp, IA, lectura de boletas, pagos, exportaciones y licencias.
- **Multiempresa:** cada fila de negocio lleva `empresa_id`, y `usuarios_empresa` asigna el rol de cada persona en cada empresa (dueño, administrador, operador de tráfico, contable, taller, chofer, solo lectura). El superadministrador de la plataforma va aparte.
- **Auditoría y papelera:** un trigger registra quién cambió qué y cuándo; borrar manda a la papelera, nunca elimina.
- **Panel web nuevo** en React + TypeScript, sección por sección. El panel actual (`web/`) sigue en uso hasta que cada sección tenga reemplazo.
- **App Android:** sigue en Kotlin; pasa de a poco a una base local Room y a módulos, sin cambiar lo que ve el chofer salvo cuando se decida.
- **Mapas y rutas:** proveedor comercial; los servidores públicos de OpenStreetMap y OSRM no admiten uso comercial.

## Etapas
| # | Etapa | Estado |
|---|---|---|
| 0 | Preparación | En curso |
| 1 | Multiempresa, roles y auditoría | Pendiente |
| 2 | Flota (fichas con foto, acoplados y su historial) y choferes | Pendiente |
| 3 | Viajes y métricas: estados, tramos con carga y vacíos, medido/declarado/estimado, exportar a PDF, Excel y Word | Pendiente |
| 4 | Combustible con lectura automática de la boleta y control de litros × precio | Pendiente |
| 5 | Mantenimiento preventivo y correctivo con avisos por km y por fecha; documentación con archivos y vencimientos | Pendiente |
| 6 | GPS en tiempo real | Pendiente |
| 7 | Gastos, finanzas y simulador de fletes | Pendiente |
| 8 | Asistente IA por WhatsApp: primero solo consultas, con audios y registro de costos | Pendiente |
| 9 | Planes FREE (US$ 0) y PRO (US$ 13 por mes), pagos y panel comercial | Pendiente |
| 10 | Licencia permanente (US$ 1.300) | Pendiente |

En la etapa 1, Transportes Ferreira pasa a ser la empresa 1: sus datos se copian a las tablas nuevas y se mantienen sincronizados, sin modificar las tablas actuales.

### Etapa 0: preparación
- [x] Código unificado: la rama `claude/apptrferreira-g1agmt` tiene la app v0.16.2 (con el modo sencillo). `main` sigue en una versión anterior; pasarla a `main` espera aprobación.
- [x] Plan escrito en el repositorio (este archivo).
- [x] Acceso a la base desde las herramientas de desarrollo. Del 14/10 al 18/10 estuvo en reposo por falta de uso y rechazaba las conexiones; volvió al usar la app.
- [x] Respaldo completo de la base actual (estructura y datos), entregado al dueño fuera del repositorio: 18/10/2026, 01:47 UTC. Se restauró en una base local vacía con las mismas cantidades de filas y los mismos permisos.
- [x] Estructura actual de la base como migración inicial [`supabase/migrations/0000_base_actual.sql`](../supabase/migrations/0000_base_actual.sql): tablas, funciones, políticas, permisos y buckets, sin datos.
- [ ] Entorno de pruebas con la misma estructura y datos de ejemplo.
- [x] CI que aplica las migraciones a una base local y corre las pruebas de permisos: workflow *Probar panel nuevo y base*, con PostgreSQL 17 como Supabase, [`panel/tests/e2e/db/permissions.sql`](../panel/tests/e2e/db/permissions.sql) y las pruebas del panel nuevo en el navegador.

### Panel web nuevo (`panel/`)
Va armándose al costado del panel actual y lo reemplaza sección por sección.
1. [x] Base: React + TypeScript, ingreso con las cuentas de la app (solo la lista de administradores del panel, como el panel actual), menú con las 12 secciones, diseño de la app con modo oscuro, celular y computadora, pruebas automáticas (18/10/2026).
2. [x] Inicio y GPS en vivo, con las mismas reglas de estado y de vencimientos que la app (18/10/2026).
3. Viajes, en dos partes (aprobado el 18/10/2026):
   - 3a. [x] Consultar: lista con período, búsqueda, filtros por camión y chofer y pestañas por estado (pendientes de completar, en curso, completos, eliminados); detalle con formato de orden de carga, recorrido GPS, remitos y combustible con sus fotos; exportación a Excel, PDF y Word. Sin cambios en la base (18/10/2026).
   - 3b. [x] Editar: completar los datos para facturar, cargar viajes a mano, papelera y restaurar, con aviso si dos personas guardan el mismo viaje a la vez (no se pisa nada). Migración [`0001_panel_trips_edicion.sql`](../supabase/migrations/0001_panel_trips_edicion.sql): guardan las cuentas del panel, la base anota quién y cuándo y no se borra nada; con ella vuelve a andar también el guardado del panel actual. Aplicada en producción el 18/10/2026 a las 20:05 (Uruguay), con un respaldo completo tomado a las 20:01 y probado en una base local. El chofer edita sus viajes desde la app en una próxima versión; buscar lugares en el mapa espera al proveedor de mapas (18/10/2026).
4. Combustible, Mantenimiento y Documentación con lo que ya carga la app:
   - 4a. [x] Combustible (aprobado el 19/10/2026). Migración [`0003_combustible.sql`](../supabase/migrations/0003_combustible.sql) aplicada en producción el 19/10/2026 a las 17:38 (Uruguay). El respaldo completo se tomó a las 17:23, se probó en una base local y se entregó; entre el respaldo y la migración no cambió ningún dato. La app 0.17.1 se sube a Google Play cuando lo decidas:
     - Las boletas, de un viaje o sin viaje, agrupadas por estación, con los montos sumados en pesos y en dólares por separado.
     - Cuenta corriente de cada estación: saldo inicial con fecha, más las cargas desde ese día, menos los pagos. Tiene su estado de cuenta.
     - Desde el panel se cargan boletas nuevas, con foto o a mano, a nombre de quien las carga y sin viaje. También se corrigen, se mandan a la papelera y se registran los pagos y los saldos iniciales.
     - Migración `0003`, que solo agrega: una tabla para los pagos y saldos iniciales de cada estación y el permiso para que las cuentas del panel corrijan boletas sin tocar lo que declaró el chofer.
     - En la app 0.17.1, cargar combustible sin viaje o en el viaje también desde el modo sencillo.
   - 4b. [x] Mantenimiento y Documentación (aprobado el 20/10/2026). Migración [`0004_mantenimiento_documentos.sql`](../supabase/migrations/0004_mantenimiento_documentos.sql), que solo agrega, aplicada en producción el 20/10/2026 a las 18:49 (Uruguay). El respaldo completo se tomó a las 18:40, se probó en una base local y se entregó; entre el respaldo y la migración no cambió ningún dato. La app 0.17.2 se sube a Google Play cuando lo decidas:
     - Los services de cada camión, con avisos por fecha (15 días antes) y por kilómetros (1.000 km antes). Un service puede repetirse «cada N km»: al marcarlo como hecho con el kilometraje de ese día, se agenda solo el próximo.
     - Los kilómetros de cada camión son estimados: el kilometraje anotado en el último service hecho, más los kilómetros del GPS de los viajes con la app desde ese día. El panel dice que son estimados (regla 5).
     - Los papeles de camiones y choferes, con su vencimiento (30 días antes) y su archivo: foto o PDF, en una carpeta privada. La app los va a mostrar en una versión próxima.
     - Desde el panel se cargan, se cambian y se borran services y papeles. Borrar los borra para siempre, como en la app, preguntando antes; la base anota quién guardó cada uno por última vez.
     - En la app 0.17.2 el autocompletado del teléfono ya no llena los formularios, y los services muestran sus kilómetros («a los 412.500 km», «cada 10.000 km»).
5. [x] Métricas (aprobado el 21/10/2026): el rendimiento de cada camión y de cada chofer en un período, con las mismas cuentas que «Rendimiento» en la app. Sin cambios en la base. La app 0.17.3 se sube a Google Play cuando lo decidas:
   - Viajes, kilómetros del GPS con carga y sin carga (medido), kilómetros facturables, kilos, lo facturado, y los litros y el gasto de las boletas (declarado), y el consumo en litros cada 100 km, con 300 km o más (estimado). La pantalla dice cuál es cuál (regla 5).
   - Gráficos: kilómetros por camión y por día, consumo contra el promedio de la flota y lo facturado en los últimos 12 meses. La tabla se ordena, lleva a los viajes de cada camión o chofer y se exporta a Excel y PDF.
   - Cada boleta cuenta en su fecha (la corregida en el panel, si la hay), también en «Rendimiento» de la app desde la 0.17.3. El panel actual sigue contándolas el día en que llegaron a la base, hasta que Métricas lo reemplace.
6. [x] Publicarlo: el código pasa a `main` y el panel nuevo queda en `/nuevo/` de la dirección del panel actual (18/10/2026).
7. [x] GPS en vivo más rápido (aprobado el 18/10/2026, adelanta parte de la etapa 6): posición cada 3 segundos y recorrido cada 5, con la app 0.17.0 mandando un punto cada 2 segundos. La 0.17.0 se sube a Google Play cuando lo decidas (18/10/2026).
8. [x] «Chofer activo» (aprobado el 18/10/2026): GPS en vivo y la «Flota en vivo» de la app dicen qué choferes tienen la app abierta, con qué versión y, si no viajan, dónde está el teléfono. Migración [`0002_chofer_activo.sql`](../supabase/migrations/0002_chofer_activo.sql), una tabla nueva: aplicada en producción el 19/10/2026 a las 08:20 (Uruguay). El respaldo completo se tomó a la 01:22, se probó en una base local y se entregó; entre el respaldo y la migración no cambió ningún dato. Avisan los teléfonos con la app 0.17.0 o posterior (19/10/2026).

### App: juegos para las esperas
Para pasar el rato mientras se espera la carga (aprobado el 21/10/2026). Se juega con el camión parado, y los juegos los ven todas las cuentas.
1. [x] Ajedrez, en la app 0.18.0, que se sube a Google Play cuando lo decidas:
   - Contra el teléfono, en tres niveles, o entre dos personas pasándose el teléfono. Tiene todas las reglas, deshacer y girar el tablero. Las piezas son dibujos propios de la app.
   - Se abre sin viaje, con el viaje pausado o con el camión detenido según el GPS: una lectura de los últimos 2 minutos, a menos de 5 km/h. Si el camión arranca, la partida se guarda y se cierra.
   - La partida queda solo en el teléfono: no va nada a la base ni al panel.
2. [ ] Truco uruguayo contra el teléfono: con flor, a 30 (malas y buenas).
3. [ ] Partidas en línea con los compañeros, con sus cuentas de la app:
   - Se elige de cuántos jugar: 1 contra 1, 2 contra 2 o 3 contra 3.
   - Por turnos. El servidor reparte y guarda las cartas, así nadie ve las de otro.
   - Necesita una migración, con su respaldo antes, y actualizar la política de privacidad y el formulario de datos de Google Play.
   - La misma regla del camión parado: si alguien arranca, la partida queda en pausa.

Hallazgos de la revisión de la base (18/10), para resolver en la etapa 1:
- El rol anónimo tiene todos los permisos de tabla en 8 tablas de la app y del panel (`trf_driver_*`, `trf_trip_*`, `trf_mobile_catalog`, `trf_panel_trips`), y también los de la secuencia que numera los puntos GPS. Es lo que Supabase da por defecto y la seguridad por filas lo frena, pero hay que quitarlos: solo `trf_rates` necesita lectura anónima.
- Conviven dos tipos de administrador: `trf_private.admin_emails` (administración completa, por correo) y `trf_panel_admins` (panel: lee toda la flota y también administra mantenimiento y documentos). Los datos que se completan en el panel (`trf_panel_trips`) los lee solo la segunda lista. Los dos pasan a ser roles por empresa.
- Las políticas que usan `trf_is_panel_admin()` sin `(select …)` se evalúan fila por fila; con más datos conviene envolverlas.
- `trf_panel_trips` solo tenía la política de lectura: las de alta y modificación de `web/sql/001_panel_web.sql` no estaban en producción, así que el panel actual no podía guardar los datos de un viaje ni mandarlo a la papelera. Resuelto el 18/10/2026 con la migración `0001` de la parte 3b de Viajes, según quién edita (ver decisiones).
- `trf_profiles`, `trf_requests` y `trf_rates` no las usan la app ni el panel: por su estructura son de un formulario de cotizaciones para clientes (presupuesto por kilómetro, pallet o tramo). Se conservan; falta confirmar quién las usa.

## Decisiones tomadas
- 21/10/2026: juegos para las esperas en la app.
  - Primero el ajedrez, después el truco uruguayo y después las partidas en línea con los compañeros.
  - Se juega con el camión parado: sin viaje, con el viaje pausado o detenido según el GPS. Si el camión arranca, la partida se guarda y se cierra.
  - Los juegos los ven todas las cuentas.
  - Ajedrez: contra el teléfono, con tres niveles, o entre dos en el mismo teléfono.
  - Truco: con flor y a 30 (malas y buenas).
  - En línea: se elige de cuántos jugar (1 contra 1, 2 contra 2 o 3 contra 3).
- 21/10/2026: Métricas.
  - Cada boleta de combustible cuenta en su fecha (la que corrigió la oficina, si la hay), como en Combustible. La app pasa a contar igual en «Rendimiento» con la 0.17.3; el panel actual queda como está hasta que Métricas lo reemplace.
  - Va con todo lo propuesto: totales, tabla por camión y por chofer, los cuatro gráficos y exportar a Excel y PDF.
- 20/10/2026: Mantenimiento y Documentación.
  - Borrar un service o un documento lo borra para siempre, como hace la app. Es la excepción a la papelera de la arquitectura: así lo decidió el dueño para estas dos secciones.
  - Los documentos llevan su archivo: una foto o un PDF, que se sube desde el panel a una carpeta privada. La app los muestra en una versión próxima.
  - Los services avisan también por kilómetros, con el kilometraje estimado: el último anotado en un service hecho más los kilómetros del GPS desde ese día. Se marcan como próximos 1.000 km antes.
  - Los 3 services que hay en la base, con el correo del dueño como tipo, son reales: los corrige el dueño desde el panel. El correo llegó por el autocompletado del teléfono, que la app 0.17.2 apaga en los formularios.
- 19/10/2026: Combustible.
  - Cada estación lleva una cuenta corriente: las cargas suman, los pagos restan y se puede cargar el saldo que ya existía, con su fecha. Las boletas anteriores a esa fecha quedan dentro del saldo.
  - Los pagos y los saldos iniciales se registran desde el panel.
  - Una boleta cargada desde el panel queda a nombre de quien la carga.
  - Las cuentas del panel (las mismas que guardan viajes) pueden cargar y corregir boletas.
  - Las estaciones salen de la lista del catálogo. Las escritas a mano se agrupan por nombre, sin importar mayúsculas, tildes ni espacios. Agregar estaciones a la lista queda para Configuración.
  - En la app, cargar combustible también desde el modo sencillo.
- 19/10/2026: la versión de Google Play se arma con R8 desde la 0.17.0: código optimizado y ofuscado, y sin los recursos que no se usan, como pide Play Console. Cada compilación la prueba en un emulador sin llegar a la base real; el viaje con GPS, las fotos y la sincronización se prueban en un teléfono antes de lanzarla. Lo que la app busque por nombre (clases, métodos, recursos) necesita su regla en `app/proguard-rules.pro`.
- 19/10/2026: el trazado del recorrido se corrige en la app 0.17.0. En cada giro guarda la lectura donde cambió el rumbo y la anterior, donde el camión dobló; también la de donde el camión para, y durante una parada solo lecturas buenas junto a ese lugar, así no se dibuja una «estrella» donde estuvo estacionado. Los viajes ya guardados quedan como están: no se limpian en el panel. Pegar el recorrido a las calles (map matching) queda para cuando se elija el proveedor de mapas.
- 18/10/2026: «chofer activo»: al ingresar y cada 5 minutos mientras la app está abierta, el teléfono avisa que el chofer está activo, con la versión de la app y, si no está de viaje, dónde está. Con la app cerrada no se sigue a nadie: no se vuelve a pedir la ubicación en segundo plano. Va en una tabla nueva, aparte de la posición del viaje en curso; conviene avisarles a los choferes.
- 18/10/2026: en los mapas en vivo (panel y «Flota en vivo» de la app) el camión que avanza se desliza de una posición a la siguiente, sin saltos, y la línea del recorrido lo acompaña. Salta directo si aparece a más de 3 km o si el equipo tiene pedido reducir el movimiento.
- 18/10/2026: el GPS en vivo va lo más rápido posible dentro del plan gratis. El panel lee la posición de cada camión cada 3 segundos y el recorrido cada 5; la app (versión nueva) toma un punto cada 2 segundos, manda la posición sola y primero, el historial en tandas, y su «Flota en vivo» se actualiza cada 5 segundos. Supabase Realtime queda para cuando haga falta el plan Pro: con varios camiones y pantallas abiertas se pasaría del límite gratis de mensajes.
- 18/10/2026: el viaje de un chofer lo pueden editar el propio chofer, el dueño y la administración. Se aplica con la parte 3b de Viajes, con una migración de permisos.
- 18/10/2026: la app 0.16.3 no se sube todavía a Google Play: se sube junto con un cambio más grande.
- 18/10/2026: el código de la rama de trabajo pasa a `main` (app 0.16.3 y panel nuevo) y el panel nuevo se publica en `/nuevo/`, al lado del actual.
- 18/10/2026: el panel nuevo se hace en React + TypeScript, en `panel/`, y el actual sigue funcionando hasta que el nuevo lo reemplace.
- 16/10/2026: Supabase sigue en el plan gratis, sin Pro. Como ese plan no tiene respaldos descargables, antes de cada migración se hace un respaldo manual completo (estructura y datos) y se le entrega al dueño, nunca en el repositorio. La base entra en reposo si pasa unos días sin uso y vuelve con el uso (la app, el panel) o desde el proyecto en supabase.com. Las ramas de prueba de Supabase quedan descartadas porque requieren Pro.

## Decisiones abiertas
Antes de tocar datos reales:
- Entorno de pruebas: un segundo proyecto gratis de Supabase.
- Rol de cada cuenta actual: dueños, choferes y la cuenta de revisión de Google, que iría a una empresa de demostración.

Más adelante: proveedor de mapas, método de lectura de boletas, modelo de IA y cupo por plan, transcripción de audios, medio de pago, facturación electrónica (CFE), monedas, nombre comercial, cuánto tiempo se guarda el GPS en el plan FREE y publicidad.

### Para presentar más adelante
- **Viajes de vinasa automáticos** (pedido del 19/10/2026; se presenta como etapa antes de programarla):
  - **El trabajo:** unos seis viajes por día con vinasa cargada en ALUR, cada uno a una chacra distinta. Se paga por rango de kilómetros: por ejemplo, todas las chacras que están entre 13 y 17 km tienen el mismo precio fijo, y hay varios rangos.
  - **La idea:** que los viajes se armen solos con el GPS, para que el chofer no tenga que cargar cada uno.
  - **Cómo funcionaría** (planteo del 19/10/2026):
    1. En ALUR, dentro de un radio configurable (al principio 150 m), el camión figura «En espera / cargando».
    2. Cuando sale de esa zona y sigue afuera, empieza un viaje.
    3. Si entra en una zona de descarga conocida y queda detenido unos 5 minutos, se anota una posible descarga.
    4. Cuando sale de la chacra, termina el viaje cargado y empieza el regreso vacío.
    5. Al volver a ALUR, figura otra vez «En espera / cargando». Si el viaje anterior quedó abierto, se propone cerrarlo y se marca que la descarga necesita revisión.
  - **Una parada sola no es una descarga:** cinco minutos detenido pueden ser una falla o una detención en la ruta. Se combinan el lugar, el tiempo detenido y el movimiento posterior.
  - **Chacras:** al principio el GPS propone los lugares de descarga. Desde la web se confirman como chacras, con su nombre, su zona y su distancia tarifaria. Esa distancia define el rango (por ejemplo, de 13 a 17 km), sin importar los desvíos del recorrido GPS. El importe es la tarifa del rango por los metros cúbicos transportados.
  - **Sin viajes falsos:** al principio los viajes automáticos quedan pendientes de revisión, se pueden editar y no se facturan solos. El chofer interviene solo cuando falta un dato o hay una excepción.
  - **A resolver al presentarla:**
    - El GPS hoy solo registra con un viaje iniciado y nunca sigue al chofer con la app cerrada fuera de un viaje. Para armar los viajes solos, el chofer iniciaría una sola vez por día una jornada que registre todo el día. Ese cambio en el uso de la ubicación lo tienen que decir la política de privacidad y Google Play.
    - De dónde salen los metros cúbicos de cada viaje: la capacidad de la cisterna o lo que declara el chofer.
    - La tabla de rangos con sus tarifas.

### GPS: control de ruta (autorizado 21/10/2026)
- [x] Código de las tres vistas y puntos editables, enlaces a mapas externos, cuenta de telepeaje individual y tarifas históricas.
- [x] Referencia de combustible, consumo editable, estimación y aviso visual de nivel bajo.
- [x] Migración aditiva con pasos GPS estimados y controles de acceso; pruebas fuera de producción.
- [x] Validación de navegador en computadora y celular (CI con datos inventados).
- [x] Publicación el 21/10/2026 con respaldo manual completo de estructura y datos, verificado y entregado localmente antes de aplicar 0005. Migración aplicada y despliegue #11 exitoso (commit aef848d); 157 pruebas unitarias y 94 de navegador aprobadas, además de SQL/RLS. Detalles: [GPS-CONTROL-RUTA.md](GPS-CONTROL-RUTA.md).
- [ ] Etapa Android posterior: notificaciones y sonido al chofer.
