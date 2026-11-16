-- 012 — Split bill: one row per person's share of an order (task T38).
--
-- A guest splits an unpaid order into 2–10 shares. Each share gets its own
-- fixed-amount, single-use Razorpay UPI QR. The qr_code.credited webhook marks
-- a share paid; once the paid shares cover orders.total, the order is marked
-- paid. Staff can also mark a share as paid in cash.
--
-- Amounts are computed server-side by pricing.ts and always add up to the
-- order total. 'cancelled' shares are kept for audit when a split is redone.

create table if not exists order_payment_shares (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references restaurants(id) on delete cascade,
  order_id            uuid not null references orders(id) on delete cascade,
  position            int  not null check (position between 1 and 10),
  label               text not null check (char_length(label) between 1 and 40),
  amount              numeric(10,2) not null check (amount >= 1),
  status              text not null default 'pending'
                        check (status in ('pending','paid','cancelled')),
  method              text check (method in ('upi','cash')),
  razorpay_qr_id      text unique,
  qr_image_url        text,
  qr_expires_at       timestamptz,
  razorpay_payment_id text unique,
  marked_by           uuid references staff(id) on delete set null,
  paid_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists idx_order_payment_shares_order
  on order_payment_shares (restaurant_id, order_id);

-- One active share per position: two guests splitting the same bill at the
-- same moment can't both create a set — the second insert fails and is told
-- to refresh.
create unique index if not exists order_payment_shares_active_position
  on order_payment_shares (order_id, position)
  where status <> 'cancelled';

-- Server-only table: RLS on with NO policies. The app reads and writes it with
-- the service role and scopes every query by restaurant_id itself.
alter table order_payment_shares enable row level security;
