Plan de trabajo de la plataforma (etapas, reglas y decisiones): [docs/PLAN-PLATAFORMA.md](docs/PLAN-PLATAFORMA.md).

Panel web nuevo (React + TypeScript), en construcción al lado del actual: [panel/README.md](panel/README.md).

# Panel web (nuevo)
La carpeta [`web/`](web/README.md) tiene el panel web centralizado: viajes de la app que aparecen solos para completarlos, edición y papelera, recorrido real del GPS en el mapa, seguimiento en vivo de la flota, combustible y resumen mensual. Instalación y publicación: [web/README.md](web/README.md).

# Transportes Ferreira GPS — v0.17.1

## Nuevo en v0.17.1 (ingreso por nombre; versionCode 27)
- La app y ambos paneles permiten ingresar con el nombre de usuario de la cuenta corporativa o con el correo completo.
- El nombre se convierte internamente al correo corporativo existente; conserva el mismo usuario, viajes y permisos. No se cambia la contraseña desde el cliente.
- Las contraseñas mantienen sus espacios y mayúsculas. Los cambios de contraseña se administran en Supabase, nunca en el repositorio.


## Nuevo en v0.17.0 (GPS en vivo más rápido y chofer activo; versionCode 26)
- **Viaje en curso:** el teléfono toma una posición cada 2 segundos (antes cada 3 a 5) y la manda sola y enseguida, sin esperar al resto de lo que tiene para enviar (el viaje, el recorrido, las fotos). Los mapas en vivo del panel y de la app la reciben en unos segundos.
- El recorrido que se guarda en el panel lleva un punto cada 5 segundos más o menos mientras el camión anda y uno cada 30 segundos mientras está parado (antes, un punto por lectura aunque estuviera parado), y se manda en una sola tanda cada 10 segundos. Así la base y los datos del celular no crecen con las lecturas más seguidas. Al pausar y al finalizar se agrega la última lectura, para que el recorrido llegue hasta donde quedó el camión. El mapa del propio viaje en el teléfono sigue dibujando todas las lecturas.
- **Trazado más limpio:**
  - En cada giro, el recorrido guarda la lectura donde cambió el rumbo y la anterior, que es donde el camión dobló. Así la línea dobla en la esquina en vez de cortar por la manzana.
  - También guarda la lectura de donde el camión para.
  - Mientras está parado, guarda solo lecturas buenas, de menos de 15 m de error, a menos de 12 m de donde paró. La parada termina cuando el camión pasa los 8 km/h o se aleja más de 50 m, descontando el error de la lectura, aunque la lectura no traiga velocidad.
  - Así ni el temblor del GPS ni el chofer caminando con el teléfono dibujan una «estrella» en el mapa. Una lectura descartada por eso tampoco entra al pausar o finalizar.
  - Al empezar o reanudar el viaje con el camión quieto, el recorrido arranca con la primera lectura buena, porque las primeras del GPS suelen ser imprecisas.
  - Si Android reinicia el GPS en medio del viaje, sigue sabiendo dónde estaba parado el camión: ese dato se guarda con el viaje en el teléfono y no se envía.
  - Con el viaje real que mostraba la estrella, de 1.860 puntos quedan 412, y la parada queda limpia. Los viajes ya guardados no cambian.
- Los kilómetros y la última lectura del viaje se suben cada 15 segundos; pausar, reanudar y finalizar se mandan en el momento.
- **Flota en vivo (dueño):** las posiciones se actualizan solas cada 5 segundos (antes cada 2 minutos) sin volver a armar el mapa: cada camión se desliza hasta su posición nueva, en vez de saltar, y el mapa queda donde lo dejó el dueño. Si el teléfono tiene activado «Quitar animaciones», o si el camión aparece a más de 3 km (volvió la señal), salta directo. Quién está de viaje se lee cada minuto, y un viaje que empieza o termina mientras llegan posiciones nuevas se ve igual. La posición sale de la tabla de posición en vivo, la misma que lee el panel.
- **Chofer activo:** al abrir la app y cada 5 minutos mientras está abierta, el teléfono avisa al panel que el chofer está activo, con la versión de la app y el camión guardado. Si no hay viaje, está dado el permiso de ubicación y el chofer lo aceptó, el aviso lleva dónde está el teléfono, tomado una sola vez y con la precisión que permite ahorrar batería. La app se lo pregunta una vez a cada cuenta en el inicio (y en el aviso antes del permiso de ubicación), así otro chofer que entra en el mismo teléfono decide por sí mismo, y se cambia en Mi cuenta › GPS y privacidad. Si la app se cierra mientras busca la posición, no manda nada; si mientras tanto empieza un viaje o el chofer apaga la opción, el aviso sale sin la posición; un aviso que no sale se reintenta a los 30 segundos. Con la app cerrada no se envía nada, y fuera de un viaje la app nunca usa la ubicación en segundo plano. La cuenta del panel de flota no avisa. En «Flota en vivo», el dueño ve la lista «Choferes con la app»: quién está en viaje, quién está activo y cuándo abrió la app cada uno, con la versión; el chofer activo sin viaje aparece en el mapa como un punto azul donde está el teléfono, con la misma regla que el panel. La política de privacidad lo explica (Mi cuenta › Privacidad).
- Lo que se envía al panel: las mismas tablas y columnas de antes, con lecturas más seguidas en la posición en vivo y menos puntos de recorrido cuando el camión está parado, más la tabla nueva del aviso de «chofer activo» (migración `0002`, aplicada en la base el 19/10/2026).
- Al subirla a Google Play, en «Seguridad de los datos» la ubicación (precisa y aproximada) tiene que figurar como recopilada para funciones de la app, también con la app abierta fuera de un viaje.
- Incluye todo lo de la v0.16.3, que no se subió a Google Play.

## Nuevo en v0.16.3 (correcciones del menú del dueño)
- **Flota en vivo:** la posición de un camión en viaje se toma también de las lecturas de choferes con versiones viejas de la app, que no las guardan con el viaje; antes ese camión figuraba «sin señal». Un camión que se usa poco sigue mostrando su último chofer y dónde terminó, aunque la flota haya hecho más de 100 viajes desde entonces.
- **Flota en vivo:** un camión que está en viaje ya no aparece dos veces (una en ruta y otra «sin viaje») cuando el viaje se guardó con un nombre viejo del camión, como «Ford Cargo». El camión se reconoce igual que en Rendimiento: por la matrícula o, si no tiene, por el modelo, cuando ese modelo es de un solo camión del catálogo. Lo mismo para mostrar el último chofer y el lugar de llegada de un camión sin viaje.
- **Combustible › Este mes:** los totales de litros y de gasto suman todas las cargas del mes. Antes contaban solo las 50 más recientes, así que en una flota con más cargas el total quedaba corto hasta tocar «Cargar más».
- **Combustible:** el total gastado muestra los pesos y, en otro renglón, los dólares; antes las cargas en dólares no se sumaban. Las correcciones hechas en el panel (litros, monto, moneda, fecha) se toman también en cargas viejas que las guardaron como texto, y los números escritos a la uruguaya («30.000», «1.234,5») se leen igual que en Rendimiento.
- **Mapas:** una lectura sin posición (0,0) ya no se dibuja ni lleva el mapa de la flota o del viaje al medio del océano.
- **Mantenimiento y Documentos:** se cargan todos los registros, de a páginas. Antes se leían los últimos 500, y un service viejo todavía pendiente podía quedar afuera de la lista y de los avisos.
- **Viajes:** el destino, el cliente y la carga se ven también en viajes viejos que guardaron esos datos como texto.
- Al girar el teléfono, o si Android cierra la app en segundo plano, se vuelve a la misma pantalla (Mis viajes, combustible, detalle de un viaje, Mi cuenta, Rendimiento, Flota en vivo) con los mismos filtros, en lugar del Inicio.
- **Documentos (dueño):** al agregar un documento, además de «Mío» y «De un camión», está **De un chofer**: se elige el chofer de la lista (los que tienen viajes o documentos) y el documento queda a su nombre.
- Lo que se envía al panel no cambia, salvo que un documento cargado por el dueño ahora puede quedar a nombre de otro chofer.

## Nuevo en v0.16.2 (confirmación al iniciar en modo sencillo)
- **Modo sencillo:** al tocar **INICIAR VIAJE** el viaje ya no empieza solo. En el lugar del botón aparece la pregunta **¿Iniciar el viaje?** con el camión y dos botones: **SÍ, INICIAR** y **Cancelar**. El viaje recién empieza al confirmar, para que no arranque por un toque sin querer. El gesto «atrás» también cancela, y un toque doble sobre el botón no cuenta como confirmación.

## Nuevo en v0.16.1 (corrección)
- Las pantallas ya no quedan tapadas por la barra de estado ni por los botones de navegación del teléfono. Pasaba en toda pantalla que se abría después de la primera (por ejemplo el Inicio después de elegir el modo, o un viaje recién iniciado): el encabezado quedaba debajo de la hora y la barra de abajo o el botón de finalizar, debajo de los botones del teléfono.
- Los nombres de la barra de abajo (Inicio, Viajes, Combustible, Más) quedan centrados debajo de su ícono; antes salían corridos a la izquierda. Lo mismo en los botones Combustible, Remito y Pausar del viaje en curso y en Sacar foto y Galería.

## Nuevo en v0.16.0 (modo sencillo, modo normal y menú del dueño)
- Después de ingresar, cada chofer elige cómo usar la app: **modo sencillo** o **modo normal**. La elección queda guardada en el teléfono para esa cuenta; a quien ya tenía la sesión abierta se le pregunta una vez al abrir la app. La cuenta de la empresa sigue entrando directo al panel de flota.
- **Modo sencillo:** dos pantallas con botones grandes. En Inicio, el camión asignado y el botón **INICIAR VIAJE**; en Viaje en curso, el tiempo, el mapa, la velocidad, la distancia y el botón **FINALIZAR VIAJE**, que pide confirmar en la misma pantalla.
- En modo sencillo el chofer no completa nada: el camión es el último que usó (si el teléfono no tiene ninguno guardado, el de su último viaje; solo si no hay ninguno se pregunta una vez), y la hora, el recorrido, los kilómetros y el lugar de salida y de llegada los registra el GPS. El viaje llega al panel como un inicio rápido «con carga», para completar ahí cliente, carga, kilos y remitos.
- **Modo normal:** el Inicio pasa a ser una lista con íconos de color (Iniciar viaje, Mis viajes, Combustible, Remitos y fotos, Documentos, Mantenimiento, Mi cuenta). «Mi combustible» sigue en la barra de abajo. Mis viajes suma el filtro Todos / Activos / Finalizados y el botón «Iniciar viaje» de Datos del viaje es verde.
- El modo se cambia desde **Mi cuenta › Modo de uso** (normal) o con **Cambiar de modo** (sencillo).
- **Dueño que también maneja (cuenta de Luis):** entra igual que un chofer —elige el modo e inicia y finaliza sus viajes— y suma el **Menú del dueño**: el botón **Menú** arriba a la derecha en sus pantallas de inicio y de viaje, y un botón o renglón con ese nombre en el Inicio. Se abre desde abajo con Flota en vivo, Viajes de la flota, Rendimiento, Combustible de la flota, Mantenimiento y Documentos (en modo sencillo, también Cambiar de modo). Cada pantalla vuelve al Inicio con la flecha; «Viajes» y «Combustible» de la barra de abajo siguen siendo los suyos.
- **Rendimiento** (nuevo; también está en el panel de flota de la cuenta de la empresa): por mes, para toda la flota y **por camión** o **por chofer**: viajes, kilómetros del GPS, kilómetros con carga y sin carga, litros y gasto de combustible, consumo (L/100 km y km por litro, si hubo 300 km o más en el mes) y, cuando están cargados en el panel web, kilómetros facturables, kilos e importes en pesos y en dólares por separado. Suma con las reglas del resumen del panel web: lo que se completó en el panel manda y los viajes eliminados no cuentan. Los viajes guardados con un nombre viejo del camión («Ford Cargo», «Mercedes-Benz 1618») se suman al camión del catálogo, y los camiones sin viajes ni cargas figuran como «Sin movimientos en el mes».
- Al abrir un viaje desde Flota en vivo, la flecha vuelve al mapa de la flota.
- No cambia nada de lo que se guarda ni de lo que se envía al panel.

## Nuevo en v0.15.1
- Nombre de paquete para Google Play: `com.transportesferreira.app` (antes `uy.transportesferreira.gps`). Es una app nueva para Android: se instala aparte de la anterior y pide iniciar sesión otra vez. El código sigue en el paquete `uy.transportesferreira.gps`.

## Nuevo en v0.15.0 (Google Play)
- Lista para Google Play: apunta a Android 16 (API 36) y usa el gesto «atrás» predictivo.
- Ícono propio con el logo TR, también en los íconos temáticos de Android 13 o posterior.
- Antes de pedir la ubicación, la app explica para qué la usa. Ya no declara ubicación en segundo plano: el GPS del viaje sigue funcionando con la pantalla apagada gracias al servicio en primer plano y su notificación fija.
- «Evitar cortes del GPS» abre los ajustes de batería de la app en lugar de pedir la excepción directa, que Google Play restringe.
- Política de privacidad dentro de la app (pantalla de ingreso y Mi cuenta › Privacidad), con el mismo texto publicado en [docs/legal/privacidad.md](docs/legal/privacidad.md).
- GitHub Actions arma también el paquete para Google Play (.aab), firmado con la llave de subida guardada en los secretos del repositorio. Pasos para publicar: [docs/google-play/GUIA.md](docs/google-play/GUIA.md).

## Nuevo en v0.14.0
- Mantenimiento de los camiones (services hechos y pendientes) y vencimientos de documentos de choferes y camiones.

## Nuevo en v0.13.0
- Nuevo diseño: encabezado azul marino, tarjetas, barra inferior y modo oscuro. Panel de flota en vivo para las cuentas de los dueños.

# Transportes Ferreira GPS — v0.12.2

## Nuevo en v0.12.2
- Une la versión de compatibilidad con la web (0.12.1, rama de Codex) con las pruebas automáticas del cálculo de kilómetros y del recorrido local.
- Más pruebas: acumulación de kilómetros, saltos de tiempo, límites de precisión, velocidad imposible, coordenadas inválidas y archivo de recorrido del mapa.
- Sin cambios visibles para el chofer.

## Nuevo en v0.12.1 (compatibilidad con la web)
- Los adjuntos que fallan no bloquean el envío del recorrido: quedan pendientes y se reintentan.
- Remitos previos al viaje recuperables con identificador estable; fotos asociadas al formulario original.
- Moneda de combustible y estaciones fuera del catálogo.
- Retorno vacío envía carga y kilos vacíos.
- Las posiciones GPS imposibles se descartan también en el mapa y no se suben.
- Detalle del acuerdo app/web en docs/APP-WEB-CONTRACT.md.

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
Abrí esta carpeta en Android Studio, sincronizá Gradle y compilá con Java 17 y Android SDK 36. El proyecto incluye Gradle Wrapper 8.11.1. En Windows: `gradlew.bat assembleDebug`; en Linux/macOS: `./gradlew assembleDebug`.

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
