-- 015_rbac_system.sql
-- Role-Based Access Control system to replace hardcoded admin emails

-- Create roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin', 'super_admin')) DEFAULT 'user',
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Unique constraint to prevent duplicate active roles for same user
  UNIQUE(user_id, role)
);

-- Create competition settings table
CREATE TABLE IF NOT EXISTS public.competition_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  registration_start TIMESTAMPTZ,
  registration_end TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT false,
  scoring_type TEXT NOT NULL CHECK (scoring_type IN ('static', 'dynamic', 'king_of_hill')) DEFAULT 'static',
  max_team_size INTEGER DEFAULT 4,
  allow_team_switching BOOLEAN DEFAULT true,
  first_blood_bonus INTEGER DEFAULT 10,
  difficulty_multipliers JSONB DEFAULT '{"easy": 1.0, "medium": 1.5, "hard": 2.0}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create announcements table
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create team invitations table
CREATE TABLE IF NOT EXISTS public.team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_name TEXT NOT NULL,
  inviter_id UUID NOT NULL REFERENCES auth.users(id),
  invited_email TEXT NOT NULL,
  invited_user_id UUID REFERENCES auth.users(id),
  status TEXT CHECK (status IN ('pending', 'accepted', 'declined', 'expired')) DEFAULT 'pending',
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  responded_at TIMESTAMPTZ
);

-- Create team roles table for enhanced team management
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_name TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('member', 'captain', 'co_captain')) DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invited_by UUID REFERENCES auth.users(id),
  
  UNIQUE(team_name, user_id)
);

-- Update challenges table to support scheduling and categories
ALTER TABLE public.challenges 
ADD COLUMN IF NOT EXISTS release_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS category_icon TEXT,
ADD COLUMN IF NOT EXISTS max_attempts INTEGER,
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS prerequisites JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES auth.users(id);

-- Update solves table to track more detailed solve information
ALTER TABLE public.solves
ADD COLUMN IF NOT EXISTS solve_time INTERVAL,
ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS is_first_blood BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS bonus_points INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS hint_used BOOLEAN DEFAULT false;

-- Create solve attempts tracking table
CREATE TABLE IF NOT EXISTS public.solve_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  challenge_id TEXT NOT NULL REFERENCES public.challenges(id),
  submitted_flag TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  points_awarded INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

-- Enable RLS on new tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solve_attempts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_roles
DROP POLICY IF EXISTS "user_roles_select_all" ON public.user_roles;
CREATE POLICY "user_roles_select_all" ON public.user_roles FOR SELECT USING (true);

-- RLS Policies for competition_settings
DROP POLICY IF EXISTS "competition_settings_select_all" ON public.competition_settings;
CREATE POLICY "competition_settings_select_all" ON public.competition_settings FOR SELECT USING (true);

-- RLS Policies for announcements
DROP POLICY IF EXISTS "announcements_select_published" ON public.announcements;
CREATE POLICY "announcements_select_published" ON public.announcements 
  FOR SELECT USING (is_published = true AND (expires_at IS NULL OR expires_at > NOW()));

-- RLS Policies for team_invitations
DROP POLICY IF EXISTS "team_invitations_select_own" ON public.team_invitations;
CREATE POLICY "team_invitations_select_own" ON public.team_invitations 
  FOR SELECT USING (inviter_id = auth.uid() OR invited_user_id = auth.uid());

DROP POLICY IF EXISTS "team_invitations_insert_own" ON public.team_invitations;
CREATE POLICY "team_invitations_insert_own" ON public.team_invitations 
  FOR INSERT WITH CHECK (inviter_id = auth.uid());

DROP POLICY IF EXISTS "team_invitations_update_own" ON public.team_invitations;
CREATE POLICY "team_invitations_update_own" ON public.team_invitations 
  FOR UPDATE USING (invited_user_id = auth.uid()) WITH CHECK (invited_user_id = auth.uid());

-- RLS Policies for team_members
DROP POLICY IF EXISTS "team_members_select_all" ON public.team_members;
CREATE POLICY "team_members_select_all" ON public.team_members FOR SELECT USING (true);

DROP POLICY IF EXISTS "team_members_insert_own" ON public.team_members;
CREATE POLICY "team_members_insert_own" ON public.team_members 
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- RLS Policies for solve_attempts
DROP POLICY IF EXISTS "solve_attempts_select_own" ON public.solve_attempts;
CREATE POLICY "solve_attempts_select_own" ON public.solve_attempts 
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "solve_attempts_insert_own" ON public.solve_attempts;
CREATE POLICY "solve_attempts_insert_own" ON public.solve_attempts 
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON public.team_invitations(invited_email);
CREATE INDEX IF NOT EXISTS idx_team_invitations_user_id ON public.team_invitations(invited_user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON public.team_members(team_name);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_solve_attempts_user_challenge ON public.solve_attempts(user_id, challenge_id);
CREATE INDEX IF NOT EXISTS idx_solve_attempts_created_at ON public.solve_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_challenges_release_time ON public.challenges(release_time);
CREATE INDEX IF NOT EXISTS idx_announcements_published ON public.announcements(is_published, published_at);

-- Function to check if user has specific role
CREATE OR REPLACE FUNCTION public.user_has_role(user_id UUID, required_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = user_has_role.user_id 
    AND role = required_role 
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's highest role
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS TEXT AS $$
DECLARE
  user_role TEXT := 'user';
BEGIN
  SELECT role INTO user_role
  FROM public.user_roles 
  WHERE user_roles.user_id = get_user_role.user_id 
  AND is_active = true
  AND (expires_at IS NULL OR expires_at > NOW())
  ORDER BY 
    CASE role 
      WHEN 'super_admin' THEN 3
      WHEN 'admin' THEN 2
      WHEN 'user' THEN 1
      ELSE 0
    END DESC
  LIMIT 1;
  
  RETURN COALESCE(user_role, 'user');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update leaderboard view to include first blood tracking
DROP VIEW IF EXISTS public.leaderboard CASCADE;
CREATE VIEW public.leaderboard AS
SELECT
  s.team_name as team,
  COALESCE(SUM(s.points + s.bonus_points), 0)::int as score,
  COUNT(*)::int as solves,
  COUNT(CASE WHEN s.is_first_blood THEN 1 END)::int as first_bloods,
  MIN(s.created_at) as first_solve_at
FROM public.solves s
GROUP BY s.team_name
ORDER BY score DESC, first_solve_at ASC;

-- Create updated teams view with enhanced information
CREATE OR REPLACE VIEW public.teams_enhanced AS
SELECT
  tm.team_name as name,
  COUNT(DISTINCT tm.user_id)::int as members,
  COALESCE(SUM(s.points + COALESCE(s.bonus_points, 0)), 0)::int as score,
  COUNT(s.*)::int as total_solves,
  COUNT(CASE WHEN s.is_first_blood THEN 1 END)::int as first_bloods,
  MIN(tm.joined_at) as created_at,
  ARRAY_AGG(
    JSON_BUILD_OBJECT(
      'user_id', tm.user_id,
      'role', tm.role,
      'display_name', p.display_name,
      'joined_at', tm.joined_at
    ) ORDER BY tm.joined_at
  ) as member_details
FROM public.team_members tm
LEFT JOIN public.profiles p ON p.user_id = tm.user_id
LEFT JOIN public.solves s ON s.team_name = tm.team_name
WHERE tm.team_name NOT LIKE 'guest%'
GROUP BY tm.team_name
ORDER BY score DESC, created_at ASC;