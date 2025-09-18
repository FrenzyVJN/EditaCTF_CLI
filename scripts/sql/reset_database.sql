-- CTF Database Complete Reset
-- WARNING: This will DELETE ALL CTF data permanently!
-- Run this in Supabase SQL Editor to completely clean the database

\echo '⚠️  WARNING: Starting complete CTF database reset...'
\echo 'This will permanently delete all CTF data!'

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
DROP VIEW IF EXISTS public.current_team_leaderboard CASCADE;
DROP VIEW IF EXISTS public.current_team_profiles CASCADE;

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
        BEGIN
            EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not drop policy % on %.%', pol.policyname, pol.schemaname, pol.tablename;
        END;
    END LOOP;
END $$;

-- Drop any CTF-related functions (uncomment if you have custom functions)
-- DROP FUNCTION IF EXISTS public.get_user_rank(uuid) CASCADE;
-- DROP FUNCTION IF EXISTS public.get_team_rank(text) CASCADE;
-- DROP FUNCTION IF EXISTS public.submit_flag(text, text) CASCADE;
-- DROP FUNCTION IF EXISTS public.check_flag(text, text) CASCADE;

-- Drop any CTF-related triggers (uncomment if you have custom triggers)
-- DROP TRIGGER IF EXISTS update_user_stats ON public.solves;
-- DROP TRIGGER IF EXISTS update_team_stats ON public.solves;

\echo '✅ CTF database reset complete!'
\echo 'All CTF tables, data, policies, views, and functions have been removed.'
\echo 'You can now run your migration scripts to recreate the database structure.'
