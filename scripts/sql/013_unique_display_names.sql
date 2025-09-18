-- 013_unique_display_names.sql
-- Add unique constraint for display names and fix guest team issues

-- First, handle duplicate display names by making them unique
UPDATE public.profiles 
SET display_name = display_name || '_' || substr(user_id::text, 1, 8)
WHERE display_name IN (
  SELECT display_name 
  FROM public.profiles 
  WHERE display_name IS NOT NULL 
  GROUP BY display_name 
  HAVING COUNT(*) > 1
);

-- Add unique constraint for display names (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'profiles'
      AND c.conname = 'profiles_display_name_unique'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_display_name_unique
      UNIQUE (display_name);
  END IF;
END$$;

-- Create index for better performance on display_name lookups
CREATE INDEX IF NOT EXISTS idx_profiles_display_name ON public.profiles(display_name);

-- Update all users with "guest" team to individual guest teams
UPDATE public.profiles 
SET team_name = 'guest_' || user_id::text 
WHERE team_name = 'guest';

-- Update existing solves from "guest" to individual guest teams
UPDATE public.solves 
SET team_name = 'guest_' || user_id::text 
WHERE team_name = 'guest';

-- Note: Views will automatically reflect the changes since they're not materialized
