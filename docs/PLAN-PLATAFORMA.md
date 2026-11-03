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
- **Panel web nuevo** en React + TypeScript, sección por sección. Desde el 26/10/2026 está en la dirección principal del panel, y el actual (`web/`) sigue en `/anterior/` hasta que cada sección tenga reemplazo.
- **App Android:** sigue en Kotlin; pasa de a poco a una base local Room y a módulos, sin cambiar lo que ve el chofer salvo cuando se decida.
- **Mapas y rutas:** proveedor comercial; los servidores públicos de OpenStreetMap y OSRM no admiten uso comercial.

## Etapas
| # | Etapa | Estado |
|---|---|---|
| 0 | Preparación | En curso |
| 1 | Multiempresa, roles y auditoría | Pendiente |
| 2 | Flota (fichas con foto, acoplados y su historial) y choferes | Hecha (25/10/2026) |
| 3 | Viajes y métricas: estados, tramos con carga y vacíos, medido/declarado/estimado, exportar a PDF, Excel y Word | Pendiente |
| 4 | Combustible con lectura automática de la boleta y control de litros × precio | Pendiente |
| 5 | Mantenimiento preventivo y correctivo con avisos por km y por fecha; documentación con archivos y vencimientos | Pendiente |
| 6 | GPS en tiempo real | Pendiente |
| 7 | Gastos, finanzas y simulador de fletes | Hecha (28/10/2026) |
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
9. [x] Choferes (aprobado el 22/10/2026, adelanta parte de la etapa 2): la ficha de cada chofer y su sueldo de cada mes, con lo que se le va pagando. Migración [`0008_choferes_sueldos.sql`](../supabase/migrations/0008_choferes_sueldos.sql), que solo agrega tres tablas, su historial de cambios y sus permisos:
   - La lista separa a los choferes con ficha, a los de la app que todavía no la tienen (se les crea desde ahí) y a los que ya no trabajan. De cada uno muestra los viajes y los kilómetros del mes, los papeles vencidos o por vencer y cómo va el sueldo del mes.
   - La ficha: teléfono, cédula, fecha de ingreso con la antigüedad, categoría de la libreta (su vencimiento sigue en Documentación), la actividad del mes con el enlace a sus viajes, sus papeles y los datos para pagarle: forma de pago, banco y cuenta.
   - El sueldo, mes a mes: el sueldo del mes, lo pagado y lo que falta. Los adelantos y los pagos de sueldo se restan; el aguinaldo, la licencia, los viáticos y otros pagos se muestran aparte. Pesos y dólares no se mezclan. Un sueldo nuevo rige desde el mes que se elige, y los meses anteriores quedan con el de antes.
   - Nada se borra: un sueldo o un pago mal cargado se corrige o se anula, y quien ya no trabaja queda con su ficha y sus pagos, con el día en que dejó de trabajar: su sueldo termina ese mes. La base guarda quién cargó o cambió cada cosa y cómo estaba antes.
   - Lo ven y lo cargan solo las cuentas del panel (dueño y administración). Los choferes no ven las fichas ni los sueldos, ni siquiera el suyo.
   - [x] Publicación el 23/10/2026: respaldo completo de estructura y datos (21:06 UTC), probado restaurándolo y con las migraciones 0007 y 0008 aplicadas sobre esa copia, y entregado al dueño fuera del repositorio; 0008 aplicada en producción, con las tres tablas solo para las cuentas del panel; panel publicado (despliegue #13, commit fd4495e).
10. [x] El tanque de cada camión (aprobado el 22/10/2026): en Combustible, cuánto combustible debería tener cada camión ahora, con aviso cuando le queda poco. Migración [`0009_tanques.sql`](../supabase/migrations/0009_tanques.sql), que solo agrega una columna en las boletas y una tabla con el tanque de cada camión, con su historial y sus permisos:
   - [x] El cálculo: arranca en la última medición o en la última carga con el tanque lleno, suma las cargas de las boletas y resta los kilómetros del GPS según lo que consume el camión, que se escribe en km por litro. Se actualiza cada 30 segundos mientras el camión anda. Es una estimación y lo dice: si una carga no tiene litros, o las cargas pasan lo que le entra al tanque, pide revisar en lugar de inventar.
   - [x] «Tanques» en Combustible: cada camión con los litros, la barra del tanque, los kilómetros que rinde y desde cuándo cuenta, y el consumo real entre los dos últimos tanques llenos. Los que tienen poco van primero, y Combustible e Inicio avisan «Combustible bajo»: por defecto con el 20 % del tanque, y se cambia por camión.
   - [x] «Tanque lleno» en cada boleta: lo marca la oficina en el panel, al cargarla o al corregirla, sin tocar lo que declaró el chofer. Al cargarla se escribe también la hora de la boleta, para que el tanque cuente los viajes desde la carga.
   - [x] «¿Llenaste el tanque?» en la app, al cargar combustible (versión 0.20.0): manda sí o no con la boleta, y Mi combustible y Combustible de la flota muestran «Tanque lleno».
   - [x] La cuenta del camión en GPS usa el mismo cálculo y los mismos formularios.
   - [x] Publicación el 24/10/2026: respaldo completo de estructura y datos (18:34 UTC), probado restaurándolo y con la 0009 aplicada sobre esa copia, y entregado al dueño fuera del repositorio; 0009 aplicada en producción, con los datos que ya estaban sin cambios; panel publicado (despliegue #14, commit 5731b8e); la app 0.20.0 (versionCode 32), firmada con la llave de subida, entregada para Google Play.
11. [x] Flota (aprobado el 24/10/2026, completa la etapa 2 junto con Choferes): la ficha de cada camión y de su acoplado, con su foto, y en una sola pantalla lo que ya se sabe de cada camión. Migración [`0010_flota.sql`](../supabase/migrations/0010_flota.sql), que solo agrega dos tablas, una carpeta privada para las fotos, su historial de cambios y sus permisos:
   - [x] La lista: cada camión del catálogo con su foto, si está en viaje, su acoplado, los kilómetros estimados, el combustible del tanque, el próximo service, los papeles y el mes (viajes y kilómetros). Primero van los que tienen algo para atender.
   - [x] La ficha del camión: marca, modelo, matrícula, año, chasis, motor, capacidad de carga (kilos, o metros cúbicos si es cisterna), foto y notas; su acoplado y los que tuvo antes; sus viajes, combustible, services, papeles y tanque, con enlace a cada sección; y quién lo manejó cada mes, según los viajes.
   - [x] Los acoplados: su ficha con los mismos datos y el tipo, y a qué camión estuvo enganchado y desde cuándo. Sus papeles se cargan en Documentación, como los de los camiones.
   - [x] Nada se borra: un camión o un acoplado que se vende queda con su fecha de baja y su historial, y deja de llevar su acoplado, o de ir en su camión, desde ese día. Un enganche mal cargado se anula.
   - [x] Publicación el 25/10/2026: respaldo completo de estructura y datos (02:29 UTC), probado restaurándolo y con la 0010 final aplicada sobre esa copia, y entregado al dueño fuera del repositorio; 0010 aplicada en producción (18:45 UTC), con los datos que ya estaban sin cambios; panel publicado (despliegue #15, commit 6a581dc). La app no cambia.
12. [x] Gastos y finanzas (aprobado el 26/10/2026, etapa 7), en dos partes, cada una con su respaldo y su publicación. Lo ven y lo cargan solo las cuentas del panel, como Choferes, y la app no cambia:
   - 12a. [x] Gastos, y el panel nuevo en la dirección principal:
     - [x] Cada gasto con fecha, tipo (reparación y repuestos, cubiertas, service, seguro, patente e impuestos, peajes en efectivo, multas, lavado, viáticos, otros, o uno escrito a mano), monto en pesos o en dólares, a qué va (un camión, un acoplado, un chofer, un viaje o la empresa), proveedor, forma de pago y la foto o el PDF de la factura, en una carpeta privada. Lo mal cargado se corrige o se anula; no se borra.
     - [x] El costo de un service hecho se anota como gasto, desde Mantenimiento.
     - [x] El panel nuevo pasa a la dirección principal: el actual queda en `/anterior/`, y `/nuevo/` lleva a la principal para que no se rompan los enlaces guardados.
     - [x] Publicación el 26/10/2026: respaldo completo de estructura y datos (00:52 UTC), probado restaurándolo y con la 0011 aplicada sobre esa copia, y entregado al dueño fuera del repositorio; migración [`0011_gastos.sql`](../supabase/migrations/0011_gastos.sql) aplicada en producción (01:05 UTC), con los datos que ya estaban sin cambios; panel publicado en la dirección principal, con el anterior en `/anterior/` (despliegue #16, commit 9e15a62). La app no cambia.
   - 12b. [x] Cobros, ganancia y simulador de fletes, en dos entregas (27/10/2026):
     - [x] Cobros: la cuenta de cada cliente, como la de cada estación de combustible: lo facturado en sus viajes suma, los cobros restan, con un saldo inicial con fecha. Los clientes salen del nombre escrito en los viajes, sin importar mayúsculas, tildes ni espacios, y de la lista de clientes de la app. Migración [`0012_cobros.sql`](../supabase/migrations/0012_cobros.sql), que solo agrega una tabla para los cobros y los saldos iniciales, con su historial de cambios y sus permisos; los viajes no cambian. Va con su respaldo completo antes:
       - [x] «Cobros», al lado de «Gastos» en Gastos y finanzas: lo que deben los clientes, lo facturado y lo cobrado en el período (pesos y dólares por separado) y los viajes terminados sin importe; cada cliente con su saldo, los cobros del período y los anulados, que se pueden restaurar. Los viajes que no dicen el cliente quedan aparte, para completarlos.
       - [x] La cuenta de cada cliente: el saldo inicial con su fecha y cada viaje y cada cobro desde ese día, con el saldo de cada renglón. Un viaje que sigue en ruta todavía sin importe no se pide completar. Cada viaje lleva a su página, y la página del viaje lleva a la cuenta de su cliente.
       - [x] Registrar un cobro o el saldo inicial, también de un cliente nuevo escrito a mano; corregirlos o anularlos. Un saldo inicial por cliente y moneda.
       - [x] Publicación el 27/10/2026: respaldo completo de estructura y datos (12:06 UTC), probado restaurándolo y con la 0012 aplicada sobre esa copia, y entregado al dueño fuera del repositorio; 0012 aplicada en producción (17:15 UTC), con los datos que ya estaban sin cambios y la tabla nueva igual a la de la copia; panel publicado (despliegue #19, commit f368d99). La app no cambia.
     - [x] Ganancia, simulador y variación, sin cambios en la base:
       - [x] La ganancia de cada viaje, de cada camión por mes y de la empresa por mes: lo facturado menos el combustible, los peajes y los gastos. Los gastos de un acoplado van con el camión que lo llevaba ese día, según los enganches de Flota; si no iba enganchado, solo en el total de la empresa. El total de la empresa resta además el sueldo de cada mes y los viáticos de ese mes. Pesos y dólares por separado, y la pantalla dice qué es medido, declarado o estimado. En «Ganancia», al lado de «Cobros», se elige el mes: cómo se llega a la ganancia, cada camión, cada viaje y los últimos 12 meses. En el mes, cada cosa cuenta en su día (el viaje en el de su salida, la boleta, el paso por el peaje y el gasto en el suyo), y el gasto de un viaje va con el camión de ese viaje. Los peajes son los pasos que vio el GPS, con la tarifa de cada camión: un paso sin tarifa no suma y se avisa, y las recargas y los ajustes de la cuenta de telepeaje no cuentan. Una boleta sin importe, o en cero, tampoco suma, y se avisa. Los viáticos son los pagos a los choferes como viático de ese mes. El mes en curso cuenta hasta hoy: lo que tiene fecha posterior todavía no suma.
       - [x] El simulador de fletes: con el camión, los kilómetros con carga y de vuelta, los peajes de la ruta, el precio del gasoil, el consumo y lo que se le paga al chofer por el viaje, calcula el costo y el precio con el margen sumado al costo. No guarda las cotizaciones. Al elegir el camión trae su consumo (el medido entre sus dos últimos tanques llenos, o el de su tanque en Combustible); si no tiene, se va el que trajo el anterior, pero no el escrito a mano. Ofrece el precio por litro de la última boleta en pesos, de hoy o de antes: una con fecha posterior a hoy no se ofrece.
       - [x] La variación de los números grandes contra el período anterior («↑ 6 % más que el mes pasado»), que quedó del punto 13: en Gastos, Cobros, Ganancia, Combustible y Métricas, contra un período del mismo largo (el mes en curso, contra el mes anterior hasta el mismo día), en verde cuando es buena noticia y en rojo cuando no, y pesos y dólares cada uno por su lado. Un período que sigue después de hoy compara solo hasta hoy, y unas fechas de un enlace que no son fechas no se comparan.
       - [x] Publicación el 28/10/2026: panel publicado (despliegue #20, commit bd0deea). La base y la app no cambian.
13. [x] Diseño «vidrio» (aprobado el 26/10/2026, a pedido del dueño con un video de ejemplo; va antes de la parte 12b): todo el panel con tarjetas de vidrio esmerilado sobre un fondo desenfocado. La base y la app no cambian:
   - [x] El fondo: una imagen desenfocada de tonos cálidos con luces suaves, hecha para el panel, sin foto. Si el dueño manda una foto suya, se usa esa. En el modo oscuro, el mismo fondo más oscuro.
   - [x] El vidrio: tarjetas translúcidas con bordes redondeados y sombra suave, títulos grandes, números grandes, botones en forma de píldora, y gráficos con curvas suaves, barras redondeadas y anillos. Los colores: el azul de TR Ferreira, y verde, ámbar y rojo para los avisos, como hasta ahora.
   - [x] La variación de los números grandes contra el período anterior, como en el video («↑ 6 % más que el mes pasado»): quedó fuera de lo publicado y se hizo con la segunda entrega de la parte 12b.
   - [x] Arriba, una barra flotante con el nombre de quien ingresó (ahí van el tema y «Salir»), un buscador de secciones, camiones, acoplados y choferes, y una campana con los avisos de Inicio. A la izquierda, el menú pasa a una columna de íconos que muestran su nombre al pasar el mouse.
   - [x] Sigue todo lo que hay: las 12 secciones con lo que hacen, los modos claro y oscuro y el uso desde el celular. Si la computadora no muestra el vidrio o pide menos transparencias, las tarjetas quedan opacas.
   - [x] Publicación el 26/10/2026: el dueño lo aprobó sobre las capturas de cada sección; panel publicado (despliegue #17, commit 2e26ec3). La base y la app no cambian.

### App: juegos para las esperas
Para pasar el rato mientras se espera la carga (aprobado el 21/10/2026). Se juega con el camión parado, y los juegos los ven todas las cuentas.
1. [x] Ajedrez, en la app 0.18.0, que se sube a Google Play cuando lo decidas:
   - Contra el teléfono, en tres niveles, o entre dos personas pasándose el teléfono. Tiene todas las reglas, deshacer y girar el tablero. Las piezas son dibujos propios de la app.
   - Se abre sin viaje, con el viaje pausado o con el camión detenido según el GPS: una lectura de los últimos 2 minutos, a menos de 5 km/h. Si el camión arranca, la partida se guarda y se cierra.
   - La partida queda solo en el teléfono: no va nada a la base ni al panel.
2. [x] Truco uruguayo contra el teléfono, en la app 0.19.0, que se sube a Google Play cuando lo decidas:
   - Con flor y contraflor, a 30: 15 malas y 15 buenas, con el tanteador en fósforos. Las reglas del 22/10/2026 están en las decisiones.
   - El teléfono canta el envido por sus tantos y el truco por lo que estima ganar, y a veces miente. Las cartas son dibujos propios de la app.
   - Como el ajedrez: se juega con el camión parado y la partida queda solo en el teléfono.
3. [ ] Partidas en línea con los compañeros, con sus cuentas de la app:
   - Se elige de cuántos jugar: 1 contra 1, 2 contra 2 o 3 contra 3.
   - Por turnos. El servidor reparte y guarda las cartas, así nadie ve las de otro.
   - Necesita una migración, con su respaldo antes, y actualizar la política de privacidad y el formulario de datos de Google Play.
   - La misma regla del camión parado: si alguien arranca, la partida queda en pausa.

### App: diseño «vidrio» y más fluida (aprobado el 28/10/2026)
La app toma el diseño del panel y se mueve con más suavidad. Mismas funciones, mismos botones en el mismo lugar; lo que guarda y lo que manda no cambian, así que la base no cambia y los choferes que no actualicen siguen igual. Va en la app 0.22.0:
1. [x] El diseño: el mismo fondo cálido desenfocado del panel, en claro y en oscuro según el teléfono; tarjetas translúcidas con borde fino, títulos y números grandes, botones en forma de píldora y los colores del panel. La barra de abajo marca la sección con una pastilla. En la pantalla del viaje y en el modo sencillo las tarjetas van casi opacas, para leer al sol. Los mapas y los juegos no cambian.
2. [x] El movimiento: las pantallas entran deslizándose (desde la derecha al avanzar, desde la izquierda al volver), redibujar una pantalla no la vuelve al principio, las listas aparecen escalonadas, los botones y las tarjetas se achican al tocarlos, las acciones importantes vibran suave, los números del viaje cambian sin saltos y las listas para elegir suben desde abajo. Si el teléfono tiene las animaciones apagadas, la app no las hace.
3. [x] Capturas de cada pantalla, en claro y en oscuro, para que el dueño las apruebe antes de publicar: la versión de prueba muestra la app con datos de ejemplo, sin red, en el emulador de la CI. Aprobadas por el dueño el 28/10/2026 (24 pantallas, ejecución 40715422543); unión del PR #28 el mismo día.
4. [x] Publicación: el .aab de la 0.22.0, que se sube a Google Play cuando lo decidas. Quedó firmado el 28/10/2026 en la ejecución 40722251341 de main (artefacto «Google-Play-Transportes-Ferreira-GPS-v0.22.0»).

### Avisos (aprobado el 28/10/2026)
Avisos en el teléfono del chofer y en la campana del panel. Los del teléfono los calcula la app con lo que ya tiene: no hay servidor nuevo, no se envía nada más y llegan aunque no haya señal. Va en la app 0.23.0 y en el panel:
1. [x] Papeles y services, a las 8:00: los papeles del chofer y los de su camión que vencen en 30 días o ya vencieron, y los services de su camión a 15 días o atrasados. Avisa cuando algo pasa a «por vencer» o a «vencido», no todos los días. El dueño que maneja recibe los de toda la flota, como los ve en su inicio. Los services por kilómetros avisan en el panel: el teléfono del chofer solo ve sus propios viajes y no puede estimar los kilómetros del camión.
2. [x] Viaje abierto: «¿Te olvidaste de finalizar el viaje?» cuando lleva 14 horas en curso, o 2 horas detenido sin pausar.
3. [x] Boleta: al finalizar un viaje sin boletas, «¿Cargaste combustible en este viaje?», con el botón para cargarla.
4. [x] En Mi cuenta, un interruptor por cada tipo de aviso.
5. [x] La campana del panel suma los viajes en curso hace más de 14 horas, las boletas sin importe o sin litros, los viajes con carga sin importe y los choferes con una versión vieja de la app; cada aviso lleva a su página.
6. [x] Publicación: el panel y el .aab de la 0.23.0. Unión del PR #29, panel publicado y .aab firmado el 28/10/2026 en la ejecución 40762083098 de main (artefacto «Google-Play-Transportes-Ferreira-GPS-v0.23.0»).

### Tramos sin señal (aprobado el 28/10/2026)
Cuando el GPS de un viaje se corta (sin señal, el teléfono sin batería, el sistema que cerró la app) y vuelve, la línea del mapa sigue por el camino que hizo el camión y el viaje cuenta esos kilómetros. Va en la migración 0013, la app 0.24.0 y el panel:
1. [x] La base (migración 0013, solo agrega): las lecturas del camino estimado van con las del GPS, marcadas como estimadas y sin precisión, así no generan pasos por peajes ni balanzas; y cada corte queda en una tabla nueva (`trf_route_gaps`) con sus dos puntas, los kilómetros que contó y cómo se rellenó. Cada chofer carga y ve los suyos, el panel ve todos y nadie los cambia ni los borra. Pruebas en `panel/tests/e2e/db/gaps.sql`.
2. [x] La app: si pasaron más de 90 segundos sin lecturas y el camión apareció a más de 300 m, en el mismo tramo del viaje (una pausa no cuenta), el viaje suma enseguida la línea recta y un 20 %, y al sincronizar pide a Google el camino por ruta entre los dos puntos. Con el camino, cuenta sus kilómetros y guarda sus lecturas estimadas. Si Google no contesta (sin señal, la API sin habilitar) lo vuelve a pedir cada 10 minutos, y al día se queda con la recta. Un corte de más de 3 horas, o un salto que un camión no puede hacer (más de 120 km/h de promedio), queda sin contar y para revisar.
3. [x] Los mapas de la app: el tramo sin señal va en línea punteada, por su camino estimado o en recta mientras llega. El detalle del viaje dice los kilómetros estimados y los cortes sin contar.
4. [x] El panel: el mismo punteado en el GPS en vivo y en el viaje, la leyenda, «Sin señal: 6,3 km estimados en 1 tramo» y el aviso del corte sin contar para revisar los km. El mapa en vivo trae también el camino que llega después del corte. Los puntos del recorrido cuentan solo las lecturas del GPS.
5. [x] Respaldo completo de la base (entregado al dueño, fuera del repositorio) y migración 0013 en producción el 28/10/2026 a las 20:57 (hora UTC). Antes, producción estaba igual al respaldo; después, los datos existentes siguieron idénticos.
6. [x] Publicación: unión del PR #30, panel publicado y .aab firmado el 28/10/2026 en la ejecución 40767761897 de main (artefacto «Google-Play-Transportes-Ferreira-GPS-v0.24.0»).
7. [ ] El dueño habilita la «Routes API» en Google Cloud y la agrega a las APIs permitidas de la llave de Android, y lo prueba en un viaje: sin la API, los tramos se cuentan en recta más un 20 %.

### Pantalla del viaje con el mapa grande (aprobado el 29/10/2026)
Al iniciar un viaje, el mapa ocupa toda la pantalla, como un navegador, y el dueño que maneja ve también la flota. Solo cambia la app: lee lo que ya leía Flota en vivo y no manda nada nuevo, así que la base no cambia. Va en la app 0.25.0:
1. [x] La pantalla del viaje: el mapa ocupa la pantalla y gira con el camión, que es una flecha que apunta adonde va. Arriba, el estado del viaje con el camión y el cartel de 90 km/h; a la derecha, botones redondos para que el mapa gire o quede con el norte arriba, elegir mapa, satélite o tráfico, seguir el camión y ver todo el viaje. Abajo, los km recorridos, la velocidad en un arco que se pone rojo pasando los 90, el tiempo en viaje y «Pausar viaje».
2. [x] El resto del viaje (combustible, remito, finalizar, destino, carga, camión, hora de salida, batería, juegos) queda en una hoja que sube desde abajo, deslizando o tocando la manija.
3. [x] El modo sencillo tiene la misma pantalla, con los botones grandes: Combustible, Pausar y FINALIZAR VIAJE.
4. [x] El dueño que maneja ve en el mapa de su viaje, siempre, los camiones de viaje y los choferes activos, con la velocidad de los que se mueven; tocando un camión aparece su recorrido en violeta, y tocándolo otra vez se va.
5. [x] Flota en vivo: el mapa ocupa media pantalla, tiene «Ver el mapa en pantalla completa», los camiones de viaje dicen su velocidad y tocando uno aparece su recorrido.
6. [x] Capturas aprobadas por el dueño el 29/10/2026 (ejecución 40801167048); unión del PR #32 y .aab firmado el mismo día en la ejecución 40805614080 de main (artefacto «Google-Play-Transportes-Ferreira-GPS-v0.25.0»), que se sube a Google Play cuando lo decidas.
7. [x] App 0.25.1: «Finalizar» siempre a la vista en el panel de abajo, al lado de «Pausar viaje» (pedido del dueño el 29/10/2026, porque en la hoja costaba encontrarlo). Unión del PR #33 el 29/10/2026.

### Viajes con y sin carga (aprobado el 29/10/2026)
Solo el panel: la app ya guarda si un viaje va con carga o es un retorno vacío (`load_type`), y Métricas ya separa los kilómetros cargados de los vacíos. No hay migración.
1. [x] Viajes: un filtro «Carga» (con y sin carga, con la carga que dice la app), «sin carga» a la vista en el kilometraje de cada viaje, y la lista exportada dice qué filtro tenía. Los viajes cargados a mano en el panel no dicen su carga: no entran en ninguno de los dos filtros.
2. [x] Un viaje sigue teniendo una sola carga: el que sale cargado y vuelve vacío son dos viajes, como hoy.
3. [x] Unión del PR #34 y panel publicado el 29/10/2026.

### Leer la boleta con la foto (aprobado el 29/10/2026)
El chofer saca la foto de la boleta y la app llena litros, importe, precio, estación y fecha; el chofer siempre confirma antes de guardar. Va en la app 0.26.0 y una función de Supabase. Lo que se guarda no cambia, así que no hay migración de la base:
1. [x] Primero en el teléfono, con el reconocimiento de texto de Google (ML Kit), sin red y sin que la foto salga del teléfono (`ReceiptText.kt` con sus pruebas, `ReceiptReader.kt`).
2. [x] Si no encuentra litros e importe que coincidan con el precio, la foto va a una función de Supabase (`supabase/functions/leer-boleta`) que la lee con Claude (la llave `ANTHROPIC_API_KEY` la carga el dueño como secreto de Supabase, nunca en el repositorio ni en la app) y devuelve los datos.
3. [x] Los campos aparecen llenos y se corrigen, sin pisar lo que el chofer ya escribió. Si litros por precio difiere del importe en más de un 5 %, la lectura del teléfono no se da por buena (pasa a la IA) y, si aun así no coincide, la app avisa que revise esos números.
4. [x] La política de privacidad dice que, solo cuando el teléfono no pudo leerla, la foto de la boleta se manda a Anthropic para leerla.
5. [x] Unión del PR #34 el 29/10/2026 y .aab de la 0.26.0.
6. [ ] El dueño carga `ANTHROPIC_API_KEY` como secreto en Supabase; después se despliega `leer-boleta` y se prueba con una boleta de verdad desde un teléfono. Sin la función, la app lee solo con el teléfono.

### Viajes con varias descargas (aprobado el 29/10/2026)
Un viaje puede llevar carga para distintos clientes: en cada lugar el chofer marca que llegó y que terminó de descargar, y el viaje sigue con el próximo cliente. Va en la migración 0014, la app 0.27.0 y el panel. Un viaje sin paradas sigue siendo uno solo.
1. [x] La base (migración 0014, solo agrega): una tabla `trf_trip_stops` con las paradas de cada viaje (cliente, lugar, orden, llegada con su ubicación, fin de la descarga y cómo terminó, kilos) y una columna opcional `stop_id` en los remitos. Cada chofer carga y maneja las suyas; las cuentas del panel y la administración las ven todas. Una parada ya visitada no se borra. Pruebas en `panel/tests/e2e/db/paradas.sql`.
2. [x] La app: las paradas se cargan antes de salir o sobre la marcha. En el viaje, «Llegué a [cliente]» anota la hora y el lugar y pasa a «Descargando»; la descarga termina cuando el chofer toca «Terminé de descargar» o cuando el camión pasa de 15 km/h durante 30 segundos; entonces sigue la parada siguiente en el mismo viaje. El modo sencillo lleva los mismos botones, grandes. Un remito se puede atar a su parada.
3. [x] El panel: el viaje muestra sus paradas con la hora de llegada, el fin y cuánto duró cada descarga, las marca en el mapa y reparte los kilómetros por tramo.
4. [x] Respaldo completo de la base el 29/10/2026 a las 13:52 (hora UTC), entregado al dueño y fuera del repositorio; migración 0014 en producción el mismo día a las 13:55, con un viaje en curso, y después los datos siguieron iguales. Unión del PR #35, panel publicado y .aab firmado de la 0.27.0.
5. [ ] Segunda parte, a pedir: el importe y los kilos por cliente, para que Cobros y la ganancia cuenten por cliente.
6. [x] App 0.27.1: finalizar el viaje ya no cierra la app (el servicio del GPS no se cae con una última lectura incompleta y el mapa no trabaja una vez cerrado), probado en el emulador para el chofer en modo normal, en modo sencillo y el dueño de viaje. Si la app se cierra por un error, Mi cuenta muestra «Último error de la app» para enviarlo. Pedido del dueño el 29/10/2026; unión del PR #36 el mismo día.
7. [x] App 0.27.2: terminar la descarga de la última parada cerraba la app, y no volvía a abrir mientras el viaje siguiera (aviso del dueño el 29/10/2026). Arreglado; un error en las paradas ya no cierra la pantalla del viaje y queda en Mi cuenta. El emulador termina todas las descargas en modo normal y sencillo y vuelve a abrir el viaje.

### GPS que se corta en segundo plano (pedido del dueño el 30/10/2026)
Con la app en segundo plano o el teléfono bloqueado, el GPS de un viaje dejó de registrar: a 110 km/h, 17 minutos sin lecturas, que volvieron al abrir la app. En el emulador (Android 14) el GPS sigue en segundo plano, bloqueado y después de que el sistema cierra la app: lo corta el ahorro de batería propio de algunas marcas.
1. [x] Respaldo y cierre de un viaje que quedó abierto desde el 29/10 a las 12:40 (47 segundos, 0 km, del cierre de la app de la 0.27.0), con la hora de su última lectura.
2. [x] App 0.28.0: una alarma del sistema, que el servicio del GPS corre cada 10 segundos, avisa con sonido si el viaje pasa 3 minutos sin lecturas, y lo repite cada 10 minutos; los pasos de batería de cada marca en el primer viaje y en Mi cuenta › Revisar GPS.
3. [x] Panel: el viaje muestra cuándo el GPS no registró con el camión en marcha.
4. [x] La prueba del emulador de segundo plano, bloqueo y cierre de la app corre en cada versión.
5. [ ] Si con la batería ajustada se sigue cortando: el permiso de ubicación «Permitir todo el tiempo», con el formulario de permisos de ubicación de Google Play. Lo decide el dueño.

Hallazgos de la revisión de la base (18/10), para resolver en la etapa 1:
- El rol anónimo tiene todos los permisos de tabla en 8 tablas de la app y del panel (`trf_driver_*`, `trf_trip_*`, `trf_mobile_catalog`, `trf_panel_trips`), y también los de la secuencia que numera los puntos GPS. Es lo que Supabase da por defecto y la seguridad por filas lo frena, pero hay que quitarlos: solo `trf_rates` necesita lectura anónima.
- Conviven dos tipos de administrador: `trf_private.admin_emails` (administración completa, por correo) y `trf_panel_admins` (panel: lee toda la flota y también administra mantenimiento y documentos). Los datos que se completan en el panel (`trf_panel_trips`) los lee solo la segunda lista. Los dos pasan a ser roles por empresa.
- Las políticas que usan `trf_is_panel_admin()` sin `(select …)` se evalúan fila por fila; con más datos conviene envolverlas.
- `trf_panel_trips` solo tenía la política de lectura: las de alta y modificación de `web/sql/001_panel_web.sql` no estaban en producción, así que el panel actual no podía guardar los datos de un viaje ni mandarlo a la papelera. Resuelto el 18/10/2026 con la migración `0001` de la parte 3b de Viajes, según quién edita (ver decisiones).
- `trf_profiles`, `trf_requests` y `trf_rates` no las usan la app ni el panel: por su estructura son de un formulario de cotizaciones para clientes (presupuesto por kilómetro, pallet o tramo). Se conservan; falta confirmar quién las usa.

## Decisiones tomadas
- 29/10/2026: Viajes con varias descargas.
  - Las paradas se cargan antes de salir o sobre la marcha.
  - La descarga termina cuando el chofer lo marca o cuando el camión pasa de 15 km/h durante 30 segundos; lo que pasó primero queda anotado.
  - El modo sencillo también lleva paradas, con botones grandes.
  - El importe por cliente queda para una segunda parte.
- 29/10/2026: Viajes con y sin carga: filtro en Viajes, sin cambios en la base; un viaje sale cargado o vacío, no las dos cosas.
- 29/10/2026: Leer la boleta con la foto: primero el teléfono, si falla Claude desde una función de Supabase; el chofer siempre confirma; el campo se marca si litros por precio difiere del importe en más de un 5 %.
- 29/10/2026: Pantalla del viaje con el mapa grande.
  - El mapa ocupa la pantalla y gira con el camión; se puede dejar con el norte arriba.
  - Lo que no es el mapa ni los números del viaje va en una hoja deslizable.
  - El dueño que maneja ve la flota en el mapa de su viaje siempre, sin tener que prenderla.
  - El modo sencillo tiene la misma pantalla, con botones grandes.
  - Flota en vivo con el mapa más grande, pantalla completa y el recorrido de un camión al tocarlo.
- 28/10/2026: Insignias en los puntos del mapa. Cada punto del GPS en vivo lleva en su círculo lo que es: «$» en los peajes, una balanza en las balanzas, un velocímetro en los radares y una bandera en los puntos propios, también en la lista y en los filtros. Los puntos propios van solo con su nombre, sin «Mi punto ·». Solo el panel: la app no muestra estos puntos.
- 28/10/2026: Tramos sin señal.
  - El tramo se rellena con el camino por ruta de Google (Routes API), con la misma llave de Android de los mapas. Solo los dos puntos van a Google, sin el chofer ni el viaje; la política de privacidad lo dice.
  - Se rellenan los cortes de hasta 3 horas; uno más largo, o un salto imposible, queda sin contar para revisarlo en el panel.
  - Va antes de leer las boletas con la foto.
- 28/10/2026: Avisos.
  - Los avisos del teléfono los calcula la app, sin Firebase ni servidor nuevo: sin costo y sin cambios en la política de privacidad. Los avisos al instante al dueño (por ejemplo, un camión detenido) quedan para más adelante.
  - Un viaje abierto se avisa a las 14 horas en curso, o con 2 horas detenido sin pausar.
  - Los avisos de papeles y services llegan a las 8:00.
- 28/10/2026: Lo que sigue después del diseño de la app.
  - La app para iPhone (iOS) queda para más adelante: primero se mejoran la app de Android y la web.
  - Las próximas mejoras, en este orden y cada una presentada como etapa antes de programarla: avisos (en el teléfono del chofer y en la campana del panel), leer la boleta de combustible con la foto, y viajes con y sin carga en Viajes y Métricas.
- 28/10/2026: Diseño de la app.
  - La app toma el diseño «vidrio» del panel y se vuelve más fluida. Por ahora solo diseño y movimiento: las funciones nuevas (avisos, resumen de plata, buscador) quedan para otra etapa.
  - El modo sencillo de los choferes también toma el diseño nuevo, con los botones igual de grandes y en el mismo lugar.
  - El desenfoque del fondo es una imagen ya preparada, como en el panel: no se calcula en el teléfono, para no gastar batería ni trabar los teléfonos más simples.
- 27/10/2026: Cobros, ganancia y simulador.
  - La parte 12b va en dos entregas: primero Cobros, con su migración y su respaldo antes; después la ganancia, el simulador y la variación de los números grandes, sin cambios en la base.
  - Los gastos de un acoplado cuentan en la ganancia del camión que lo llevaba ese día, según los enganches de Flota. Si ese día no iba enganchado, cuentan solo en el total de la empresa.
  - La ganancia de la empresa resta el sueldo de cada mes (el que corresponde a ese mes, no lo pagado ese mes) y los viáticos de ese mes.
  - En el simulador, el margen se suma al costo: el precio es el costo más ese porcentaje del costo.
  - El simulador suma al costo lo que se le paga al chofer por el viaje, sin otros costos por kilómetro.
- 26/10/2026: Mapa de Google.
  - El panel y la app pasan al mapa de Google: calles, satélite y tráfico en vivo. Las condiciones de Google no permiten mostrar su satélite ni su tráfico junto a un mapa de otra empresa, así que OpenStreetMap queda solo de respaldo: sin la clave o cuando Google no responde.
  - El panel usa la Map Tiles API: 100.000 imágenes gratis por mes y después US$ 0,60 cada 1.000. El tope es de unos US$ 10 por mes, con una cuota diaria y una alerta de presupuesto.
  - La app usa el mapa de Google para Android, que no tiene costo.
  - La cuenta de Google Cloud y las claves las crea el dueño. Las claves van como secretos de GitHub, nunca en el repositorio.
- 26/10/2026: Diseño del panel.
  - El panel toma el estilo «vidrio» del video que mandó el dueño: tarjetas translúcidas sobre un fondo desenfocado, una barra flotante arriba y el menú de íconos a la izquierda.
  - El fondo es una imagen hecha para el panel, sin foto: desde el entorno de desarrollo no se pueden bajar fotos de bancos de imágenes. Si el dueño manda una foto suya, se usa esa, sabiendo que el panel y el repositorio son públicos.
  - Los colores son el azul de TR Ferreira, no los del video.
  - Se hace antes de la parte 12b de Gastos y finanzas.
- 26/10/2026: Gastos y finanzas.
  - Los cobros a clientes se llevan como la cuenta de cada estación de combustible: lo facturado en los viajes suma, los cobros restan, y hay un saldo inicial con fecha. No se cargan facturas aparte; la factura electrónica de DGI queda para más adelante.
  - En la ganancia de cada camión no se reparten los sueldos: se restan solo en el total del mes de la empresa.
  - Los gastos los carga solo el panel: la app no cambia en esta etapa.
  - El simulador de fletes solo calcula: no guarda las cotizaciones.
  - El panel nuevo pasa a la dirección principal del panel, y el actual queda en `/anterior/` un tiempo.
- 24/10/2026: Flota.
  - La lista de camiones sigue siendo la del catálogo que usa la app: la ficha le agrega los datos y la foto, unida por la matrícula. Agregar o sacar camiones de la lista sigue como hoy, y pasa al panel con Configuración.
  - Cada camión lleva siempre el mismo acoplado: figura en su ficha y se cambia solo si se vende o se reemplaza, y el cambio queda en el historial.
  - La ficha lleva marca, modelo, matrícula, foto y notas, más el año, los números de chasis y de motor y la capacidad de carga: kilos, o metros cúbicos si es cisterna. Una sola foto por camión o acoplado.
  - Los camiones no tienen chofer asignado: la ficha muestra quién lo manejó cada mes, según los viajes de la app.
  - Lo ven y lo cargan solo las cuentas del panel, como Choferes.
- 22/10/2026: el tanque de cada camión.
  - El cálculo se corrige con cada carga que llena el tanque: la marca «Tanque lleno» la pone la oficina en el panel y el chofer en la app.
  - El aviso de combustible bajo va en Combustible y en Inicio. El aviso en el teléfono queda para la etapa de avisos de la app.
- 22/10/2026: choferes y sueldos.
  - El sueldo se lleva mes a mes: se carga el sueldo del mes y cada pago, y el panel muestra lo pagado y lo que falta.
  - La ficha lleva contacto y documento, la libreta de conducir, la actividad y los datos para pagarle.
  - Los sueldos los ven solo el dueño y la administración, con las cuentas del panel. Los choferes no los ven, ni siquiera el suyo.
- 22/10/2026: mapa del GPS.
  - La vista satelital viene de Google Maps, por su Map Tiles API: entra en el mismo mapa, así que no cambia nada de lo que ya muestra.
  - Va en los mapas de GPS en vivo y de cada viaje del panel.
  - Las balanzas que se cargan son las de control del MTOP en las rutas nacionales.
  - Las ubicaciones salen del Geoportal del MTOP y de OpenStreetMap, revisadas en la foto satelital: las condiciones de Google no permiten copiar sus lugares a otra base.
  - Los 3 peajes ya cargados se corrigen si no coinciden con la ubicación verificada.
- 22/10/2026: reglas del truco.
  - La sota de la muestra vale 27 en el envido y en la flor, como el caballo.
  - La falta envido vale lo que le falta al que va ganando para llegar a 30.
  - Con contraflor: la flor vale 3; contra otra flor se canta contraflor (6), contraflor al resto o «con flor me achico», que le da 4 al otro. Gana la flor más alta.
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

Más adelante: método de lectura de boletas, modelo de IA y cupo por plan, transcripción de audios, medio de pago, facturación electrónica (CFE), monedas, nombre comercial, cuánto tiempo se guarda el GPS en el plan FREE y publicidad.

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

### GPS: mapa satelital, pantalla completa, peajes y balanzas (aprobado el 22/10/2026)
- [x] Pantalla completa en el mapa de GPS en vivo (con «Ver todos») y en el de cada viaje; Esc o el mismo botón la cierran. El mapa de Inicio queda igual.
- [x] Vista satelital de Google Maps (Map Tiles API) en esos dos mapas: las fotos con las rutas, calles y nombres encima, debajo de los camiones, los recorridos y los puntos, con el logo y los créditos de Google. Aparece cuando el panel tiene la clave de Google Maps (secreto `GOOGLE_MAPS_KEY`); los pasos para crearla están en [panel/README.md](../panel/README.md).
- [ ] La clave de Google Maps: la crea el dueño en Google Cloud, con una cuenta de facturación. Sigue en «Mapa de Google en el panel y la app».
- [x] Los 15 peajes de las rutas nacionales, los 2 de los puentes a Argentina y los 24 puestos de balanza del MTOP, con la ubicación del Geoportal del MTOP comparada con OpenStreetMap y revisada en la foto satelital (migración 0006, solo agrega; detalle en [GPS-CONTROL-RUTA.md](GPS-CONTROL-RUTA.md)). Los 3 peajes ya cargados estaban en el lugar justo y no se tocan.
- [x] El logo oficial de Google Maps y su enlace a los términos en los créditos de la vista satelital, como piden las condiciones de la Map Tiles API.
- [x] Los 122 radares del MTOP (pedido el 22/10/2026), con la ubicación del Geoportal comparada con las calles y los radares de OpenStreetMap (migración 0007, solo agrega; detalle en [GPS-CONTROL-RUTA.md](GPS-CONTROL-RUTA.md)). Van sin velocidad máxima: se carga en cada uno desde el panel.
- [x] Publicación el 22/10/2026: respaldo completo de estructura y datos (04:02 UTC), probado restaurándolo y entregado al dueño fuera del repositorio; 0006 aplicada en producción, con 14 peajes y 24 balanzas nuevos, y los 3 peajes y los puntos propios sin cambios; panel publicado (despliegue #12, commit 2f5e1ba).
- [x] Publicación de los radares el 23/10/2026, junto con Choferes (mismo respaldo): 0007 aplicada en producción, con los 122 radares iguales a los del archivo y los 49 puntos que ya estaban sin cambios; panel publicado (despliegue #13, commit fd4495e).

### Mapa de Google en el panel y la app (aprobado el 26/10/2026)
Pedido del dueño: un mejor mapa. Todo el mapa pasa a ser de Google, con calles, satélite y tráfico en vivo; OpenStreetMap queda solo de respaldo (ver decisiones).
- [ ] La cuenta de Google Cloud con facturación y dos claves, una para el panel y otra para la app, con un tope de unos US$ 10 por mes: una cuota diaria de la Map Tiles API y una alerta de presupuesto. La crea el dueño, con la guía de [GOOGLE-MAPS.md](GOOGLE-MAPS.md).
- [x] Panel: calles, satélite y tráfico de Google (Map Tiles API) en GPS en vivo, en cada viaje y en el mapa de Inicio, con el logo y los créditos de Google. Sin clave, o si Google no responde (por ejemplo, al llegar al tope del día), el mapa vuelve a OpenStreetMap y lo dice.
- [x] App 0.21.0: el mapa de Google para Android (Maps SDK, sin costo) en el viaje en curso, en el recorrido de cada viaje y en la flota, con calles, satélite y tráfico. La clave entra al compilar, desde un secreto de GitHub; sin ella sigue el mapa de ahora.
- [ ] La política de privacidad y la sección de seguridad de los datos de Google Play dicen que la app muestra mapas de Google.
- [ ] Publicación: el panel cuando estén las claves, y la app en una versión nueva para Google Play.
