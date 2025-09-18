-- 010_fix_team_dedup.sql
-- Fixes the 009_team_dedup.sql syntax by attaching WITH clauses directly to each CREATE VIEW.
-- Safe to re-run: uses CREATE OR REPLACE VIEW and does not drop dependent objects.

-- Leaderboard: attribute solves to a user's CURRENT team (from profiles),
-- and count each challenge at most once per team.
create or replace view public.leaderboard as
with solves_with_team as (
  select
    coalesce(p.team_name, s.team_name, 'guest') as current_team,
    s.user_id,
    s.challenge_id,
    s.points,
    s.created_at
  from public.solves s
  left join public.profiles p on p.user_id = s.user_id
),
team_challenge as (
  select
    current_team,
    challenge_id,
    max(points)::int as points,
    min(created_at) as first_solve_at
  from solves_with_team
  group by current_team, challenge_id
)
select
  t.current_team as team,
  coalesce(sum(t.points), 0)::int as score,
  count(*)::int as solves,
  min(t.first_solve_at) as first_solve_at
from team_challenge t
group by t.current_team;

-- Teams view: members from profiles; score from leaderboard (deduped).
create or replace view public.teams as
with members as (
  select team_name as name, count(distinct user_id)::int as members
  from public.profiles
  group by team_name
)
select
  m.name,
  m.members,
  coalesce(l.score, 0)::int as score
from members m
left join public.leaderboard l on l.team = m.name
order by score desc, name asc;
