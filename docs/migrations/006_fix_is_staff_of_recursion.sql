-- ============================================================
-- Fix: infinite recursion in the `staff` RLS policy.
--
-- `is_staff_of()` selects from `staff`, and the policy
-- "staff read own record" ON staff calls `is_staff_of()`.
-- Because the function was not SECURITY DEFINER it ran as the
-- invoker with RLS applied, so evaluating the policy re-entered
-- the policy. Postgres unwound with:
--   54001  stack depth limit exceeded
--
-- Any read of `staff` by an anon/authenticated role failed —
-- including the owner/manager lookup in POST /api/auth/login,
-- which surfaced as a misleading "No active owner or manager
-- account found." 403.
--
-- SECURITY DEFINER makes the lookup run as the function owner,
-- which bypasses RLS for that one query and breaks the cycle.
-- `search_path` is pinned so the definer context cannot be
-- hijacked by a caller-controlled schema.
-- ============================================================

create or replace function is_staff_of(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from staff
     where restaurant_id = p_restaurant_id
       and auth_user_id = auth.uid()
       and is_active = true
  );
$$;

-- Restrict who may call it. It leaks nothing beyond "am I staff
-- here", but there is no reason for anon to ask.
revoke execute on function is_staff_of(uuid) from public;
grant execute on function is_staff_of(uuid) to authenticated, service_role;
