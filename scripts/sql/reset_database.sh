#!/bin/bash

# CTF Database Reset Script
# Completely removes all CTF-related tables, policies, and data
# Usage: ./reset_database.sh [database_url]

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Default Supabase local database URL
DEFAULT_DB_URL="postgresql://postgres:postgres@localhost:54322/postgres"

# Use provided URL or default
DB_URL="${1:-$DEFAULT_DB_URL}"

echo -e "${RED}🗑️  CTF Database Reset Script${NC}"
echo -e "${RED}⚠️  WARNING: This will COMPLETELY DELETE all CTF data!${NC}"
echo -e "${BLUE}Database URL: ${DB_URL}${NC}"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ Error: psql is not installed or not in PATH${NC}"
    echo "Please install PostgreSQL client tools"
    exit 1
fi

# Test database connection
echo -e "${YELLOW}🔌 Testing database connection...${NC}"
if ! psql "$DB_URL" -c "SELECT 1;" &> /dev/null; then
    echo -e "${RED}❌ Error: Cannot connect to database${NC}"
    echo "Please ensure your local Supabase is running and the connection URL is correct"
    echo "Try: supabase start"
    exit 1
fi
echo -e "${GREEN}✅ Database connection successful${NC}"
echo ""

# Show what will be deleted
echo -e "${MAGENTA}📋 The following will be PERMANENTLY DELETED:${NC}"
echo -e "  ${RED}🗂️  Tables:${NC}"
echo "     - public.challenges"
echo "     - public.challenge_flags" 
echo "     - public.profiles"
echo "     - public.solves"
echo "     - public.docs"
echo "     - public.teams (if exists)"
echo "     - public.leaderboard (if exists)"
echo "     - public.team_profiles (if exists)"
echo ""
echo -e "  ${RED}🔒 Policies:${NC}"
echo "     - All Row Level Security policies on CTF tables"
echo ""
echo -e "  ${RED}📡 Realtime:${NC}"
echo "     - Realtime subscriptions for CTF tables"
echo ""
echo -e "  ${RED}📊 Views:${NC}"
echo "     - All CTF-related views"
echo ""
echo -e "  ${RED}💾 Data:${NC}"
echo "     - All challenges, flags, user profiles, solves, teams, and docs"
echo ""

# Multiple confirmations for safety
echo -e "${RED}⚠️  FINAL WARNING: This action cannot be undone!${NC}"
echo -e "${YELLOW}Type 'DELETE EVERYTHING' (exactly) to confirm:${NC}"
read -r confirmation

if [[ "$confirmation" != "DELETE EVERYTHING" ]]; then
    echo -e "${YELLOW}Reset cancelled - confirmation text didn't match${NC}"
    exit 0
fi

echo ""
read -p "Are you absolutely sure? (type 'yes' to continue): " -r final_confirm
if [[ "$final_confirm" != "yes" ]]; then
    echo -e "${YELLOW}Reset cancelled${NC}"
    exit 0
fi

echo ""
echo -e "${RED}🔥 Starting database reset...${NC}"

# Create the reset SQL script
cat > /tmp/reset_ctf_db.sql << 'EOF'
-- CTF Database Reset Script
-- Removes all CTF-related tables, policies, views, and data

\echo 'Starting CTF database reset...'

-- Disable realtime for tables (ignore errors if not enabled)
\echo 'Disabling realtime subscriptions...'
DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.challenges;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not remove challenges from realtime (may not be enabled)';
END $$;

DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.challenge_flags;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not remove challenge_flags from realtime (may not be enabled)';
END $$;

DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not remove profiles from realtime (may not be enabled)';
END $$;

DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.solves;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not remove solves from realtime (may not be enabled)';
END $$;

DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.docs;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not remove docs from realtime (may not be enabled)';
END $$;

DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.teams;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not remove teams from realtime (may not be enabled)';
END $$;

DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.team_profiles;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not remove team_profiles from realtime (may not be enabled)';
END $$;

-- Drop views first (they depend on tables)
\echo 'Dropping views...'
DROP VIEW IF EXISTS public.leaderboard CASCADE;
DROP VIEW IF EXISTS public.team_leaderboard CASCADE;
DROP VIEW IF EXISTS public.user_stats CASCADE;
DROP VIEW IF EXISTS public.challenge_stats CASCADE;
DROP VIEW IF EXISTS public.daily_stats CASCADE;

-- Drop tables in reverse dependency order
\echo 'Dropping tables...'
DROP TABLE IF EXISTS public.solves CASCADE;
DROP TABLE IF EXISTS public.challenge_flags CASCADE;
DROP TABLE IF EXISTS public.challenges CASCADE;
DROP TABLE IF EXISTS public.team_profiles CASCADE;
DROP TABLE IF EXISTS public.teams CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.docs CASCADE;

-- Drop any remaining policies (should be auto-dropped with tables, but just in case)
\echo 'Cleaning up any remaining policies...'
DO $$ 
DECLARE
    pol record;
BEGIN
    FOR pol IN SELECT schemaname, tablename, policyname 
               FROM pg_policies 
               WHERE schemaname = 'public' 
               AND (tablename LIKE '%challenge%' 
                   OR tablename IN ('profiles', 'solves', 'docs', 'teams', 'team_profiles'))
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END $$;

-- Drop any functions related to CTF (optional - uncomment if you have custom functions)
-- DROP FUNCTION IF EXISTS public.get_user_rank(uuid);
-- DROP FUNCTION IF EXISTS public.get_team_rank(text);
-- DROP FUNCTION IF EXISTS public.submit_flag(text, text);

\echo 'CTF database reset complete!'
\echo 'All CTF tables, data, policies, and views have been removed.'
EOF

echo -e "${YELLOW}🔄 Executing reset script...${NC}"
echo ""

# Run the reset script
if psql "$DB_URL" -f /tmp/reset_ctf_db.sql -v ON_ERROR_STOP=1; then
    echo ""
    echo -e "${GREEN}✅ Database reset completed successfully!${NC}"
    echo ""
    echo -e "${BLUE}💡 Next steps:${NC}"
    echo "  - Run ./run_migrations.sh to recreate the database structure"
    echo "  - Add your challenges and flags"
    echo "  - Your database is now completely clean"
else
    echo ""
    echo -e "${RED}❌ Database reset failed!${NC}"
    echo "Please check the error messages above"
    exit 1
fi

# Clean up temporary file
rm -f /tmp/reset_ctf_db.sql

echo ""
echo -e "${GREEN}🎉 CTF Database has been completely reset!${NC}"
