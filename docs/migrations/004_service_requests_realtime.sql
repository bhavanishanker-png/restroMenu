-- Migration 004: enable Realtime + RLS for service_requests (T26)
-- Run in the Supabase SQL editor BEFORE deploying T26.

-- 1. Enable RLS on service_requests (if not already on)
alter table service_requests enable row level security;

-- 2. Publish service_requests to Supabase Realtime (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'service_requests'
  ) then
    alter publication supabase_realtime add table service_requests;
  end if;
end $$;

-- 3. Allow anonymous customers to INSERT a service request
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'service_requests' and policyname = 'anon insert service request'
  ) then
    execute $p$
      create policy "anon insert service request"
      on service_requests
      for insert
      to anon, authenticated
      with check (true)
    $p$;
  end if;
end $$;

-- 4. Allow kitchen staff to read all service requests for their restaurant
--    (kitchen reads via service-role key in API routes — this policy covers
--     the Realtime subscription channel which uses the anon/auth key)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'service_requests' and policyname = 'public read service requests'
  ) then
    execute $p$
      create policy "public read service requests"
      on service_requests
      for select
      to anon, authenticated
      using (true)
    $p$;
  end if;
end $$;

-- 5. Allow kitchen to update status (resolve requests)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'service_requests' and policyname = 'public update service request status'
  ) then
    execute $p$
      create policy "public update service request status"
      on service_requests
      for update
      to anon, authenticated
      using (true)
      with check (true)
    $p$;
  end if;
end $$;
