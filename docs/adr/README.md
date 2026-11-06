# Architecture Decision Records

Each record explains one design decision in QBite: the problem, the options considered, what was chosen, and what it costs. They describe the code as it is, including known limitations.

| # | Decision | One-line summary |
|---|---|---|
| [0001](0001-shared-database-multi-tenancy.md) | Shared-database multi-tenancy | One Postgres for all restaurants; `restaurant_id` filter in code is the primary guard, RLS is the backstop |
| [0002](0002-server-side-pricing-and-snapshots.md) | Server-side pricing and order snapshots | The server reprices every order from item IDs; line items freeze name and price at order time |
| [0003](0003-idempotent-order-creation.md) | Idempotent order creation | A client-generated key plus a unique constraint turns double-submits into one order |
| [0004](0004-order-state-machine.md) | Order state machine with compare-and-set | One-way status transitions, conflicting writes rejected with 409, every change logged |
| [0005](0005-daily-order-numbers.md) | Daily order numbers | Human-friendly numbers that reset daily, allocated under an advisory lock |
| [0006](0006-staff-sessions.md) | Staff sessions: signed cookie + DB check | Stateless cookie for identity, a per-request staff lookup for revocation |
| [0007](0007-kitchen-board-polling.md) | Kitchen board: polling over realtime | Poll a tenant-scoped server route every 8 s; Realtime only nudges the poll |
| [0008](0008-offline-kitchen-display.md) | Offline-tolerant kitchen display | Optimistic updates, a localStorage queue, and server-wins conflict handling |
| [0009](0009-ai-as-untrusted-component.md) | AI as an untrusted component | AI drafts and suggests; code validates everything; humans approve every write |

## Format

Every record uses the same sections: **Context** (the forces at play), **Options considered**, **Decision**, **Consequences** (good and bad), and **Where it lives** (files to read).

To add one, copy the structure of an existing file, take the next number, and add a row above.
