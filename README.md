# Transportes Ferreira GPS — v0.12.1

## Nuevo en v0.12.1
- Más pruebas automáticas del cálculo de kilómetros y del recorrido local. Sin cambios visibles para el chofer.

# Transportes Ferreira GPS — v0.12.0

## Nuevo en v0.12.0 (diseño)
- Logo de TR Ferreira en el encabezado de todas las pantallas, con transición suave al cambiar de pantalla.
- Tarjetas con sombra y bordes más redondeados; botones con degradado y efecto al tocar.
- Accesos con íconos (combustible, historial, remitos, batería) y flecha.
- Tarjetas principales de Inicio y Viaje con degradado azul; kilómetros y km/h con números más grandes.
- Estado del viaje (en curso / pausado) en una etiqueta destacada.
- Solo cambia el aspecto: no cambia nada de lo que se guarda ni de lo que se envía al panel.

## Nuevo en v0.11.1 (GPS más robusto)
- Aviso en pantalla y en una notificación si el GPS del teléfono está apagado, falta el permiso o pasan más de 2 minutos sin señal.
- Si el GPS deja de entregar posiciones, la app lo reinicia sola (como máximo una vez por minuto).
- Si Android detiene el servicio en segundo plano, la app lo informa en lugar de cerrarse.
- Botón «Evitar cortes del GPS» en el viaje en curso para excluir la app de la optimización de batería (aparece solo si todavía no está excluida).
- La app ya no espera una posición «perfecta» para empezar a registrar. Los filtros de precisión y de saltos imposibles se mantienen.
- No cambia nada de lo que se envía al panel.

# Transportes Ferreira GPS — v0.11.0

## Nuevo en v0.11.0
- Mapa en vivo en la pantalla del viaje en curso: muestra el recorrido, sigue al camión y permite cambiar entre Rutas y ciudades, Relieve y Satélite + rutas.
- Si el viaje tiene destino elegido con la búsqueda, se dibuja la ruta por carretera hasta el destino con la distancia y el tiempo aproximados (requiere conexión; usa el servicio público OSRM).
- Botones «Centrar» (vuelve a seguir al camión) y «Ver todo» (muestra el recorrido completo y el destino).
- Kilómetros y km/h siguen visibles arriba del mapa. El recorrido del mapa se guarda además en el teléfono, por lo que se recupera al reabrir la app.

## Nuevo en v0.10.1
- La vista Satélite + rutas superpone carreteras y nombres de lugares sobre las imágenes.
- Las capas de referencia se retiran al volver a Rutas y ciudades o Relieve.

## Funciones conservadas
- En el historial de viajes, el mapa se puede abrir en pantalla completa.
- Vistas del mapa: Rutas y ciudades, Relieve, Satélite/naturaleza. Son fondos cartográficos; no representan tráfico ni imágenes en vivo.
- Los clientes y cargas habituales se configuran en el nuevo menú Clientes del panel web.
- En la app, Mi cuenta → Actualizar y enviar pendientes descarga el catálogo. También se actualiza al abrir la app con conexión.
- Al seleccionar un cliente en Nuevo viaje, se muestran sus cargas habituales. Si no tiene cargas configuradas, se mantiene el catálogo general. Se conserva el inicio sin datos obligatorios.
- Los importes facturados y datos de contacto privados permanecen en el panel de gestión; no se distribuyen a los choferes.
- La app conserva el acceso al historial propio. Esta versión no agrega permisos para ver viajes de otros choferes.

## Diseño por pasos
- Inicio con tres accesos: nuevo viaje, combustible e historial. Cuenta/sincronización en su propia pantalla.
- Nuevo viaje: 1) camión y tipo; 2) destino, cliente y carga; 3) remitos. Se puede saltar directamente entre pasos.
- «Iniciar viaje ahora» permanece fijo abajo en los tres pasos. Ningún dato comercial es obligatorio.
- Viaje en curso: kilómetros y velocidad separados, pausa, combustible, remitos y finalizar siempre disponible abajo.
- Combustible: primero foto opcional, después estación/fecha y cantidades opcionales.
- Remitos: salida/llegada, número y foto; carga/kilos en un segundo paso opcional. Se puede guardar desde cualquiera de los dos pasos.
- La versión instalada aparece en Inicio y Mi cuenta para identificar el APK.
- Los datos escritos se mantienen al cambiar de paso y al volver de cámara/galería. Los borradores sobreviven la recreación de la pantalla mediante el estado Android; no son registros guardados hasta pulsar Iniciar/Guardar.

## Actualizar el código en GitHub
1. Descomprimir este ZIP en una carpeta nueva.
2. En el archivo app/build.gradle.kts comprobar versionCode = 11 y versionName = "0.10.1".
3. Subir el contenido a la raíz del repositorio, incluyendo app y .github. La carpeta APK no es necesaria para compilar.
4. Comprobar en GitHub que app/build.gradle.kts muestra 0.10.1. Cambiar solo el nombre del artefacto no actualiza la app.
5. Descargar el artefacto de la ejecución MÁS RECIENTE asociada a la subida. El workflow incluido toma el nombre de versión del código.
6. Dentro de la app, verificar «v0.10.1» en Inicio/Mi cuenta.

## Funciones conservadas de v0.8
- Ningún campo del formulario bloquea el inicio del viaje: camión, destino, cliente, carga, kilos y remitos son opcionales. Sin permiso GPS se guarda el viaje y se puede activar la ubicación después.
- Remitos de salida y llegada: número, foto de cámara/galería y datos opcionales. Se pueden agregar varios antes, durante o después del viaje.
- Historial propio por chofer, aunque cambie de camión; mapa del recorrido registrado, origen y llegada GPS. Destino previsto opcional con búsqueda.
- Combustible dentro o fuera del viaje: fecha y estación, litros y total opcionales, foto opcional. La estación es obligatoria al guardar combustible, nunca para iniciar un viaje.
- Catálogos de clientes, cargas y estaciones desde el panel. Los cambios completados en la web se consultan al actualizar el historial.

## Funciones conservadas
- Login con correo y contraseña. Sesión cifrada con Android Keystore; no guarda la contraseña.
- Inicio con nombre del chofer, selección del camión y viaje con carga o sin carga / retorno vacío.
- Pantalla del viaje con kilómetros GPS, pausar/reanudar, finalizar y adjuntar boletas.
- Cámara en resolución completa o foto de la galería, vista previa y guardado por viaje.
- Envío al panel: Combustible → boleta de App GPS → Editar carga. Ahí se completan litros, importe, estación y demás datos.
- Los registros se guardan primero en el teléfono; los envíos pendientes se reintentan con conexión. No borres los datos de la app ni la desinstales con registros pendientes.
- Pausar suspende el GPS y los kilómetros. Reanudar no suma el desplazamiento de la pausa. El viaje se conserva tras cerrar/reabrir la app. Android puede interrumpir servicios por batería o cierre forzado: reabrí la app para recuperar el viaje.
- Los kilómetros son una estimación GPS, no una lectura del odómetro del camión. Se filtran posiciones imprecisas, antiguas y saltos imposibles. Los tramos sin lecturas no se inventan.

## Instalar / actualizar
Abrí esta carpeta en Android Studio, sincronizá Gradle y compilá con Java 17 y Android SDK 35. El proyecto incluye Gradle Wrapper 8.9. En Windows: `gradlew.bat assembleDebug`; en Linux/macOS: `./gradlew assembleDebug`.

Para actualizar la app que ya está instalada, compilá con la MISMA firma/keystore que utilizaste para instalarla. El APK de prueba adjunto usa una firma de desarrollo de este entorno; Android puede rechazarlo como actualización si la firma anterior es distinta. No desinstales la app anterior para resolver esto si tiene boletas pendientes: usá la firma anterior.

`APK/TransportesFerreiraGPS-v0.10.1-prueba.apk` es el APK compilado de prueba, Android 8 o posterior. Para distribución definitiva usá tu propia firma de publicación. No se incluye una clave privada de firma en este proyecto.

## Panel
https://transportes-ferreira-gestion.carlosdiegofc2001.chatgpt.site/
La base y el panel se actualizaron para recibir boletas y múltiples remitos por viaje. Las fotos son privadas; se abren con acceso autenticado. Cada boleta conserva un identificador estable del viaje, incluso antes de que este finalice.

Al finalizar el viaje, aparece en Viajes para completar los datos pendientes. La distancia y la condición sin carga llegan desde la app. Las boletas aparecen en Combustible sin importes inventados ni OCR automático.

Las boletas locales de versiones anteriores a v0.7 no tenían identificador del viaje y no se vinculan automáticamente. Los archivos antiguos no se eliminan durante la actualización.

## Verificación
La v0.10 agrega mapas ampliables con tres vistas y clientes con cargas habituales. El panel se actualizó con mapas y fichas de clientes compatibles con esta versión. La v0.9 de base se verificó con compilación, 4 pruebas unitarias y lint sin errores. La v0.10 compiló correctamente y pasó sus 4 pruebas unitarias existentes; no se ejecutó un teléfono/emulador en este entorno para verificar visualmente todas las pantallas.

### Verificación previa de la base funcional
- Compilación Android y APK: correcta.
- Pruebas unitarias: desplazamiento, pausas, ruido GPS, posiciones antiguas y saltos imposibles.
- Panel: compilación y pruebas de importación, asociación de boletas, distancia y estados.
- Base: prueba transaccional de inserción/lectura del chofer, lectura/archivo del administrador y aislamiento entre usuarios; sin dejar registros de prueba.

Pendiente: prueba en un teléfono físico con un viaje real, permisos, cámara/galería y pérdida/recuperación de conexión. No se afirma haber realizado esa prueba.
