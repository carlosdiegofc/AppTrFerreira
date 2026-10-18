#!/bin/bash
# Recreates the end-to-end test database: the Supabase stand-in, every migration of supabase/migrations in order, and
# the invented example data. Needs a PostgreSQL superuser on PGHOST/PGPORT/PGUSER. TEST ONLY.
set -euo pipefail
cd "$(dirname "$0")"
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}"
DB="${PANEL_E2E_DB:-panel_e2e}"
BASE="${PANEL_E2E_BASE:-2026-10-15T15:00:00Z}"
P="psql -X -q -v ON_ERROR_STOP=1"
$P -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB" >/dev/null
$P -d "$DB" -f 00-supabase-local.sql
major=$($P -d "$DB" -tAc "show server_version_num" | cut -c1-2)
for m in ../../../../supabase/migrations/*.sql; do
  # Supabase runs PostgreSQL 17; the MAINTAIN privilege does not exist before it.
  if [ "$major" -lt 17 ]; then sed 's/maintain, //g' "$m" | $P -d "$DB" -f - >/dev/null; else $P -d "$DB" -f "$m" >/dev/null; fi
done
$P -d "$DB" -v base="$BASE" -f seed.sql
if [ -n "${AUTHENTICATOR_PASSWORD:-}" ]; then $P -d "$DB" -c "alter role authenticator password '$AUTHENTICATOR_PASSWORD'"; fi
# PostgREST keeps a schema cache: ask it to reload (ignored when it is not running).
$P -d "$DB" -c "notify pgrst, 'reload schema'"
echo "panel e2e database ready ($DB, base $BASE)"
