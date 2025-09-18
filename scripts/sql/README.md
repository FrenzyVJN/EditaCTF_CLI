# CTF Database Setup Guide

## Quick Start

### Option 1: Run Individual Scripts (Recommended)
Use the automated migration script:

```bash
# Make sure your local Supabase is running
supabase start

# Run the migration script
./run_migrations.sh

# Or with custom database URL
./run_migrations.sh "postgresql://user:password@localhost:5432/dbname"
```

### Option 2: All-in-One Setup
If you prefer to run everything at once:

```bash
# Using psql
psql "postgresql://postgres:postgres@localhost:54322/postgres" -f setup_database.sql

# Or in Supabase Dashboard
# Copy the contents of setup_database.sql and paste into Database > SQL Editor
```

## Adding Your Own Challenges

After running the migrations, add your challenges using this format:

### 1. Add Challenge Metadata

```sql
INSERT INTO public.challenges (id, name, category, points, difficulty, description, daily, files, hint) 
VALUES (
  'your-challenge-id',           -- Unique identifier
  'Your Challenge Name',         -- Display name
  'web',                        -- Category: web, pwn, crypto, rev, misc, etc.
  200,                          -- Points value
  'medium',                     -- Difficulty: easy, medium, hard
  'Your challenge description here. Make it engaging!',
  false,                        -- Is this a daily challenge?
  '["README.md", "app.py"]'::jsonb,  -- Array of file names (JSON format)
  'Your hint here'              -- Helpful hint for participants
);
```

### 2. Add Challenge Flag

```sql
INSERT INTO public.challenge_flags (challenge_id, flag) 
VALUES (
  'your-challenge-id',          -- Must match the challenge ID above
  'editaCTF{your_flag_here}'    -- The flag participants need to find
);
```

### 3. Add Rules (Optional)

```sql
INSERT INTO public.docs(key, value) VALUES
('rules', 'Your CTF Rules Here...')
ON CONFLICT (key) DO UPDATE SET value = excluded.value;
```

## Example Challenge

```sql
-- Add a web challenge
INSERT INTO public.challenges (id, name, category, points, difficulty, description, daily, files, hint) 
VALUES (
  'login-bypass',
  'Admin Login',
  'web',
  150,
  'easy',
  'Find a way to login as admin without knowing the password. The login form might be vulnerable to injection attacks.',
  false,
  '["index.php", "login.php", "hint.txt"]'::jsonb,
  'Try SQL injection techniques. What happens when you use special characters?'
);

-- Add the corresponding flag
INSERT INTO public.challenge_flags (challenge_id, flag) 
VALUES (
  'login-bypass',
  'editaCTF{sql_injection_is_powerful}'
);
```

## File Structure

The scripts run in this order:
- ✅ 001_init.sql - Initial tables and extensions
- ✅ 002_core.sql - Core table definitions  
- ✅ 003_policies.sql - Row Level Security policies
- ✅ 004_realtime.sql - Realtime subscriptions
- ❌ 005_seed.sql - **SKIPPED** (sample data)
- ✅ 006_fix_all.sql - Database fixes
- ✅ 007_teams.sql - Team-related improvements
- ✅ 008_views_current_team.sql - Team views
- ✅ 009_team_dedup.sql - Team deduplication
- ✅ 010_fix_team_dedup.sql - Team dedup fixes
- ✅ 011_admin_improvements.sql - Admin features
- ✅ 012_filter_guests.sql - Guest filtering
- ✅ 013_unique_display_names.sql - Unique names
- ✅ 014_hide_guest_teams.sql - Hide guest teams

## Troubleshooting

### Database Connection Issues
```bash
# Check if Supabase is running
supabase status

# Start Supabase if needed
supabase start

# Check the connection manually
psql "postgresql://postgres:postgres@localhost:54322/postgres" -c "SELECT 1;"
```

### Script Permissions
```bash
# Make script executable if needed
chmod +x run_migrations.sh
```

### View Database Contents
After setup, you can verify everything worked:

```sql
-- Check if tables exist
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

-- View your challenges
SELECT id, name, category, points FROM public.challenges;

-- Check RLS policies
SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public';
```

## Resetting the Database

If you need to completely wipe the CTF database and start fresh:

### Option 1: Interactive Reset Script
```bash
# Run the interactive reset script (recommended)
./reset_database.sh

# Or with custom database URL
./reset_database.sh "postgresql://user:password@localhost:5432/dbname"
```

This script will:
- ⚠️  Require explicit confirmation ("DELETE EVERYTHING")
- 🗑️  Remove all CTF tables, data, policies, and views
- 🔒 Clean up realtime subscriptions
- 📊 Provide detailed progress output

### Option 2: Direct SQL Reset
```bash
# Run SQL reset directly
psql "postgresql://postgres:postgres@localhost:54322/postgres" -f reset_database.sql

# Or copy the contents of reset_database.sql into Supabase SQL Editor
```

### Complete Workflow
```bash
# 1. Reset everything
./reset_database.sh

# 2. Recreate the database structure
./run_migrations.sh

# 3. Add your challenges
# (Use the examples above)
```

## Security Notes

- The `challenge_flags` table is protected by RLS and only accessible via service role
- Regular users can see challenges but not flags
- Users can only modify their own profiles
- All tables have appropriate Row Level Security policies
