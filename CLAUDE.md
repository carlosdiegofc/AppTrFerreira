# Cómo trabajar en este repositorio

- Antes de cambiar algo, leé [docs/PLAN-PLATAFORMA.md](docs/PLAN-PLATAFORMA.md): rumbo aprobado, reglas, etapa en curso y decisiones abiertas. Cada etapa se presenta y se aprueba antes de programarla; al completar un punto, marcalo ahí en el mismo commit.
- Lo que la app guarda o envía y cómo lo lee el panel web está en [docs/APP-WEB-CONTRACT.md](docs/APP-WEB-CONTRACT.md); todo cambio en eso se anota ahí.
- Los textos para el usuario van en español de Uruguay, con voseo.
- No se borran ni se sobrescriben funciones o datos existentes sin autorización y sin respaldo. La base cambia solo con migraciones aditivas, probadas primero fuera de producción.
- El repositorio es público: nunca subas llaves de firma, contraseñas, correos personales ni datos de la base.
- App Android en `app/` (Kotlin): cada versión sube `versionCode` (Google Play acepta cada número una sola vez) y se anota en README.md. Panel web actual en `web/`: pruebas con `npm test`, `tests/db` y `tests/e2e`. Panel nuevo en `panel/` (React + TypeScript): `npm run typecheck`, `npm test` y `npm run e2e` (ver `panel/tests/e2e/README.md`).
