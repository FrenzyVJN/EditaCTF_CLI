-- Enable required extensions
create extension if not exists pgcrypto;

-- Challenges (public, safe to expose without flags)
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

-- Flags in a separate secure table
create table if not exists public.challenge_flags (
  challenge_id text primary key references public.challenges(id) on delete cascade,
  flag text not null
);

-- Profiles keyed by auth uid
create table if not exists public.profiles (
  user_id uuid primary key,
  display_name text,
  team_name text not null,
  created_at timestamptz not null default now()
);

-- Solves
create table if not exists public.solves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  team_name text not null,
  challenge_id text not null references public.challenges(id) on delete cascade,
  points int not null,
  created_at timestamptz not null default now(),
  unique (user_id, challenge_id)
);

-- Optional docs table for rules
create table if not exists public.docs (
  key text primary key,
  value text not null
);

-- Views (only create if absent; later migrations may redefine with more columns)
do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'v' and n.nspname = 'public' and c.relname = 'leaderboard'
  ) then
    execute $lv$create view public.leaderboard as
      select s.team_name as team,
        coalesce(sum(s.points), 0)::int as score,
        count(*)::int as solves
      from public.solves s
      group by s.team_name
      order by score desc, min(s.created_at);$lv$;
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'v' and n.nspname = 'public' and c.relname = 'teams'
  ) then
    execute $tv$create view public.teams as
      select p.team_name as name,
        count(distinct p.user_id)::int as members,
        coalesce(sum(s.points), 0)::int as score
      from public.profiles p
      left join public.solves s on s.team_name = p.team_name
      group by p.team_name
      order by score desc;$tv$;
  end if;
end$$;

-- RLS
alter table public.challenges enable row level security;
alter table public.challenge_flags enable row level security;
alter table public.profiles enable row level security;
alter table public.solves enable row level security;
alter table public.docs enable row level security;

-- Policies
-- challenges: readable by anyone
drop policy if exists "challenges_select_all" on public.challenges;
create policy "challenges_select_all" on public.challenges for select using (true);

-- challenge_flags: no select for anon/auth (only service role)
drop policy if exists "flags_no_select" on public.challenge_flags;
-- Intentionally no select policy => blocked. (Insert/update via admin only)
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

drop policy if exists "solves_insert_auth" on public.solves;
create policy "solves_insert_auth" on public.solves
  for insert with check (auth.uid() = user_id);

-- docs (rules)
drop policy if exists "docs_read_rules" on public.docs;
create policy "docs_read_rules" on public.docs for select using (true);

-- Realtime on solves
alter table public.solves replica identity full;
do $$
begin
  begin
    -- Try to create publication (only possible in self-hosted contexts). If it exists, ignore.
    create publication supabase_realtime for table public.solves;
  exception
    when duplicate_object then
      -- Add table to existing publication; ignore duplicate_object again if already added.
      begin
        alter publication supabase_realtime add table public.solves;
      exception when duplicate_object then null; end;
    when insufficient_privilege then
      -- Hosted environments may block creating publications; ignore silently.
      null;
    when others then
      null;
  end;
end$$;

-- Seed rules
insert into public.docs(key, value) values
  ('rules', 'EditaCTF Rules
----------------
1. Be respectful. No harassment or abuse.
2. No sharing flags, brute force against infrastructure, or attacking other teams.
3. Automated scanning of the platform is prohibited.
4. One account per participant or team; pick a team name using ''team set <name>''.
5. Flag format: editaCTF{...} unless stated otherwise.
6. Have fun and learn!

Contact organizers for issues.')
on conflict (key) do update set value = excluded.value;
