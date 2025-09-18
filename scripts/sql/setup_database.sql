-- Combined CTF Database Setup (excludes seed data)
-- Run this in Supabase SQL editor or via psql
-- This combines all migration scripts except 005_seed.sql

\echo 'Setting up CTF database...'

-- From 001_init.sql
\echo 'Creating initial tables and extensions...'
create extension if not exists pgcrypto;

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

\echo 'Setting up RLS policies...'

-- From 003_policies.sql
alter table public.challenges enable row level security;
alter table public.challenge_flags enable row level security;
alter table public.profiles enable row level security;
alter table public.solves enable row level security;
alter table public.docs enable row level security;

-- challenges: readable by anyone
drop policy if exists "challenges_select_all" on public.challenges;
create policy "challenges_select_all" on public.challenges for select using (true);

-- challenge_flags: no select for anon/auth (service role only)
drop policy if exists "flags_admin_insert" on public.challenge_flags;
drop policy if exists "flags_admin_update" on public.challenge_flags;
drop policy if exists "flags_admin_delete" on public.challenge_flags;
create policy "flags_admin_insert" on public.challenge_flags for insert with check (false);
create policy "flags_admin_update" on public.challenge_flags for update using (false) with check (false);
create policy "flags_admin_delete" on public.challenge_flags for delete using (false);

-- profiles
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles for select using (true);

drop policy if exists "profiles_upsert_own" on public.profiles;
create policy "profiles_upsert_own" on public.profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- solves
drop policy if exists "solves_select_all" on public.solves;
create policy "solves_select_all" on public.solves for select using (true);

drop policy if exists "solves_insert_own" on public.solves;
create policy "solves_insert_own" on public.solves
  for insert with check (auth.uid() = user_id);

-- docs: readable by anyone
drop policy if exists "docs_select_all" on public.docs;
create policy "docs_select_all" on public.docs for select using (true);

\echo 'Setting up realtime...'

-- Enable realtime for relevant tables
alter publication supabase_realtime add table public.challenges;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.solves;

\echo 'Database setup complete!'
\echo 'Next steps:'
\echo '1. Add your challenges to the challenges table'
\echo '2. Add corresponding flags to challenge_flags table'
\echo '3. Set up your rules in the docs table'
