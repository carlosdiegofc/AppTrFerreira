# Publicar Transportes Ferreira GPS en Google Play

Guía paso a paso para la primera publicación y para las actualizaciones. Lo que está en recuadros grises se copia y se pega tal cual (cada recuadro tiene un botón para copiar).

## Resumen

1. Crear la cuenta de desarrollador de Google Play (pago único de USD 25).
2. Cargar la llave de subida en GitHub (una sola vez).
3. Crear la app en Play Console y completar la ficha y las declaraciones.
4. Subir el paquete `.aab` a **Prueba interna** e invitar a los choferes.
5. Cada chofer instala la app desde Google Play. Las actualizaciones llegan solas.

Para una empresa alcanza con la **prueba interna**: admite hasta 100 personas, las versiones están disponibles en minutos y no exige el requisito de 12 testers que Google pide para publicar a todo el público.

## 1. Cuenta de desarrollador

- Entrá a <https://play.google.com/console/signup> con la cuenta de Google de la empresa.
- Tipo de cuenta: **Personal** es lo más rápido. La cuenta de **Organización** pide un número D-U-N-S y tarda más.
- Nombre de desarrollador (se ve en Google Play):

```text
Transportes Ferreira
```

- Google pide verificar la identidad con un documento, un número de teléfono y un teléfono Android con la app **Google Play Console** instalada. Pago único: USD 25. La verificación puede tardar unos días.

## 2. Llave de subida en GitHub (una sola vez)

Claude te pasó la carpeta `llave-google-play` con estos archivos:

- `ANDROID_UPLOAD_KEYSTORE.txt` y `ANDROID_UPLOAD_PASSWORD.txt`: los dos secretos para GitHub.
- `llave-subida.p12` y `certificado-subida.pem`: copia de respaldo de la llave.
- `cuenta-de-prueba-para-google.txt`: usuario y contraseña para los revisores de Google (paso 3).

Pasos:

1. Abrí <https://github.com/carlosdiegofc/AppTrFerreira/settings/secrets/actions/new>.
2. En **Name** escribí `ANDROID_UPLOAD_KEYSTORE`; en **Secret** pegá todo el contenido de `ANDROID_UPLOAD_KEYSTORE.txt`. Tocá **Add secret**.
3. Repetí con **Name** `ANDROID_UPLOAD_PASSWORD` y el contenido de `ANDROID_UPLOAD_PASSWORD.txt`.
4. Guardá la carpeta en un lugar privado (por ejemplo, tu Google Drive). **No la subas al repositorio: es público.** Si la llave se pierde, Google permite reemplazarla desde Play Console, pero tarda unos días.

Desde ese momento, cada compilación de GitHub Actions deja dos archivos descargables:

- `Transportes-Ferreira-GPS-v…`: el APK de prueba de siempre.
- `Google-Play-Transportes-Ferreira-GPS-v…`: adentro está `app-release.aab`, el archivo que se sube a Google Play.

Para generarlo apenas cargues los secretos: **Actions › Crear APK de Android › Run workflow**, elegí la rama `claude/apptrferreira-g1agmt` y tocá **Run workflow**. Cuando termine en verde, abrí esa ejecución y descargá `Google-Play-…` en **Artifacts** (baja un `.zip`; adentro está el `.aab`).

## 3. Crear la app en Play Console

**Crear app**:

- Nombre de la app: `Transportes Ferreira GPS`
- Idioma predeterminado: **Español (Latinoamérica) – es-419**
- App o juego: **App** · Gratis o pagada: **Gratis**
- Aceptá las declaraciones.

**Firma de apps:** dejá la opción predeterminada (Google genera y guarda la llave de la app). La llave de GitHub queda registrada como llave de subida con el primer `.aab`.

Después completá **Contenido de la app** (menú *Política › Contenido de la app*):

### Política de privacidad

```text
https://github.com/carlosdiegofc/AppTrFerreira/blob/claude/apptrferreira-g1agmt/docs/legal/privacidad.md
```

No borres la rama `claude/apptrferreira-g1agmt` en GitHub: si se borra, este enlace deja de funcionar y Google puede suspender la app. Si algún día pasás todo a `main`, cambiá el enlace por el de `main`.

### Acceso a la app

Elegí **Todas las funciones o algunas de ellas están restringidas** y agregá una credencial con el usuario y la contraseña de `cuenta-de-prueba-para-google.txt`. En las instrucciones pegá:

```text
Log in with the test account. Keep "Modo sencillo" and tap "Continuar". Tap "INICIAR VIAJE", then "SÍ, INICIAR" (pick any truck if asked). Accept the location notice and permission. During the trip the app shows a "Viaje en curso" notification and the route on the map. End it with "FINALIZAR VIAJE" > "SÍ, FINALIZAR". Fuel receipts: "Cargar combustible". Delivery notes: "Cambiar de modo" > "Modo normal" > "Continuar". The company creates the drivers' accounts.
```

Desde la versión 0.16 la app pregunta el modo de uso después de ingresar, y desde la 0.17.1 el modo sencillo también carga combustible; si en Play Console quedó un texto anterior, reemplazalo por este.

La cuenta de prueba es un chofer llamado «Revisión Google Play». Los viajes que haga Google aparecen en el panel con ese nombre; se pueden borrar después de la revisión.

### Anuncios

**No, mi app no contiene anuncios.**

### Clasificación de contenido

- Categoría: **Todos los demás tipos de apps**.
- Respondé **No** a violencia, contenido sexual, lenguaje, drogas, apuestas y humor ofensivo.
- ¿Los usuarios pueden interactuar o intercambiar contenido entre sí? **No**.
- ¿La app comparte la ubicación física actual del usuario con otros usuarios? **Sí** (la administración ve dónde está el camión).
- ¿Permite comprar productos digitales? **No**.

### Público objetivo

Solo **18 años o más**. La app no atrae a niños.

### Otras declaraciones

- Apps de noticias: **No**.
- Apps gubernamentales: **No**.
- Funciones financieras: **Mi app no tiene ninguna de estas funciones**.
- Salud: **Mi app no tiene funciones de salud**.

### Seguridad de los datos

Preguntas generales:

| Pregunta | Respuesta |
| --- | --- |
| ¿La app recopila o comparte alguno de los tipos de datos del usuario obligatorios? | **Sí** |
| ¿Todos los datos del usuario que recopila la app se encriptan en tránsito? | **Sí** |
| Creación de cuentas | La app **no permite crear cuentas**: las crea la empresa y el chofer ingresa con usuario y contraseña. Si el formulario pide un enlace para eliminar la cuenta, usá el de la política de privacidad. |
| ¿Los usuarios pueden pedir que se borren sus datos? | **Sí** (a través de la administración de la empresa) |

Tipos de datos. En todos: **recopilado: sí**, **compartido: no**, **procesado de forma efímera: no**.

| Tipo de dato | ¿Obligatorio u opcional? | Finalidad |
| --- | --- | --- |
| Ubicación › Ubicación aproximada | Opcional | Funcionalidad de la app |
| Ubicación › Ubicación precisa | Opcional | Funcionalidad de la app |
| Información personal › Nombre | Obligatorio | Funcionalidad de la app, Administración de la cuenta |
| Información personal › Dirección de correo electrónico | Obligatorio | Administración de la cuenta |
| Información personal › IDs de usuario | Obligatorio | Funcionalidad de la app, Administración de la cuenta |
| Información financiera › Historial de compras | Opcional | Funcionalidad de la app |
| Fotos y videos › Fotos | Opcional | Funcionalidad de la app |
| Actividad en la app › Interacciones con la app | Obligatorio | Funcionalidad de la app |
| Actividad en la app › Otro contenido generado por el usuario | Obligatorio | Funcionalidad de la app |

«Interacciones con la app» va desde la versión 0.17.0: el aviso de «chofer activo» le dice a la empresa cuándo tuvo cada chofer la app abierta.

Por qué «compartido: no»: Supabase (la base de datos), los mapas y el servicio de rutas trabajan por cuenta de la empresa, y Google no cuenta eso como compartir. La ubicación figura como opcional porque el chofer puede negar el permiso y el viaje igual se registra, sin recorrido.

### Permisos de servicios en primer plano

Play Console pide explicar el servicio de ubicación que mantiene el GPS andando durante el viaje. Tipo: **Ubicación** (`FOREGROUND_SERVICE_LOCATION`). Si hay que elegir una tarea de la lista, elegí la más parecida a seguimiento de ubicación iniciado por el usuario (o **Otra**).

Descripción:

```text
The driver starts a trip by tapping "Iniciar viaje" or "Salir ahora". While the trip is active, a location foreground service with a persistent "Viaje en curso" notification records the truck's GPS route and distance, also while the screen is locked during driving. The service stops when the driver pauses or finishes the trip.
```

Impacto si el sistema demora o corta el servicio:

```text
If the service is deferred or interrupted, the route and the kilometers of the trip are lost or incomplete, and the company cannot see where the truck is. The distance is used to control fuel and trip costs.
```

Video: grabá la pantalla del teléfono (30 a 60 segundos) mostrando: abrir la app › **Modo sencillo** › **Continuar** › **INICIAR VIAJE** › **SÍ, INICIAR** › aceptar el aviso de ubicación › bajar la barra de notificaciones y mostrar **Viaje en curso** › volver al mapa › **FINALIZAR VIAJE** › **SÍ, FINALIZAR**. Subilo a YouTube como **No listado** y pegá el enlace.

### Ubicación precisa (solo si Play Console la pide)

Google empezó a pedir una justificación a las apps que usan ubicación precisa durante un período continuo. Si aparece esa declaración:

```text
The app records the route and the distance of company trucks during a trip that the driver starts and ends explicitly. Distance is computed from consecutive GPS fixes, so approximate location (about 3 km) cannot measure the kilometers driven or draw the route. Continuous location is collected only while a trip is active and stops when the trip is paused or finished. Outside a trip, only while the app is open and if the driver agrees, the app sends one battery-saving position when it opens and every 5 minutes, so the office knows where available drivers are; it never uses location in the background outside a trip.
```

## 4. Ficha de Play Store

Menú *Hacer crecer › Presencia en Play Store › Ficha de Play Store principal*.

Nombre de la app:

```text
Transportes Ferreira GPS
```

Descripción breve (máximo 80 caracteres):

```text
Viajes, GPS, combustible y remitos para los choferes de Transportes Ferreira.
```

Descripción completa:

```text
Transportes Ferreira GPS es la aplicación de los choferes y la administración de Transportes Ferreira (Uruguay).

Para el chofer:
• Iniciar un viaje en segundos, con o sin carga, y completar los datos después.
• Registro del recorrido y de los kilómetros con GPS, también con la pantalla apagada.
• Carga de combustible con foto de la boleta.
• Remitos de salida y de llegada con foto.
• Historial de viajes y de cargas de combustible.
• Vencimientos de licencia, carné de salud y papeles del camión.
• Funciona sin conexión: todo se guarda en el teléfono y se envía cuando vuelve la señal.

Para la administración:
• Mapa de la flota en vivo con el estado de cada camión.
• Viajes, combustible, mantenimiento y documentos de toda la flota.

Es una app de uso interno: solo pueden ingresar las personas con una cuenta entregada por Transportes Ferreira.
```

Gráficos (están en esta misma carpeta de GitHub):

- Ícono de la app: [icono-512.png](icono-512.png) (512 × 512).
- Gráfico destacado: [grafico-destacado-1024x500.png](grafico-destacado-1024x500.png) (1024 × 500).
- Capturas de pantalla del teléfono: mínimo 2. Sacalas con la cuenta de prueba para no mostrar datos reales (botón de encendido + bajar volumen): Inicio, Viaje activo con el mapa, Cargar combustible y Mis viajes.

Otros datos:

- Categoría: **Empresa**.
- Correo de contacto: el correo de la empresa (es obligatorio y se ve en la ficha).

## 5. Prueba interna e invitación a los choferes

1. *Prueba y lanzamiento › Prueba › Prueba interna › Testers*: creá la lista `Choferes` con el correo de Google de cada chofer (el mismo que usan en el Play Store de su teléfono).
2. *Versiones › Crear versión*: subí el archivo `.aab`. Nombre de la versión: `0.15.1`. Notas de la versión:

```text
<es-419>
Primera versión en Google Play.
</es-419>
```

3. **Siguiente › Guardar › Lanzar en prueba interna.**
4. En *Testers*, copiá el **enlace para unirse** y mandáselo a cada chofer por WhatsApp. El chofer lo abre en el teléfono › **Aceptar invitación** › **Descargar en Google Play** › **Instalar**.

## 6. Pasar de la app vieja a la de Google Play (una vez por teléfono)

La app de Google Play es una app nueva para Android (nombre de paquete `com.transportesferreira.app`): se instala aparte de la anterior, con el mismo ícono y el mismo nombre.

1. En la app vieja: terminá el viaje si hay uno en curso y tocá **Enviar pendientes y actualizar** hasta ver «Todo guardado en el panel».
2. Instalá la app desde el enlace de Google Play e ingresá con la misma cuenta.
3. Desinstalá la app vieja, para no tener dos íconos iguales ni registrar viajes en las dos. Lo que no se haya enviado desde la vieja se pierde.
4. Al empezar el primer viaje, aceptá el aviso de ubicación. En **Mi cuenta › Revisar GPS**, dejá la batería de la app en **Sin restricciones**.

## 7. Actualizaciones

Cada versión nueva lleva un número de versión más alto, y GitHub Actions arma su `.aab` solo. En Play Console: *Prueba interna › Crear versión* › subí el `.aab` nuevo › **Lanzar**. Los teléfonos se actualizan desde Google Play sin hacer nada más.

Versión `0.17.3` (código de versión 29). «Rendimiento» cuenta cada boleta de combustible en el mes de su fecha (o de la que le corrigió el panel), como el panel. No cambia permisos, datos recopilados ni la política de privacidad. Si alguna de las versiones anteriores, de la 0.17.0 a la 0.17.2, no llegó a subirse, se sube directamente esta, que las incluye, siguiendo los pasos de la 0.17.0 de acá abajo (Seguridad de los datos y la prueba en el teléfono). Notas de la versión si ya está subida la 0.17.2:

```text
<es-419>
• Rendimiento: cada boleta de combustible cuenta en el mes de su fecha.
</es-419>
```

Versión `0.17.2` (código de versión 28). El autocompletado del teléfono ya no llena los campos de los formularios (llenaba «Otro tipo» con el correo de la cuenta), y los services muestran los kilómetros que les cargó el panel («a los 412.500 km», «cada 10.000 km»). No cambia permisos, datos recopilados ni la política de privacidad. Si la 0.17.0 o la 0.17.1 no llegaron a subirse, se sube directamente esta, que las incluye, siguiendo los pasos de la 0.17.0 de acá abajo (Seguridad de los datos y la prueba en el teléfono). Notas de la versión si ya está subida la 0.17.1:

```text
<es-419>
• Los formularios ya no se llenan solos con el correo.
• Mantenimiento: los services muestran a qué kilometraje tocan.
</es-419>
```

Versión `0.17.1` (código de versión 27). Suma la carga de combustible en el modo sencillo. No cambia permisos, datos recopilados ni la política de privacidad. Si la 0.17.0 no llegó a subirse, se sube directamente esta, que la incluye, siguiendo los pasos de la 0.17.0 de acá abajo (Seguridad de los datos y la prueba en el teléfono). Notas de la versión si ya está subida la 0.17.0:

```text
<es-419>
• Modo sencillo: botón para cargar combustible, en el viaje o sin viaje.
</es-419>
```

Versión `0.17.0` (código de versión 26). Trae todo lo de la 0.16.3, que no se subió, y es la primera armada con R8: el código va optimizado y ofuscado, y los recursos que no se usan quedan afuera. Eso responde al aviso de Play Console «La optimización del código DEX está por debajo de nuestro umbral». No pide permisos nuevos. Antes de lanzarla:

- **Seguridad de los datos:** agregá *Actividad en la app › Interacciones con la app* como está en la [tabla](#seguridad-de-los-datos). La ubicación ya figura; ahora también se usa con la app abierta fuera de un viaje, si el chofer lo acepta.
- Si Play Console pide la justificación de la ubicación precisa, usá el texto de [Ubicación precisa](#ubicación-precisa-solo-si-play-console-la-pide), que ya cuenta el «chofer activo».

Probala en tu teléfono antes de lanzarla a los choferes. La prueba automática del emulador cubre el ingreso, pero el viaje con GPS, las fotos y la sincronización necesitan una cuenta real:

1. *Prueba interna › Crear versión* › subí el `.aab` › **Siguiente** › **Guardar**, sin lanzar todavía.
2. En *Explorador de paquetes de aplicación* (menú *Prueba y lanzamiento*), elegí la versión 26 › *Descargas* › **APK universal firmado**. Instalalo en tu teléfono: actualiza la app de Google Play sin borrar nada, porque está firmado con la misma llave.
3. Probá:
   - cerrar sesión y volver a ingresar;
   - un viaje corto: la notificación «Viaje en curso», el mapa, pausar, reanudar y finalizar;
   - combustible con foto (cámara y galería) y un remito;
   - **Enviar pendientes y actualizar**, hasta ver «Todo guardado en el panel»;
   - en el panel, el viaje con su recorrido y las fotos;
   - con la cuenta de Luis, el Menú del dueño: Flota en vivo y Rendimiento.
4. Si todo anda, volvé a la versión y tocá **Lanzar en prueba interna**. Si algo falla, no la lances y avisame qué pasó.

Notas de la versión (si la última subida es la 0.16.2):

```text
<es-419>
• GPS en vivo más rápido: la posición llega al panel en segundos.
• Recorrido más prolijo: dobla en las esquinas y no dibuja «estrellas» con el camión parado.
• Chofer activo: con la app abierta, la empresa ve que estás disponible y, si lo aceptás, dónde estás cuando no hay viaje.
• Flota en vivo: los camiones se mueven sin saltos en el mapa.
• Combustible del mes corregido; el dueño puede cargar los documentos de cada chofer.
• App optimizada.
</es-419>
```

Versión `0.16.3` (código de versión 25). No cambia permisos, datos recopilados ni la política de privacidad. Notas de la versión si ya está subida la 0.16.2:

```text
<es-419>
• Flota en vivo: un camión en viaje ya no aparece dos veces.
• Combustible del mes: los totales suman todas las cargas del mes, en pesos y en dólares.
• Documentos: el dueño puede cargar los de cada chofer.
</es-419>
```

Si la 0.16.2 no llegó a subirse, se sube directamente la 0.16.3 (trae todo lo de la 0.16.2), se actualizan las instrucciones de [Acceso a la app](#acceso-a-la-app) y van estas notas:

```text
<es-419>
• Al entrar, cada chofer elige el modo: sencillo (solo iniciar y finalizar el viaje, con botones grandes) o normal (todas las opciones).
• En modo sencillo, la app pregunta antes de iniciar el viaje.
• Nuevo: Rendimiento del mes por camión y por chofer, para los dueños.
• Las pantallas ya no quedan tapadas por las barras del teléfono.
• Flota en vivo y combustible del mes, corregidos. El dueño puede cargar los documentos de cada chofer.
</es-419>
```

Versión `0.16.2` (código de versión 24). No cambia permisos, datos recopilados ni la política de privacidad; solo hay que actualizar las instrucciones de [Acceso a la app](#acceso-a-la-app). Notas de la versión:

```text
<es-419>
• Al entrar, cada chofer elige el modo: sencillo (solo iniciar y finalizar el viaje, con botones grandes) o normal (todas las opciones).
• En modo sencillo, la app pregunta antes de iniciar el viaje, para que no arranque por un toque sin querer.
• Nuevo: Rendimiento del mes por camión y por chofer, para los dueños.
• Las pantallas ya no quedan tapadas por las barras del teléfono.
</es-419>
```

## Si más adelante querés publicarla para todo el público

Con una cuenta personal nueva, Google exige una prueba cerrada con al menos 12 personas durante 14 días seguidos antes de pedir acceso a Producción. Para el uso interno de la empresa no hace falta.
