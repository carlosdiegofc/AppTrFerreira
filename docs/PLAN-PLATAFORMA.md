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
3. [ ] Viajes: filtros, recorrido, datos para facturar, papelera y exportación a Excel, PDF y Word.
4. [ ] Combustible, Mantenimiento y Documentación con lo que ya carga la app.
5. [ ] Métricas: rendimiento por camión y por chofer, con gráficos.
6. [x] Publicarlo: el código pasa a `main` y el panel nuevo queda en `/nuevo/` de la dirección del panel actual (18/10/2026).

Hallazgos de la revisión de la base (18/10), para resolver en la etapa 1:
- El rol anónimo tiene todos los permisos de tabla en 8 tablas de la app y del panel (`trf_driver_*`, `trf_trip_*`, `trf_mobile_catalog`, `trf_panel_trips`). Es lo que Supabase da por defecto y la seguridad por filas lo frena, pero hay que quitarlos: solo `trf_rates` necesita lectura anónima.
- Conviven dos tipos de administrador: `trf_private.admin_emails` (administración completa, por correo) y `trf_panel_admins` (panel: lee toda la flota y también administra mantenimiento y documentos). Los datos que se completan en el panel (`trf_panel_trips`) los lee solo la segunda lista. Los dos pasan a ser roles por empresa.
- Las políticas que usan `trf_is_panel_admin()` sin `(select …)` se evalúan fila por fila; con más datos conviene envolverlas.
- `trf_panel_trips` solo tiene la política de lectura: las de alta y modificación de `web/sql/001_panel_web.sql` no están en producción, así que el panel actual no puede guardar los datos de un viaje ni mandarlo a la papelera. Antes de la sección Viajes hay que decidir quién edita (¿solo la cuenta de la empresa o también Luis?) y crear esas políticas con una migración.
- `trf_profiles`, `trf_requests` y `trf_rates` no las usan la app ni el panel: por su estructura son de un formulario de cotizaciones para clientes (presupuesto por kilómetro, pallet o tramo). Se conservan; falta confirmar quién las usa.

## Decisiones tomadas
- 18/10/2026: el código de la rama de trabajo pasa a `main` (app 0.16.3 y panel nuevo) y el panel nuevo se publica en `/nuevo/`, al lado del actual.
- 18/10/2026: el panel nuevo se hace en React + TypeScript, en `panel/`, y el actual sigue funcionando hasta que el nuevo lo reemplace.
- 16/10/2026: Supabase sigue en el plan gratis, sin Pro. Como ese plan no tiene respaldos descargables, antes de cada migración se hace un respaldo manual completo (estructura y datos) y se le entrega al dueño, nunca en el repositorio. La base entra en reposo si pasa unos días sin uso y vuelve con el uso (la app, el panel) o desde el proyecto en supabase.com. Las ramas de prueba de Supabase quedan descartadas porque requieren Pro.

## Decisiones abiertas
Antes de tocar datos reales:
- Entorno de pruebas: un segundo proyecto gratis de Supabase.
- Rol de cada cuenta actual: dueños, choferes y la cuenta de revisión de Google, que iría a una empresa de demostración.

Más adelante: proveedor de mapas, método de lectura de boletas, modelo de IA y cupo por plan, transcripción de audios, medio de pago, facturación electrónica (CFE), monedas, nombre comercial, cuánto tiempo se guarda el GPS en el plan FREE y publicidad.
