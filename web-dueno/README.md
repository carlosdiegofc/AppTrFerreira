# Panel del dueño (web)

Página estática (HTML + JavaScript, sin instalación) para ver la flota. Usa el mismo Supabase que la app de los choferes.

- **Flota en vivo:** un punto por camión (verde: en viaje con señal reciente; naranja: sin señal hace más de 5 min; gris: sin viaje). Se actualiza cada 15 s.
- **Viajes:** filtro por camión y chofer, y mapa del recorrido.
- **Combustible:** cargas por camión.
- **Resumen:** kilómetros, viajes, litros y gasto del mes por camión.

## Permisos (imprescindible)
Esta página **no da permisos**: solo muestra lo que Supabase deja leer a la cuenta que ingresa. Para que un dueño vea todos los camiones hay que ejecutar, una vez, `SUPABASE-PERMISOS.sql` (revisarlo antes). Sin eso, la página avisa que solo se ve la ubicación propia.

## Cómo abrirla
- Probar: `python3 -m http.server` dentro de esta carpeta y abrir http://localhost:8000
- Publicar: subir la carpeta completa (con `vendor/` y `logo.png`) a cualquier hosting estático. No se publicó nada desde este repositorio.

## Seguridad
- La clave que contiene es la clave pública (publishable) de Supabase, la misma que ya está en la app.
- La sesión se guarda en el navegador (localStorage). En un equipo compartido, usar «Salir».
