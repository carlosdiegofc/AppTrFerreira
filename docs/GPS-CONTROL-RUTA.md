# Control de ruta del panel nuevo

Etapa autorizada el 21/10/2026. Continúa el mapa Leaflet, componentes, permisos del panel y consultas React Query existentes. No cambia Android ni las lecturas GPS originales.

## Uso

GPS tiene Seguimiento, Peajes/balanzas/radares y Mis puntos. Conserva camión, recorrido y zoom al cambiar de vista. Se puede agregar tocando el mapa o ingresando coordenadas, editar y archivar. La cuenta del camión muestra enlaces a su última ubicación en Google Maps/Apple Maps, saldo de telepeaje en UYU, movimientos, tarifas y combustible estimado.

Cada tarifa nueva conserva la anterior; los pasos guardan el nombre, precio, límite y máxima velocidad observada. Las recargas y correcciones son movimientos nuevos: no se borran cobros. Se identifica la cuenta por matrícula normalizada, o por modelo completo cuando no hay matrícula; los nombres antiguos no se unen automáticamente a una cuenta con matrícula.

## Mapa satelital y pantalla completa

Desde el 22/10/2026 el mapa de GPS (y el de cada viaje) se abre en pantalla completa con el botón de abajo del zoom; Esc o el mismo botón la cierran, y «Ver todos» sigue a mano. Con la clave de Google Maps, «Satélite» (abajo a la derecha) muestra las fotos de Google con sus rutas, calles y nombres, debajo de los camiones, los recorridos y los puntos de peajes, balanzas y radares, que se siguen tocando y editando igual. Cómo crear la clave: [panel/README.md](../panel/README.md).

## Peajes y balanzas cargados (migración 0006)

El 22/10/2026 se cargaron los peajes y las balanzas de las rutas nacionales. Son puntos como los demás: se editan y se archivan desde el panel.

- **Peajes (17):** los 15 en uso de la lista del MTOP (Pando, Solís, Soca, Cebollatí, Capilla de Cella, Garzón, Santa Lucía, Barra de Santa Lucía, Cufré, Mercedes, Paso del Puerto, Queguay, Mendoza, Centenario y Manuel Díaz) y los de los puentes General San Martín (Fray Bentos) y General Artigas (Paysandú). La ubicación es la línea de cabinas de OpenStreetMap, comparada con el Geoportal del MTOP y revisada en la foto satelital. Queguay, Mercedes y Mendoza ya estaban cargados en el lugar justo y quedan como estaban. La plaza vieja de Barra de Santa Lucía, que el Geoportal todavía muestra, no se carga.
- **Balanzas (24):** los puestos de control de carga del MTOP, con 32 balanzas en total porque algunos pesan en los dos sentidos. La ubicación es la del Geoportal del MTOP, revisada en la foto satelital. El puesto de la Ruta 15 abre solo en una época del año.
- Las notas de cada punto dicen la ruta y el km, el departamento (peajes) o el sentido en que se pesa (balanzas) y de dónde sale la ubicación.
- Los peajes entran sin tarifa: el paso se registra sin descuento hasta cargar la tarifa de cada camión.
- Con todos los puntos, el mapa del país muestra solo los puntos de colores (el nombre aparece al pasar el mouse) y los nombres se ven al acercarse. La lista va por tipo y por nombre, y un punto llamado «Peaje Pando» se muestra así, sin repetir «Peaje».
- No se copian lugares de Google Maps, porque sus condiciones no lo permiten. Con la vista satelital se puede ver cada punto sobre la foto de Google.
- La migración solo agrega. Si ya hay un punto del mismo tipo a menos de 300 m, aunque esté archivado, ese no se agrega: no duplica lo cargado a mano ni vuelve a poner lo que se archivó.

## Qué significa «estimado»

El observador del historial funciona sin dejar una web abierta. Solo considera lecturas del dueño del viaje, posteriores al alta del punto, con precisión ≤30 m y ≤la mitad del radio. Exige aproximación, dos lecturas dentro y salida al lado opuesto fuera del doble del radio. Una interrupción de más de 90 segundos, cambio de segmento o edición del punto reinicia la detección. Las lecturas antiguas/repetidas no vuelven a debitar. Sin tarifa vigente se guarda el paso sin descuento. No es una conexión al operador de telepeaje: caminos paralelos, intervalos entre lecturas o carga tardía pueden requerir conciliación mediante ajustes.

Los avisos web son proximidad en línea recta con posición de menos de 30 segundos, no una ruta calculada. El GPS no prueba infracciones a 5 km/h. Avisos sonoros y funcionamiento de alertas con el teléfono cerrado necesitan la próxima etapa Android.

El tanque se calibra con litros medidos, capacidad, consumo L/100 km y umbral. Se guardan distancias y boletas de referencia: después se descuentan kilómetros GPS y se suman nuevas cargas. Una boleta corregida/eliminada, distancia reducida o carga sin litros suspende la estimación hasta revisar y recalibrar. No estima ralentí ni combustible no registrado. Boletas cargadas tardíamente pueden requerir recalibración.

## Entrega y publicación

Aplicar `0005_gps_control_ruta.sql` primero en una base de pruebas. Verificar `panel/tests/e2e/db/road.sql`, además de los permisos existentes, tipos, reglas y navegador. La migración es aditiva y tiene un trigger sobre nuevas lecturas: su prueba es obligatoria antes de producción.

Antes de producción, respaldo manual completo de estructura y datos entregado al dueño fuera del repositorio (regla del plan). Después aplicar la migración y publicar el panel. Sin la migración, las funciones nuevas muestran un error de lectura; GPS y viajes existentes siguen disponibles. No publicar el panel antes de preparar la base.

`0006_peajes_balanzas.sql` es solo de datos y sigue el mismo orden: probarla fuera de producción, respaldo completo, aplicarla y publicar el panel. El panel funciona igual con o sin ella; sin ella, el mapa muestra solo los puntos cargados a mano.

La lista `trf_panel_admins` sigue siendo quien lee y administra; ni choferes ni anónimos acceden a cuentas y puntos. El disparador usa funciones privadas con búsqueda vacía y acceso revocado. Puntos/referencias tienen auditoría privada y control de edición concurrente. Tarifas, eventos y movimientos no tienen permisos de actualización/borrado para clientes.
