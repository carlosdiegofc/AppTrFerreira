# Control de ruta del panel nuevo

Etapa autorizada el 21/10/2026. Continúa el mapa Leaflet, componentes, permisos del panel y consultas React Query existentes. No cambia Android ni las lecturas GPS originales.

## Uso

GPS tiene Seguimiento, Peajes/balanzas/radares y Mis puntos. Conserva camión, recorrido y zoom al cambiar de vista. Se puede agregar tocando el mapa o ingresando coordenadas, editar y archivar. La cuenta del camión muestra enlaces a su última ubicación en Google Maps/Apple Maps, saldo de telepeaje en UYU, movimientos, tarifas y combustible estimado.

Cada tarifa nueva conserva la anterior; los pasos guardan el nombre, precio, límite y máxima velocidad observada. Las recargas y correcciones son movimientos nuevos: no se borran cobros. Se identifica la cuenta por matrícula normalizada, o por modelo completo cuando no hay matrícula; los nombres antiguos no se unen automáticamente a una cuenta con matrícula.

## Qué significa «estimado»

El observador del historial funciona sin dejar una web abierta. Solo considera lecturas del dueño del viaje, posteriores al alta del punto, con precisión ≤30 m y ≤la mitad del radio. Exige aproximación, dos lecturas dentro y salida al lado opuesto fuera del doble del radio. Una interrupción de más de 90 segundos, cambio de segmento o edición del punto reinicia la detección. Las lecturas antiguas/repetidas no vuelven a debitar. Sin tarifa vigente se guarda el paso sin descuento. No es una conexión al operador de telepeaje: caminos paralelos, intervalos entre lecturas o carga tardía pueden requerir conciliación mediante ajustes.

Los avisos web son proximidad en línea recta con posición de menos de 30 segundos, no una ruta calculada. El GPS no prueba infracciones a 5 km/h. Avisos sonoros y funcionamiento de alertas con el teléfono cerrado necesitan la próxima etapa Android.

El tanque se calibra con litros medidos, capacidad, consumo L/100 km y umbral. Se guardan distancias y boletas de referencia: después se descuentan kilómetros GPS y se suman nuevas cargas. Una boleta corregida/eliminada, distancia reducida o carga sin litros suspende la estimación hasta revisar y recalibrar. No estima ralentí ni combustible no registrado. Boletas cargadas tardíamente pueden requerir recalibración.

## Entrega y publicación

Aplicar `0005_gps_control_ruta.sql` primero en una base de pruebas. Verificar `panel/tests/e2e/db/road.sql`, además de los permisos existentes, tipos, reglas y navegador. La migración es aditiva y tiene un trigger sobre nuevas lecturas: su prueba es obligatoria antes de producción.

Antes de producción, respaldo manual completo de estructura y datos entregado al dueño fuera del repositorio (regla del plan). Después aplicar la migración y publicar el panel. Sin la migración, las funciones nuevas muestran un error de lectura; GPS y viajes existentes siguen disponibles. No publicar el panel antes de preparar la base.

La lista `trf_panel_admins` sigue siendo quien lee y administra; ni choferes ni anónimos acceden a cuentas y puntos. El disparador usa funciones privadas con búsqueda vacía y acceso revocado. Puntos/referencias tienen auditoría privada y control de edición concurrente. Tarifas, eventos y movimientos no tienen permisos de actualización/borrado para clientes.
