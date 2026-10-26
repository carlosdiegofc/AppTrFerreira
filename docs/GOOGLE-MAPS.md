# Mapa de Google: cuenta, claves y tope

Lo que hace falta, una sola vez, para el mapa de Google del panel y de la app (decisión del 26/10/2026). Lo hace el dueño con la cuenta de Google de la empresa. Las claves no van nunca al repositorio: van como secretos de GitHub.

## Lo que se paga
- **Panel** (Map Tiles API): 100.000 imágenes de mapa gratis por mes; después, US$ 0,60 cada 1.000. Con la cuota diaria del paso 4, el mes no pasa de unos US$ 10.
- **App** (Maps SDK for Android): sin costo y sin límite.
- Google pide una tarjeta aunque el uso quede dentro de lo gratis.
- Los precios pueden cambiar: la lista vigente está en [la página de precios de Google Maps Platform](https://developers.google.com/maps/billing-and-pricing/pricing?hl=es-419).

## 1. Proyecto y facturación
1. Entrá a [Google Cloud Console](https://console.cloud.google.com/) con la cuenta de Google de la empresa.
2. Arriba, en el selector de proyectos, elegí «Proyecto nuevo»; por ejemplo, «Transportes Ferreira Mapas».
3. En el menú, *Facturación* › «Vincular una cuenta de facturación» › «Crear cuenta de facturación»: país Uruguay, los datos de la empresa y la tarjeta.
4. En *APIs y servicios* › *Biblioteca*, buscá y habilitá **Map Tiles API** y **Maps SDK for Android**.

## 2. Clave del panel
1. En *APIs y servicios* › *Credenciales*, elegí «Crear credenciales» › «Clave de API». Ponele de nombre «Panel web».
2. En *Restricciones de aplicaciones*, elegí «Sitios web» y agregá `https://carlosdiegofc.github.io/*`.
3. En *Restricciones de API*, dejá solo **Map Tiles API**. Guardá.
4. En GitHub, en el repositorio, *Settings* › *Secrets and variables* › *Actions* › «New repository secret»: nombre `GOOGLE_MAPS_KEY`, y la clave como valor.

## 3. Clave de la app
1. En Google Play Console, en la app, *Probar y publicar* › *Configuración* › *Integridad de la app* › *Firma de apps*: copiá la huella **SHA-1** del «Certificado de clave de firma de apps» y la del «Certificado de clave de subida».
2. En Google Cloud, creá otra clave de API, de nombre «App Android».
3. En *Restricciones de aplicaciones*, elegí «Apps para Android» y agregá dos veces el paquete `com.transportesferreira.app`: una con cada huella.
4. En *Restricciones de API*, dejá solo **Maps SDK for Android**. Guardá.
5. En GitHub, otro secreto: nombre `GOOGLE_MAPS_ANDROID_KEY`, y esta clave como valor.

## 4. El tope de unos US$ 10 por mes
1. En *APIs y servicios* › **Map Tiles API** › *Cuotas y límites del sistema*, buscá el límite por día de las imágenes 2D («2D Tiles», por día), elegí «Editar» y poné **3.700**.
   - Así el mes no pasa de unas 114.700 imágenes: las 100.000 gratis y unos US$ 9 más.
   - Si un día se llega al tope, el panel muestra OpenStreetMap hasta el día siguiente, y lo dice.
2. En *Facturación* › *Presupuestos y alertas*, elegí «Crear presupuesto»: US$ 10 por mes, con avisos al 50 %, al 90 % y al 100 %.
   - El presupuesto avisa por correo, pero no corta el gasto: lo que lo frena es la cuota del punto anterior.

## 5. Avisar
Cuando estén los dos secretos en GitHub, se publica el panel y se compila la app nueva.

En la misma consola se ven el uso de cada día y lo gastado en el mes.
