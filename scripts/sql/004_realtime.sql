-- 004_realtime.sql
-- Add solves to the default Supabase realtime publication.
-- In hosted Supabase you typically cannot create publications, only alter the existing one.

alter table public.solves replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.solves;
  exception
    when duplicate_object then
      -- Table already in the publication
      null;
    when undefined_object then
      -- Publication not available (self-hosted or restricted)
      null;
    when others then
      -- Insufficient privilege or anything else: ignore to keep setup idempotent
      null;
  end;
end
$$;
