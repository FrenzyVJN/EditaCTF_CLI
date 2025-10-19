#!/usr/bin/env bash
set -euo pipefail

# Interactive project setup script.
# Safe to re-run; guides user step-by-step.
# Steps:
# 1. Environment detection & greeting
# 2. Tool verification / install guidance (node, pnpm, psql, supabase CLI)
# 3. Gather Supabase project info
# 4. Generate/update .env
# 5. Install dependencies
# 6. Apply DB schema & seeds
# 7. Optional start dev server

PROJECT_REF_DEFAULT=""  # intentionally blank; user must supply
DB_NAME_DEFAULT="postgres"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

log() { printf "\033[1;34m[setup]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn]\033[0m %s\n" "$*"; }
error() { printf "\033[1;31m[error]\033[0m %s\n" "$*"; }
step() { printf "\n\033[1;35m==> %s\033[0m\n" "$*"; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    return 1
  fi
}

step "Environment detection"
OS_NAME="$(uname -s | tr '[:upper:]' '[:lower:]')"
log "OS: $OS_NAME"

step "Tooling checks"
if ! require_cmd node; then error "Node.js missing (https://nodejs.org)."; exit 1; fi
if ! require_cmd pnpm; then
  warn "pnpm not found; enabling via corepack"
  if command -v corepack >/dev/null 2>&1; then corepack enable && corepack prepare pnpm@latest --activate; else error "corepack not available"; exit 1; fi
fi
if ! require_cmd psql; then
  warn "psql missing. Install:"
  if [[ "$OS_NAME" == darwin* ]]; then
    echo "  brew install libpq && echo 'export PATH=\"$(brew --prefix libpq)/bin:$PATH\"' >> ~/.zshrc && exec zsh"
  else
    echo "  Debian/Ubuntu: sudo apt-get update && sudo apt-get install -y postgresql-client"
  fi
  exit 1
fi
if ! require_cmd supabase; then
  warn "Supabase CLI not found (optional, but useful). Install:"
  if [[ "$OS_NAME" == darwin* ]]; then
    echo "  brew install supabase/tap/supabase"
  else
    echo "  curl -fsSL https://supabase.dev/install.sh | sh"
  fi
else
  log "Supabase CLI: $(supabase --version || true)"
fi

step "Collect Supabase project info"
# Require a project ref; keep prompting until non-empty
PROJECT_REF="${SUPABASE_PROJECT_REF:-}"  # allow env override
if [[ -n "$PROJECT_REF" ]]; then
  log "Using project ref from environment: $PROJECT_REF"
fi
while [[ -z "${PROJECT_REF}" ]]; do
  read -r -p "Supabase Project Ref (found in dashboard URL, e.g. abcdefghijklmnopqrstu): " INPUT_REF || true
  PROJECT_REF="${INPUT_REF}";
  if [[ -z "$PROJECT_REF" ]]; then warn "Project ref is required."; fi
done
read -r -p "Anon Key (paste from Dashboard > Settings > API) [leave blank to keep existing]: " INPUT_ANON || true
read -r -p "DB Name [${DB_NAME:-$DB_NAME_DEFAULT}]: " INPUT_DBNAME || true
DB_NAME=${INPUT_DBNAME:-${DB_NAME:-$DB_NAME_DEFAULT}}
read -r -p "Admin Emails (comma-separated, for elevated access) [leave blank to keep existing]: " INPUT_ADMINS || true
if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  read -r -s -p "DB Password for 'postgres' (leave blank to skip DB apply): " SUPABASE_DB_PASSWORD || true; echo
fi

step ".env setup"
ENV_FILE="$ROOT_DIR/.env"
SUPA_URL="https://${PROJECT_REF}.supabase.co"
if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<EOF
NEXT_PUBLIC_SUPABASE_URL=${SUPA_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${INPUT_ANON:-REPLACE_WITH_ANON_KEY}
ADMIN_EMAILS=${INPUT_ADMINS:-}
EOF
  log "Created .env"
else
  tmp="$ENV_FILE.tmp.$$"
  awk -v url="$SUPA_URL" -v anon="${INPUT_ANON}" -v admins="${INPUT_ADMINS}" 'BEGIN{u=0;a=0;m=0}
    /^NEXT_PUBLIC_SUPABASE_URL=/{print "NEXT_PUBLIC_SUPABASE_URL="url;u=1;next}
    /^NEXT_PUBLIC_SUPABASE_ANON_KEY=/{if(anon!=""){print "NEXT_PUBLIC_SUPABASE_ANON_KEY="anon;a=1;next}}
    /^ADMIN_EMAILS=/{if(admins!=""){print "ADMIN_EMAILS="admins;m=1;next} else {m=1}}
    {print}
    END{if(!u)print "NEXT_PUBLIC_SUPABASE_URL="url; if(anon!=""&&!a)print "NEXT_PUBLIC_SUPABASE_ANON_KEY="anon; if(admins!=""&&!m)print "ADMIN_EMAILS="admins}' "$ENV_FILE" > "$tmp" && mv "$tmp" "$ENV_FILE"
  log "Updated .env"
fi

step "Install dependencies"
if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  (cd "$ROOT_DIR" && pnpm install)
else
  log "Dependencies already installed"
fi

step "Apply database schema"
if [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
  export SUPABASE_DB_PASSWORD
  export SUPABASE_PROJECT_REF="$PROJECT_REF"
  if ! (cd "$ROOT_DIR" && pnpm db:apply); then
    warn "Database apply failed; rerun with SUPABASE_DB_PASSWORD=*** pnpm db:apply"
  else
    log "Database ready"
  fi
else
  warn "Skipped DB apply (no password)."
fi

step "Next steps"
echo "• (Optional) supabase login && supabase link --project-ref $PROJECT_REF"
echo "• Start dev server: pnpm dev"
echo "• Open: http://localhost:3000"

if [[ "${RUN_DEV_AFTER_SETUP:-1}" == "1" ]]; then
  read -r -p "Start dev server now? (y/N) " start_dev || true
  if [[ $start_dev =~ ^[Yy]$ ]]; then
    log "Launching dev server..."
    exec pnpm dev
  fi
fi

log "Setup complete."
