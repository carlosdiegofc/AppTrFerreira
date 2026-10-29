Plan de trabajo de la plataforma (etapas, reglas y decisiones): [docs/PLAN-PLATAFORMA.md](docs/PLAN-PLATAFORMA.md).

Panel web nuevo (React + TypeScript), en la dirección principal del panel desde el 26/10/2026: [panel/README.md](panel/README.md).

# Panel web (anterior)
La carpeta [`web/`](web/README.md) tiene el panel web anterior, que queda en `/anterior/` de la misma dirección un tiempo: viajes de la app que aparecen solos para completarlos, edición y papelera, recorrido real del GPS en el mapa, seguimiento en vivo de la flota, combustible y resumen mensual. Instalación y publicación: [web/README.md](web/README.md).

# Transportes Ferreira GPS — v0.26.0

## Nuevo en v0.26.0 (leer la boleta con la foto; versionCode 39)
- **Combustible:** al sacar o elegir la foto de la boleta, la app lee litros, importe, fecha y estación y llena el formulario (decisión del 29/10/2026). Siempre revisás y confirmás antes de guardar; lo que ya escribiste no se pisa.
  - Primero la lee el teléfono, sin red y sin que la foto salga. Si no encuentra litros e importe que coincidan con el precio (hasta un 5 % de diferencia), la foto va a una función de la empresa que la lee con Claude (Anthropic). Sin señal, o sin la función habilitada, queda lo que leyó el teléfono.
  - Si litros por precio no dan el importe, lo avisa.
- No cambia lo que se guarda: no necesita migración. La función `leer-boleta` de Supabase necesita el secreto `ANTHROPIC_API_KEY`; sin él, la app sigue con la lectura del teléfono. La política de privacidad lo dice.
- Panel: Viajes tiene el filtro «Carga» (con y sin carga).

## Nuevo en v0.25.1 (Finalizar siempre a la vista; versionCode 38)
- En la pantalla del viaje, «Finalizar» queda en el panel de abajo, al lado de «Pausar viaje», sin abrir la hoja. Sigue pidiendo confirmar. El botón de la hoja se mantiene.

## Nuevo en v0.25.0 (el mapa del viaje en toda la pantalla; versionCode 37)
- **La pantalla del viaje** (decisión del 29/10/2026): el mapa ocupa la pantalla y gira con el camión, que va como una flecha. Arriba, el estado del viaje, el camión y el cartel de 90 km/h; a la derecha, los botones para girar el mapa o dejar el norte arriba, elegir mapa, satélite o tráfico, seguir el camión y ver todo el viaje.
  - Abajo, los km recorridos, la velocidad en un arco que se pone rojo pasando los 90, el tiempo en viaje y «Pausar viaje».
  - Lo demás (combustible, remito, finalizar, los datos del viaje, juegos) está en una hoja que sube deslizando hacia arriba o tocando la manija.
  - El modo sencillo tiene la misma pantalla, con los botones grandes.
- **El dueño de viaje** ve en su mapa los camiones de viaje y los choferes activos, con la velocidad de los que se mueven. Tocando un camión aparece su recorrido; tocándolo otra vez se va.
- **Flota en vivo:** el mapa ocupa media pantalla y se puede ver en pantalla completa; los camiones de viaje dicen su velocidad y muestran su recorrido al tocarlos.
- No cambia lo que la app guarda ni lo que manda: no necesita migración.

## Nuevo en v0.24.0 (tramos sin señal; versionCode 36)
- **Cuando el GPS se corta y vuelve** (decisión del 28/10/2026): si pasaron más de 90 segundos sin lecturas y el camión apareció a más de 300 m, el viaje cuenta ese tramo y la línea del mapa sigue.
  - Enseguida suma la línea recta y un 20 %. Al sincronizar pide a Google el camino por ruta entre los dos puntos y cuenta esos kilómetros, aunque el viaje ya haya terminado. Si Google no contesta, lo vuelve a pedir cada 10 minutos, y al día se queda con la recta.
  - Un corte de más de 3 horas, o un salto que un camión no puede hacer, queda sin contar y el panel pide revisarlo.
  - En los mapas el tramo va en línea punteada: por su camino estimado, o en recta mientras llega. El detalle del viaje dice cuántos kilómetros se estimaron.
  - Las lecturas del camino estimado no cuentan como pasos por peajes ni balanzas.
- **Necesita la migración 0013 en producción** antes de publicar, y la «Routes API» habilitada en Google Cloud para la llave de Android. Sin la API, los tramos se cuentan en línea recta.
- **Privacidad:** para el camino, Google recibe los dos puntos del corte, sin el chofer ni el viaje; la política lo dice.

## Nuevo en v0.23.0 (avisos; versionCode 35)
- **Avisos en el teléfono** (decisión del 28/10/2026): los calcula la app con lo que ya tiene; no se envía nada más y llegan aunque no haya señal.
  - **Papeles y services, a las 8:00:** los papeles del chofer y los de su camión que vencen en 30 días o ya vencieron, y los services del camión a 15 días o atrasados. Avisa cuando algo pasa a «por vencer» o a «vencido», no todos los días. El dueño que maneja recibe los de toda la flota. Los services por kilómetros avisan en el panel, que conoce todos los viajes del camión.
  - **Viaje abierto:** «¿Te olvidaste de finalizar el viaje?» a las 14 horas en curso, o con 2 horas detenido sin pausar.
  - **Boleta:** al finalizar un viaje sin boletas, pregunta «¿Cargaste combustible en este viaje?», con el botón para cargarla.
  - **En Mi cuenta,** un interruptor para cada tipo de aviso, y el aviso de si las notificaciones están apagadas en el teléfono.
- **Sin cambios en lo que se guarda o se envía.**

## Nuevo en v0.22.0 (el diseño del panel, y más fluida; versionCode 34)
- **La app se ve como el panel web** (decisión del 28/10/2026): la misma habitación desenfocada de fondo, de día o de noche según el teléfono, con tarjetas de vidrio encima, botones redondeados y el azul del logo.
  - Arriba, una barra flotante con el título y la flecha para volver; abajo, la barra de Inicio, Viajes, Combustible y Más, con la pestaña elegida resaltada.
  - En el viaje en curso y en el modo sencillo las tarjetas son casi opacas, para leerlas de un vistazo.
  - El modo sencillo tiene los mismos botones grandes, en los mismos lugares.
- **Más fluida:**
  - Las pantallas entran deslizándose desde la derecha al avanzar y desde la izquierda al volver; las pestañas de abajo cambian en el lugar.
  - Al elegir una opción, la pantalla queda donde estaba, sin volver arriba.
  - Botones y tarjetas se achican apenas al tocarlos; iniciar y finalizar el viaje vibran un poco.
  - La pastilla de la opción elegida se desliza a la nueva, y la velocidad del viaje sube y baja sin saltos.
  - Para elegir camión, carga, cliente o destino se abre una hoja desde abajo, en lugar de una ventana.
  - Con las animaciones apagadas en el teléfono, todo cambia al instante.
- **Sin funciones nuevas ni cambios en lo que se guarda o se envía.**
- **Para las capturas:** la versión de prueba (nunca la de Google Play) abre cada pantalla con datos inventados y sin conexión, y el emulador de GitHub saca una captura de cada una, en claro y en oscuro (`.github/scripts/capturas_app.py`).

## Nuevo en v0.21.0 (el mapa de Google; versionCode 33)
- **Los mapas de la app son de Google** (decisión del 26/10/2026): el del viaje en curso, el recorrido de cada viaje (también en pantalla completa) y el de la flota del dueño.
  - Arriba de cada mapa se elige «Mapa» (las calles de Google) o «Satélite» (las fotos con las rutas y los nombres), y «Tráfico» muestra el tránsito de ahora. La elección queda guardada en el teléfono.
  - De noche, con el teléfono en modo oscuro, las calles vienen con los colores nocturnos de Google.
  - Lo que se ve es lo mismo que antes: el recorrido por tramos, el camión que sigue el mapa con «Seguir el camión» y «Ver todo», el camino al destino con cuánto falta, y los camiones del dueño que se deslizan a su posición nueva.
- **Sin costo:** el mapa de Google para Android no se paga.
- **La clave** entra al compilar, desde el secreto `GOOGLE_MAPS_ANDROID_KEY` de GitHub ([docs/GOOGLE-MAPS.md](docs/GOOGLE-MAPS.md)). Sin la clave, o en un teléfono sin Google Play services, la app sigue con su mapa de siempre.

## Nuevo en v0.20.0 (combustible: «¿Llenaste el tanque?»; versionCode 32)
- **Cargar combustible** pregunta si llenaste el tanque. Las opciones son «No, cargué una parte», que viene marcada, y «Sí, lo llené». La respuesta llega al panel con el resto de la boleta.
- **El panel** la usa para estimar cuánto gasoil tiene cada camión:
  - Desde una carga con el tanque lleno, arranca de lleno.
  - Le resta lo que gasta según los kilómetros del GPS y el consumo de ese camión.
  - Avisa en Inicio y en Combustible cuando le queda poco.
- **Mi combustible y Combustible de la flota** muestran «Tanque lleno» en las cargas que lo llenaron, o en las que la oficina marcó así en el panel.
- Necesita la migración `0009` del panel, aplicada en la base el 24/10/2026. Sin la columna nueva, las boletas de esta versión no se podrían enviar.

## Nuevo en v0.19.0 (Juegos: truco uruguayo contra el teléfono; versionCode 31)
- **Truco uruguayo** en Juegos, contra el teléfono, con las reglas decididas el 21 y el 22/10/2026:
  - A 30 puntos: 15 malas y 15 buenas. El tanteador los muestra en palabras y con fósforos, como se anotan en la mesa.
  - La muestra y sus piezas (el 2, 4, 5, 11 y 10 del palo; si la muestra es una de ellas, el 12 toma su lugar), con una estrella en cada pieza. Después, el 1 de espada, el 1 de basto, el 7 de espada y el 7 de oro.
  - Envido, real envido y falta envido: la falta vale lo que le falta al que va ganando para llegar a 30. La sota de la muestra vale 27, como el caballo. El envido está primero: se puede cantar en vez de responder el truco.
  - Flor obligatoria (3 puntos), con contraflor (6), contraflor al resto y «con flor me achico» (4 para el otro).
  - Truco, retruco y vale cuatro, y la posibilidad de irse al mazo (pide confirmación).
- **La mesa:** el tanteador, las cartas del teléfono boca abajo (al terminar la mano se dan vuelta), la muestra y las tres rondas con quién ganó cada una, lo que cantó cada uno, los tantos y los puntos de la mano, y tus cartas con tus tantos. Una carta se elige con un toque y se juega con el segundo. Los cantos y las respuestas que corresponden aparecen como botones. Las reglas de la mesa están al pie de la pantalla.
- **El rival** (`TrucoAi.kt`): canta el envido por sus tantos y el truco por lo que estima ganar, jugando muchas veces el resto de la mano con las cartas que vos podrías tener (solo mira sus cartas, la muestra y lo que ya se jugó). A veces miente.
- **Las cartas** son dibujos propios de la app (`TrucoArt.kt`): espada azul, basto verde, oro dorado y copa roja, con el número grande en la esquina.
- Igual que el ajedrez: se juega con el camión parado, la partida queda solo en el teléfono (una por cuenta) y se sigue donde quedó.

## Nuevo en v0.18.0 (Juegos: ajedrez para las esperas; versionCode 30)
- **Juegos:** para pasar el rato mientras se espera la carga. Están en el Inicio de los dos modos, en el viaje en curso y en la Flota en vivo de la cuenta de la empresa; los ven todas las cuentas.
- **Ajedrez:** contra el teléfono, en nivel fácil, medio o difícil, con blancas, negras o al azar; o entre dos personas, pasándose el teléfono. Tiene todas las reglas: enroque, captura al paso, coronación (se elige la pieza), jaque, mate, ahogado y tablas por falta de material, por 50 jugadas y por triple repetición. Se puede deshacer y girar el tablero. Las piezas son dibujos propios de la app.
- **Con el camión parado:** los juegos se abren sin viaje, con el viaje pausado o con el camión detenido según el GPS (una lectura de los últimos 2 minutos, a menos de 5 km/h). Mientras se juega, la app lo vuelve a mirar cada 5 segundos: si el camión arranca, la partida se guarda y se cierra, y vuelve la pantalla del viaje.
- **La partida queda solo en el teléfono**, una por cuenta, y se sigue donde quedó. No se envía nada al panel ni a la base.
- Vienen después el truco uruguayo (en la v0.19.0) y las partidas en línea con los compañeros ([docs/PLAN-PLATAFORMA.md](docs/PLAN-PLATAFORMA.md)).

## Nuevo en v0.17.3 (Rendimiento cuenta cada boleta en su fecha; versionCode 29)
- **Rendimiento:** cada boleta de combustible cuenta en el mes de su fecha, o de la fecha que le corrigió el panel, igual que en Combustible y en Métricas del panel. Antes contaba en el mes en que llegó a la base, así que una boleta mandada tarde o con la fecha corregida podía caer en otro mes.
- **Mi combustible y Combustible de la flota** ya ponían cada boleta en su fecha; ahora usan exactamente la misma regla que Rendimiento y el panel.
- Lo que se envía al panel no cambia.

## Nuevo en v0.17.2 (formularios sin autocompletar y kilómetros en los services; versionCode 28)
- **Formularios:** el autocompletado del teléfono ya no llena los campos de los formularios ni el buscador. Antes llenaba «Otro tipo» de un service o de un documento con el correo de la cuenta, y así quedaba guardado. El ingreso (correo y contraseña) lo sigue usando.
- **Mantenimiento:** el panel ahora agenda services por kilómetros. La app los muestra en la lista y en el detalle: «a los 412.500 km» para uno por hacer y «cada 10.000 km» para uno que se repite. Editar un service en la app no cambia esos kilómetros. Los avisos por kilómetros, que usan el kilometraje estimado con el GPS, están en el panel.
- **Documentos:** el panel ya les sube su archivo (foto o PDF). La app todavía no los muestra; llegan en una versión próxima. Si se borra en la app un documento con archivo, el archivo queda en la carpeta privada, sin usar.
- Lo que se envía al panel no cambia (migración `0004` del panel: solo agrega columnas y la carpeta de los archivos).

## Nuevo en v0.17.1 (combustible en el modo sencillo; versionCode 27)
- **Modo sencillo:** el botón **Cargar combustible** está en el Inicio y en el viaje en curso. Con un viaje en curso, la app pregunta si la carga es del viaje o sin viaje; sin viaje, abre la carga directamente. Es la misma pantalla y el mismo registro que en el modo normal.
- «Fuera de viaje» pasa a decir **Sin viaje**, como el panel.
- En el panel, las boletas se agrupan por estación, con la cuenta corriente de cada una; la oficina corrige las boletas sin tocar lo que cargó el chofer (migración `0003`). La app las sigue leyendo igual: las correcciones del panel son las que cuentan en Mi combustible y en Combustible de la flota.
- Lo que se envía al panel no cambia.

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
- **Versión de Google Play optimizada (R8):** Play Console avisó que el código casi no estaba ofuscado («La optimización del código DEX está por debajo de nuestro umbral»: ofuscación 1 % en la 0.16.0). Desde esta versión, el paquete de Google Play se arma con R8: el código sale optimizado y ofuscado, y los recursos que no se usan quedan afuera. La app hace lo mismo que antes. Las fallas que lleguen a Play Console se siguen leyendo con los nombres reales, porque el mapa para traducirlas va dentro del `.aab`. Cada compilación de GitHub Actions instala esa misma versión en un emulador y prueba que abra en el ingreso, la política de privacidad, girar la pantalla, un ingreso sin conexión y volver a abrirla, sin llegar nunca a la base real. El viaje con GPS, las fotos y la sincronización se prueban en un teléfono antes de lanzarla, como dice la [guía de Google Play](docs/google-play/GUIA.md#7-actualizaciones).
- Al subirla a Google Play, en «Seguridad de los datos» la ubicación (precisa y aproximada) tiene que figurar como recopilada para funciones de la app, también con la app abierta fuera de un viaje, y se suman las interacciones con la app (el aviso de «chofer activo»).
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
