# Panel web TR Ferreira

Web de administración conectada a la misma base (Supabase) que la app de los choferes.

| Sección | Qué hace |
|---|---|
| **Viajes** | Cada viaje que un chofer hace con la app aparece solo, con lo que cargó en el teléfono. Vos completás lo que falta (orden de carga, cliente, producto, origen, destino, km facturables, kilos, importe). También podés cargar viajes a mano, editarlos y eliminarlos. Exporta a Excel. |
| **Detalle del viaje** | Formato de orden de carga (chofer, matrícula, orden, producto, origen → km → destino) y el **recorrido real del GPS** en el mapa. Si el viaje está en curso, se actualiza solo cada 30 s. Muestra remitos (con foto) y combustible del viaje. |
| **Seguimiento GPS** | Todos los camiones en el mapa, en vivo (cada 15 s). |
| **Combustible** | Cargas enviadas por los choferes, por camión y período. Exporta a Excel. |
| **Resumen** | Totales del mes por camión: viajes, km, kilos, facturado y combustible (pesos y dólares por separado). |

## Cómo se relaciona con la app (no rompe nada)
- La web **nunca escribe en las tablas de la app**. Lo que completás se guarda en una tabla propia del panel (`trf_panel_trips`) y se muestra junto a los datos del teléfono. Lo que escribiste vos tiene prioridad sobre lo que mandó el teléfono.
- **Eliminar** manda el viaje a **Eliminados** (papelera): no aparece en la lista ni en los totales, y se puede **restaurar**. El recorrido GPS y lo que envió el chofer no se borran nunca.
- Si dos personas editan el mismo viaje a la vez, la segunda recibe un aviso y los datos se recargan: nadie pisa los cambios de otro sin darse cuenta.
- Los choferes siguen viendo solo sus propios datos en la app.

## Instalación (una sola vez)
1. **Base de datos.** En Supabase → **SQL Editor** → **New query**, pegá todo el archivo [`sql/001_panel_web.sql`](sql/001_panel_web.sql).
   Antes de ejecutarlo, en la sección *EDITÁ ESTA LISTA* poné los correos de quienes administran el panel (tienen que ser cuentas que ya existan en *Authentication → Users*). Tocá **Run**: al final aparece un informe que debe decir **OK** en cada fila.
   Se puede volver a ejecutar sin problema (por ejemplo, para agregar un administrador).
2. **Publicar la web.** Es una carpeta de archivos estáticos (no necesita servidor propio):
   - **GitHub Pages (gratis):** en GitHub → *Settings → Pages → Source: GitHub Actions*. Con esta carpeta en la rama principal (`main`), en *Actions* elegí **«Publicar panel web»** → *Run workflow*. La dirección queda en el resultado de esa ejecución.
   - O cualquier hosting estático (Netlify, Cloudflare Pages…): subí `index.html`, `css/`, `js/`, `vendor/` y `logo.png`.
3. **Ingresar** con el correo y la contraseña de una cuenta administradora.

Si falta el paso 1, la web lo dice y explica qué hacer. Si una cuenta no es administradora, la web no la deja entrar.

### Agregar otro administrador más adelante
Editá la lista de correos en `sql/001_panel_web.sql` y volvé a ejecutarlo, o ejecutá solo:
```sql
insert into public.trf_panel_admins (user_id, email)
select id, email from auth.users where lower(email) = 'nuevo@correo.com'
on conflict (user_id) do nothing;
```

## Seguridad
- La clave que usa la web es la **pública** de Supabase (la misma de la app). Quién ve qué lo deciden los permisos de la base (RLS): solo los administradores leen todos los camiones y solo ellos escriben en `trf_panel_trips`. Borrar físicamente está bloqueado en la base.
- La sesión se guarda en el navegador y se renueva sola. En una computadora compartida, usá **Salir**.
- Todo lo que escriben los choferes se muestra como texto (nunca se ejecuta como código) y la página tiene una política de seguridad (CSP) que solo permite sus propios scripts.

## Límites conocidos
- La ruta sugerida (viajes cargados a mano) y la búsqueda de lugares usan servicios públicos gratuitos (OSRM y OpenStreetMap Nominatim). Si no responden, la web lo avisa y se puede guardar igual.
- Los datos que hayas completado en el panel anterior (ChatGPT Sites) no se importan automáticamente.

## Pruebas
- `npm test` (desde esta carpeta): reglas de viajes, formulario, números y fechas.
- [`tests/db/permissions.sql`](tests/db/permissions.sql): permisos de la base (administrador, chofer, anónimo).
- [`tests/e2e/`](tests/e2e/README.md): la web completa en un navegador real contra una copia local de la base y de la API.

GitHub ejecuta las tres en cada cambio de esta carpeta (workflow *Probar panel web*).
