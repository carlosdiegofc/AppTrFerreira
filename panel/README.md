# Panel nuevo de Transportes Ferreira

Panel web de la plataforma (etapas en [docs/PLAN-PLATAFORMA.md](../docs/PLAN-PLATAFORMA.md)), hecho en React + TypeScript sobre la misma base de Supabase que la app. Reemplaza al panel actual ([`web/`](../web/README.md)) sección por sección; hasta entonces los dos conviven.

| Sección | Estado |
|---|---|
| **Inicio** | Camiones en ruta, detenidos y sin viaje; mapa de la flota; viajes de hoy; papeles y services vencidos o por vencer; números del mes. |
| **GPS en vivo** | Todos los camiones en el mapa, actualizado cada 15 segundos, con filtros; al elegir un camión se ve su viaje en curso con el recorrido. |
| **Viajes** | Los viajes de la app, con lo que completó la oficina, y los cargados a mano: período, búsqueda, filtros por camión y chofer y pestañas por estado (pendientes de completar, en curso, completos, eliminados). El detalle de cada viaje tiene formato de orden de carga, con el recorrido GPS, los remitos y el combustible con sus fotos. La lista se exporta a Excel, PDF y Word, y cada viaje a PDF. Por ahora solo para consultar: editar llega con la parte 3b del plan. |
| Flota, Choferes, Combustible, Mantenimiento, Documentación, Gastos y finanzas, Métricas, Asistente IA, Configuración | Próximamente: cada página dice qué va a hacer y dónde se hace mientras tanto. |

## Quién entra
Las mismas cuentas de la app. Igual que el panel actual, este solo se abre para las cuentas de la lista de administradores del panel (`trf_is_panel_admin()`); cualquier otra, chofer o no, ve «Esta cuenta no tiene acceso». Qué datos ve cada cuenta lo deciden los permisos de la base (seguridad por filas), no la pantalla.

## Reglas compartidas con la app
Estados de los camiones (en ruta desde 5 km/h, sin señal después de 15 minutos sin lecturas), cómo se arma un viaje (lo que completó la oficina manda sobre lo que mandó el teléfono, y un viaje está pendiente mientras le falte camión, origen, destino, cliente o producto; en un retorno vacío no hacen falta cliente ni producto), coincidencia de camiones por matrícula o por modelo, avisos de papeles (30 días) y de services (15 días), el recorrido en el mapa (sin las lecturas sin posición, como 0,0, y cortado en cada pausa o después de 90 segundos sin lecturas) y el día en hora de Uruguay están en `src/lib/` con pruebas en `tests/unit/`. Son las mismas reglas de `FleetStats.kt` y `MainActivity.kt` y del panel actual (`web/js/trips.js`).

Los archivos para descargar (Excel, PDF y Word) se arman en el navegador con [write-excel-file](https://www.npmjs.com/package/write-excel-file), [jsPDF](https://www.npmjs.com/package/jspdf) y [docx](https://www.npmjs.com/package/docx). Cada uno se carga solo cuando se pide ese archivo, así que no pesan en la carga del panel. Las fotos de remitos y boletas son privadas: cada vez que se abre una, el almacenamiento da un enlace que vence a los 10 minutos, y sus reglas deciden quién puede verla.

## Desarrollo
```bash
npm ci
npm run dev        # http://localhost:5173, contra la base de producción
npm run typecheck  # TypeScript estricto
npm test           # reglas
npm run build      # carpeta dist/, para publicar en cualquier hosting estático
```

## Publicación
El workflow *Publicar panel web* (Actions → Run workflow, desde `main`) publica el panel actual en la dirección de siempre y este en `/nuevo/` de la misma dirección.

## Pruebas de punta a punta
Corren en un navegador real contra PostgREST y una base local creada con todas las migraciones de [`supabase/migrations`](../supabase/migrations) y datos inventados (`tests/e2e/db/seed.sql`). Nunca tocan producción. Detalle en [tests/e2e/README.md](tests/e2e/README.md). GitHub las corre en cada cambio del panel o de la base (workflow *Probar panel nuevo y base*) y guarda las capturas de pantalla.
