-- 002_core.sql
-- Run this in Supabase SQL editor (Database > SQL).
-- Creates core tables and views only. No policies or realtime here.

create extension if not exists pgcrypto;

-- Core tables
create table if not exists public.challenges (
  id text primary key,
  name text not null,
  category text not null,
  points int not null,
  difficulty text not null,
  description text not null,
  daily boolean default false,
  files jsonb not null default '[]'::jsonb,
  hint text not null
);

create table if not exists public.challenge_flags (
  challenge_id text primary key references public.challenges(id) on delete cascade,
  flag text not null
);

create table if not exists public.profiles (
  user_id uuid primary key,
  display_name text,
  team_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.solves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  team_name text not null,
  challenge_id text not null references public.challenges(id) on delete cascade,
  points int not null,
  created_at timestamptz not null default now(),
  unique (user_id, challenge_id)
);

create table if not exists public.docs (
  key text primary key,
  value text not null
);

-- Views
create or replace view public.leaderboard as
select
  s.team_name as team,
  coalesce(sum(s.points), 0)::int as score,
  count(*)::int as solves
from public.solves s
group by s.team_name
order by score desc, min(s.created_at);

create or replace view public.teams as
select
  p.team_name as name,
  count(distinct p.user_id)::int as members,
  coalesce(sum(s.points), 0)::int as score
from public.profiles p
left join public.solves s on s.team_name = p.team_name
group by p.team_name
order by score desc;
