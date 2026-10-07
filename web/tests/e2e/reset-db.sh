#!/bin/bash
# Recreates the local test database: Supabase imitation + app tables + panel install script + example data.
# Needs a local PostgreSQL reachable with PGHOST/PGPORT/PGUSER (superuser). TEST ONLY.
set -euo pipefail
cd "$(dirname "$0")"
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-54329}" PGUSER="${PGUSER:-postgres}"
DB="${PGDATABASE_TEST:-trf}"
P="psql -v ON_ERROR_STOP=1 -q -X"
$P -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB" >/dev/null
for r in authenticator service_role authenticated anon; do $P -d postgres -c "drop role if exists $r" >/dev/null 2>&1 || true; done
$P -d "$DB" -f fixtures/01-supabase-sim.sql
$P -d "$DB" -f fixtures/02-app-schema.sql
$P -d "$DB" -f ../../sql/001_panel_web.sql -o /dev/null
$P -d "$DB" -f fixtures/03-seed.sql
# CI connects PostgREST over TCP with a password; locally "trust" auth ignores it.
if [ -n "${AUTHENTICATOR_PASSWORD:-}" ]; then $P -d "$DB" -c "alter role authenticator password '$AUTHENTICATOR_PASSWORD'" >/dev/null; fi
# PostgREST keeps a schema cache: ask it to reload (ignored if it is not running).
$P -d "$DB" -c "notify pgrst, 'reload schema'" >/dev/null
echo "test database ready"
