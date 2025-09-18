-- 008_views_current_team.sql
-- Attribute scores to each user's CURRENT team (from profiles), not the team at solve time.
-- Also allow users to update their own solves (for audit consistency when switching teams).

-- Safer to re-create views to avoid stale definitions.
-- Drop dependent views in correct order (teams depends on leaderboard definitions in later scripts)
drop view if exists public.teams;
drop view if exists public.leaderboard;
create view public.leaderboard as
select
  coalesce(p.team_name, s.team_name, 'guest') as team,
  coalesce(sum(s.points), 0)::int as score,
  count(*)::int as solves,
  min(s.created_at) as first_solve_at
from public.solves s
left join public.profiles p on p.user_id = s.user_id
group by coalesce(p.team_name, s.team_name, 'guest');

create view public.teams as
select
  p.team_name as name,
  count(distinct p.user_id)::int as members,
  coalesce(sum(s.points), 0)::int as score
from public.profiles p
left join public.solves s on s.user_id = p.user_id
group by p.team_name;

-- Policy so a user can update their solves.team_name (optional; views don't require it, but this keeps rows consistent)
drop policy if exists "solves_update_own" on public.solves;
create policy "solves_update_own" on public.solves
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
