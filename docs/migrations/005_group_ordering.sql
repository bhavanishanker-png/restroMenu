-- Migration 005: enable Realtime + RLS for table_sessions (T24)
-- Run in the Supabase SQL editor BEFORE deploying T24.

-- 1. Enable RLS on table_sessions
alter table table_sessions enable row level security;

-- 2. Publish table_sessions to Supabase Realtime (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'table_sessions'
  ) then
    alter publication supabase_realtime add table table_sessions;
  end if;
end $$;

-- 3. Allow anonymous customers to INSERT a session (start group order)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'table_sessions' and policyname = 'anon insert table session'
  ) then
    execute $p$
      create policy "anon insert table session"
      on table_sessions
      for insert
      to anon, authenticated
      with check (true)
    $p$;
  end if;
end $$;

-- 4. Allow anyone to read sessions by id or join_code (for joining a group order)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'table_sessions' and policyname = 'public read table sessions'
  ) then
    execute $p$
      create policy "public read table sessions"
      on table_sessions
      for select
      to anon, authenticated
      using (true)
    $p$;
  end if;
end $$;

-- 5. Ensure join_code has a unique index (scoped to restaurant + open status handled in app)
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where tablename = 'table_sessions' and indexname = 'table_sessions_join_code_unique'
  ) then
    create unique index table_sessions_join_code_unique
    on table_sessions (join_code)
    where status = 'open';
  end if;
end $$;
