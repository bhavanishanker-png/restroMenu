-- 011 — Personal access tokens for the owner MCP server (task T35).
--
-- An owner or manager creates a token in the dashboard and pastes it into
-- Claude Desktop / Claude Code. Only a SHA-256 hash is stored; the token
-- itself is shown once and never again. Tokens are random (256 bits), so a
-- fast hash is enough — there is nothing to brute-force.
--
-- restaurant_id and staff_id come from the creator's verified session. On
-- every MCP request the server also re-checks that the staff member is still
-- active and still an owner or manager, so removing or demoting someone
-- disables their tokens immediately, even before they are revoked.

create table if not exists staff_access_tokens (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  staff_id      uuid not null references staff(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 60),
  token_prefix  text not null,                 -- first 12 chars, for display only
  token_hash    text not null unique,          -- sha256 hex of the full token
  scopes        text[] not null default '{read}',
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

create index if not exists idx_staff_access_tokens_restaurant
  on staff_access_tokens (restaurant_id);

-- Server-only table: RLS on with NO policies, so the anon and authenticated
-- roles can't read even the hashes. The app uses the service role and scopes
-- every query by restaurant_id itself.
alter table staff_access_tokens enable row level security;
