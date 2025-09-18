-- 011_admin_improvements.sql
-- Add admin-specific improvements and audit logging

-- Create admin audit log table
create table if not exists public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null,
  action text not null,
  target_type text not null, -- 'challenge', 'user', 'team', etc.
  target_id text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

-- Enable RLS on admin logs
alter table public.admin_logs enable row level security;

-- Only admins can read admin logs (you'll need to implement proper admin role checking)
drop policy if exists "admin_logs_admin_only" on public.admin_logs;
create policy "admin_logs_admin_only" on public.admin_logs
  for all using (false); -- Block all access via RLS; use service role for admin operations

-- Add indexes for better performance
create index if not exists idx_solves_team_challenge on public.solves(team_name, challenge_id);
create index if not exists idx_solves_user_created on public.solves(user_id, created_at desc);
create index if not exists idx_profiles_team on public.profiles(team_name);
create index if not exists idx_admin_logs_created on public.admin_logs(created_at desc);

-- Add constraint to ensure flag format
do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'challenge_flags'
      and c.conname = 'check_flag_format'
  ) then
    alter table public.challenge_flags
      add constraint check_flag_format
      check (flag ~ '^editaCTF\{.*\}$');
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'challenges'
      and c.conname = 'check_points_range'
  ) then
    alter table public.challenges
      add constraint check_points_range
      check (points >= 0 and points <= 10000);
  end if;
end$$;
