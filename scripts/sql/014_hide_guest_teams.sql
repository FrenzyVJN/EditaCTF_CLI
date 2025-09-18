-- 014_hide_guest_teams.sql
-- Update views to hide guest teams from leaderboard and teams list

-- Drop both views first to avoid dependency issues
DROP VIEW IF EXISTS public.teams CASCADE;
DROP VIEW IF EXISTS public.leaderboard CASCADE;

-- Create leaderboard view that excludes guest teams
CREATE VIEW public.leaderboard AS
WITH solves_with_team AS (
  SELECT
    COALESCE(p.team_name, s.team_name, 'guest') AS current_team,
    s.user_id,
    s.challenge_id,
    s.points,
    s.created_at,
    p.display_name
  FROM public.solves s
  LEFT JOIN public.profiles p ON p.user_id = s.user_id
),
-- Only include solves from users with display names and non-guest teams
filtered_solves AS (
  SELECT *
  FROM solves_with_team
  WHERE display_name IS NOT NULL 
    AND current_team != 'guest'
    AND NOT current_team LIKE 'guest_%'
),
team_challenge AS (
  SELECT
    current_team,
    challenge_id,
    MAX(points)::int AS points,
    MIN(created_at) AS first_solve_at
  FROM filtered_solves
  GROUP BY current_team, challenge_id
)
SELECT
  t.current_team AS team,
  COALESCE(SUM(t.points), 0)::int AS score,
  COUNT(*)::int AS solves,
  MIN(t.first_solve_at) AS first_solve_at
FROM team_challenge t
GROUP BY t.current_team
ORDER BY score DESC, first_solve_at ASC;

-- Create teams view that only shows teams with display names and excludes guest/solo teams
CREATE VIEW public.teams AS
WITH members AS (
  SELECT 
    team_name AS name, 
    COUNT(DISTINCT user_id)::int AS members
  FROM public.profiles
  WHERE display_name IS NOT NULL 
    AND team_name != 'guest'
    AND NOT team_name LIKE 'guest_%'
  GROUP BY team_name
)
SELECT
  m.name,
  m.members,
  COALESCE(l.score, 0)::int AS score
FROM members m
LEFT JOIN public.leaderboard l ON l.team = m.name
ORDER BY score DESC, name ASC;
