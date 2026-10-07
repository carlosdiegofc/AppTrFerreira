# End-to-end test

Runs the panel in Chromium (Playwright) against a **real PostgREST** connected to a local PostgreSQL that imitates the
Supabase pieces the panel uses (`fixtures/01-supabase-sim.sql`), with the app tables (`02-app-schema.sql`), the real install
script (`../../sql/001_panel_web.sql`) and example data (`03-seed.sql`). Login, signed photo links and the public map services
are stubbed by `server.mjs` / `run.mjs`. Nothing here is ever run against the production Supabase.

Local run:
```bash
# PostgreSQL 16 listening on PGHOST/PGPORT (superuser PGUSER), PostgREST 12 on POSTGREST_URL with:
#   db-uri = "postgres://authenticator@<host>:<port>/trf"   db-schemas = "public"   db-anon-role = "anon"
#   jwt-secret = "local-test-secret-for-trf-panel-0123456789"   server-port = 3300
bash reset-db.sh                      # creates the test database
npm install --no-save playwright      # inside web/
node tests/e2e/run.mjs                # from web/; screenshots go to tests/e2e/shots
```
CI does exactly this in `.github/workflows/web-tests.yml`.
