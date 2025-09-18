-- 007_teams.sql
-- Adds password-protected team management.
-- Run in Supabase SQL Editor.

create table if not exists public.ctf_teams (
  name text primary key,
  password_hash text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.ctf_teams enable row level security;

-- Policies
-- Everyone can read team names (for join prompts, etc.)
drop policy if exists "ctf_teams_select_all" on public.ctf_teams;
create policy "ctf_teams_select_all" on public.ctf_teams for select using (true);

-- Only authenticated users can create a team they own
drop policy if exists "ctf_teams_insert_auth" on public.ctf_teams;
create policy "ctf_teams_insert_auth" on public.ctf_teams
  for insert with check (auth.role() = 'authenticated' and created_by = auth.uid());

-- Prevent updates/deletes for now (organizers can change via service role)
drop policy if exists "ctf_teams_update_none" on public.ctf_teams;
create policy "ctf_teams_update_none" on public.ctf_teams
  for update using (false) with check (false);

drop policy if exists "ctf_teams_delete_none" on public.ctf_teams;
create policy "ctf_teams_delete_none" on public.ctf_teams
  for delete using (false);
