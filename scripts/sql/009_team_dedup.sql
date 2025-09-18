-- 009_team_dedup.sql
-- Ensure points are awarded only once per team per challenge by aggregating
-- solves per CURRENT team membership and per challenge. Also rebuild teams view.

-- Build a normalized view of solves attributed to a user's current team.
-- If a user switches teams, their solves move with them.
-- Drop in dependency order: teams first then leaderboard
drop view if exists public.teams;
drop view if exists public.leaderboard;

-- Leaderboard: aggregate unique challenge solves per current team
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

-- Teams view: members + score from leaderboard
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
