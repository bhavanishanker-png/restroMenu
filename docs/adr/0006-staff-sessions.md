# 0006 — Staff sessions: signed cookie + database check

**Status:** Accepted

## Context

Two kinds of staff sign in:
- **Owners and managers** with email and password (Supabase Auth).
- **Kitchen staff and waiters** with a 4-digit PIN on a shared tablet. They don't have email accounts, and a shared device can't hold a personal login.

Both need a session that identifies the person, their restaurant and their role. Removing or demoting a staff member must take effect immediately, not when their session expires.

## Options considered

1. **Supabase Auth sessions for everyone.** Doesn't fit PIN login: kitchen staff have no email identity.
2. **Stateless signed cookie (JWT-style) holding staff ID, restaurant ID and role.** Fast and simple, but a cookie can't be revoked: a fired employee keeps access, and a demoted manager keeps manager rights, until it expires.
3. **Server-side session table.** Revocable, but every request needs a session lookup anyway, plus session cleanup.
4. **Signed cookie for identity, plus a per-request check against the `staff` table.**

## Decision

Option 4.

- After login (password or PIN), the server issues an **HTTP-only signed cookie** (`qbite-staff`, 8-hour lifetime) containing the staff ID and restaurant ID.
- On each request, `getStaffSession()` verifies the signature **and** loads the staff row (`is_active = true`, same restaurant). The **role comes from the database, not the cookie.**
- The lookup **fails closed**: if the database errors, the request is treated as signed out.
- React's `cache()` dedupes the lookup within one server render, so a page with a layout and nested components does one query, not five.
- `middleware.ts` only checks that the cookie exists, to redirect quickly at the edge; real verification happens in the route or page.
- PIN login is rate-limited per IP, and wrong staff vs wrong PIN return the same error, so attackers can't enumerate staff.

## Consequences

- ✅ Removing or demoting staff takes effect on their next request.
- ✅ One session model for password and PIN logins.
- ⚠️ One extra indexed query per request. Acceptable; it's the price of revocation.
- ⚠️ **Supabase Realtime can't see these users.** RLS policies identify staff via `auth.uid()`, which a custom cookie never sets, so the browser's anon client reads no orders. This forced the polling design in [0007](0007-kitchen-board-polling.md).
- ⚠️ The PIN rate limiter is in memory, so on serverless each instance counts separately. Moving it to Redis makes the limit exact.

## Where it lives

- `src/lib/auth.ts` — signing, verification, `loadActiveStaff`, `requireRole`
- `src/app/api/auth/login/route.ts` — password and PIN login
- `src/middleware.ts` — cookie-presence redirect
