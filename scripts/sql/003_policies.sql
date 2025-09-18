-- 003_policies.sql
-- Enable RLS and add policies.

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
-- Block all CRUD via RLS; admins use service role which bypasses RLS.
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
