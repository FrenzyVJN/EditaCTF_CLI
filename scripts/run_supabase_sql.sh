#!/usr/bin/env bash
set -euo pipefail

# Unified SQL apply script for remote Supabase database using psql.
# Requirements:
#   1. PostgreSQL client (psql) installed (macOS: brew install libpq && echo 'export PATH="$(brew --prefix libpq)/bin:$PATH"' >> ~/.zshrc)
#   2. Environment variable SUPABASE_DB_PASSWORD (or full SUPABASE_DB_URL) set, OR you pass a full URL via --url
#   3. (Optional) SUPABASE_PROJECT_REF (e.g. pbrnylemxhmktilqlosr) to help build default host
#
# Connection string pattern (host format used by hosted Supabase):
#   postgresql://postgres:PASSWORD@db.<project-ref>.supabase.co:5432/postgres
#
# Usage examples:
#   SUPABASE_DB_PASSWORD=... pnpm db:apply
#   SUPABASE_DB_URL=postgresql://postgres:pw@db.xxx.supabase.co:5432/postgres pnpm db:apply
#   pnpm db:apply --url postgresql://postgres:pw@db.xxx.supabase.co:5432/postgres
#
# NOTE: Older instructions using `supabase db execute --file` don't work on current CLI (no execute subcommand).

URL_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)
      URL_ARG="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ -n "$URL_ARG" ]]; then
  SUPABASE_DB_URL="$URL_ARG"
fi

# Derive connection parameters if not explicitly provided as URL.
DB_NAME="postgres"
DB_USER="postgres"
if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
    read -r -s -p "Enter Supabase DB password (postgres user): " SUPABASE_DB_PASSWORD
    echo
  fi
  if [[ -z "${SUPABASE_PROJECT_REF:-}" ]]; then
    SUPABASE_PROJECT_REF="gyiripojhnhtvoqlmegx"
  fi
  DB_HOST="db.${SUPABASE_PROJECT_REF}.supabase.co"
else
  # Parse URL if provided (very simple parsing; assumes standard format without special chars in user/host)
  # postgresql://user:pass@host:port/db
  proto_removed="${SUPABASE_DB_URL#postgresql://}"
  creds_part="${proto_removed%@*}"  # user:pass
  hostdb_part="${proto_removed#*@}" # host:port/db
  DB_USER="${creds_part%%:*}"
  SUPABASE_DB_PASSWORD_RAW="${creds_part#*:}"
  # If password contains '@' this parsing fails; warn user to prefer SUPABASE_DB_PASSWORD env.
  if [[ "$SUPABASE_DB_PASSWORD_RAW" == *"@"* ]]; then
    echo "WARNING: Detected '@' in parsed password from URL; this likely indicates improper URL encoding. Prefer setting SUPABASE_DB_PASSWORD and SUPABASE_PROJECT_REF instead of SUPABASE_DB_URL." >&2
  fi
  SUPABASE_DB_PASSWORD="${SUPABASE_DB_PASSWORD:-$SUPABASE_DB_PASSWORD_RAW}"
  host_part="${hostdb_part%%/*}" # host:port
  DB_NAME="${hostdb_part##*/}"  # db
  DB_HOST="${host_part%%:*}"     # host
  DB_PORT="${host_part#*:}"
fi

DB_PORT="${DB_PORT:-5432}"

if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  echo "ERROR: Database password not set. Set SUPABASE_DB_PASSWORD or provide a valid SUPABASE_DB_URL." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql not found. Install PostgreSQL client (macOS: brew install libpq)." >&2
  exit 1
fi

echo "Connecting to host: ${DB_HOST}:${DB_PORT} db: ${DB_NAME} user: ${DB_USER}"

# Build ordered file list dynamically so newly added numbered scripts run automatically.
# We still intentionally skip 002-005 because 001 + later fix scripts make them redundant/idempotent.
FILES=()
for f in $(printf '%s\n' scripts/sql/[0-9][0-9][0-9]_*.sql | sort); do
  case "$(basename "$f")" in
    002_core.sql|003_policies.sql|004_realtime.sql|005_seed.sql)
      continue ;;
  esac
  FILES+=("$f")
done

echo "Running Supabase SQL files via psql..."
for f in "${FILES[@]}"; do
  if [[ -f "$f" ]]; then
    echo "=== Executing $f ==="
    # -v ON_ERROR_STOP=1 stops execution on first error inside the file
  if ! PGPASSWORD="${SUPABASE_DB_PASSWORD}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -q -f "$f"; then
      echo "FAILED executing $f" >&2
      exit 1
    fi
  else
    echo "Skipping missing file $f" >&2
  fi
done

echo "All SQL files executed successfully. Final views currently defined by the highest numbered view script (e.g. 014_hide_guest_teams.sql)."