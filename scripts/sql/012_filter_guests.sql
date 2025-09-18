-- 012_filter_guests.sql
-- Update views to filter out guest users and improve leaderboard
-- Drop both views first to avoid dependency issues

drop view if exists public.teams cascade;
drop view if exists public.leaderboard cascade;

-- Create leaderboard view to exclude guest teams and users without display names
create view public.leaderboard as
with solves_with_team as (
  select
    coalesce(p.team_name, s.team_name, 'guest') as current_team,
    s.user_id,
    s.challenge_id,
    s.points,
    s.created_at,
    p.display_name
  from public.solves s
  left join public.profiles p on p.user_id = s.user_id
),
-- Only include solves from users with display names and non-guest teams
filtered_solves as (
  select *
  from solves_with_team
  where display_name is not null 
    and current_team != 'guest'
    and not current_team like 'solo-%'
),
team_challenge as (
  select
    current_team,
    challenge_id,
    max(points)::int as points,
    min(created_at) as first_solve_at
  from filtered_solves
  group by current_team, challenge_id
)
select
  t.current_team as team,
  coalesce(sum(t.points), 0)::int as score,
  count(*)::int as solves,
  min(t.first_solve_at) as first_solve_at
from team_challenge t
group by t.current_team;

-- Create teams view to only show teams with display names and exclude guest/solo teams
create view public.teams as
with members as (
  select 
    team_name as name, 
    count(distinct user_id)::int as members
  from public.profiles
  where display_name is not null 
    and team_name != 'guest'
    and not team_name like 'solo-%'
  group by team_name
)
select
  m.name,
  m.members,
  coalesce(l.score, 0)::int as score
from members m
left join public.leaderboard l on l.team = m.name
order by score desc, name asc;
