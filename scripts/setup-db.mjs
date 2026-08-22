/**
 * Bootstraps the Supabase database from scratch.
 * Safe to re-run — skips steps that are already done.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/setup-db.mjs
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = "fvstopmvinuzogaiflfl";
const SERVICE_ROLE_KEY = "sb_secret_rQk9JnUbXavquVvUjs88PA_WSHuchyN";
const SUPABASE_URL = "https://fvstopmvinuzogaiflfl.supabase.co";

const PAT = process.env.SUPABASE_ACCESS_TOKEN;
if (!PAT) {
  console.error("❌  Missing SUPABASE_ACCESS_TOKEN.");
  console.error("   Run:  SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/setup-db.mjs");
  process.exit(1);
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function runSQL(label, sql) {
  process.stdout.write(`  ${label}... `);
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    console.error(`\n❌  Failed (${res.status}):`, body.slice(0, 400));
    process.exit(1);
  }
  console.log("✅");
}

async function queryOne(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

async function createAuthUser(email, password) {
  process.stdout.write(`  Create auth user ${email}... `);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = await res.json();
  if (!res.ok) {
    if (res.status === 422) { console.log("already exists, skipping."); return null; }
    console.error(`\n❌  Failed (${res.status}):`, JSON.stringify(body).slice(0, 200));
    process.exit(1);
  }
  console.log("✅");
  return body.id;
}

// ── main ─────────────────────────────────────────────────────────────────────

const docs = join(__dirname, "../docs");
console.log("\n🚀  QBite — database setup\n");

// 1. Schema — skip if restaurants table already exists
const tableExists = await queryOne(
  `SELECT 1 FROM information_schema.tables WHERE table_name = 'restaurants' AND table_schema = 'public'`
);
if (tableExists) {
  console.log("  schema.sql... already applied, skipping.");
} else {
  await runSQL("schema.sql", readFileSync(join(docs, "schema.sql"), "utf8"));
}

// 2. Order function — skip if create_order function already exists
const fnExists = await queryOne(
  `SELECT 1 FROM pg_proc WHERE proname = 'create_order'`
);
if (fnExists) {
  console.log("  002_create_order_fn.sql... already applied, skipping.");
} else {
  await runSQL("002_create_order_fn.sql", readFileSync(join(docs, "migrations/002_create_order_fn.sql"), "utf8"));
}

// 3. Realtime (now idempotent)
await runSQL("003_order_tracker_realtime.sql", readFileSync(join(docs, "migrations/003_order_tracker_realtime.sql"), "utf8"));

// 4. Seed — skip if restaurant row already exists
const seedExists = await queryOne(`SELECT 1 FROM restaurants WHERE slug = 'tandoori-hut'`);
if (seedExists) {
  console.log("  seed.sql... already applied, skipping.");
} else {
  await runSQL("seed.sql", readFileSync(join(docs, "seed.sql"), "utf8"));
}

// 5. Owner auth user
await createAuthUser("owner@tandoorihut.com", "Test1234!");

// 6. Staff row
await runSQL(
  "Link owner → staff",
  `INSERT INTO staff (restaurant_id, auth_user_id, name, role, is_active)
   SELECT r.id, u.id, 'Owner', 'owner', true
   FROM restaurants r, auth.users u
   WHERE r.slug = 'tandoori-hut' AND u.email = 'owner@tandoorihut.com'
   ON CONFLICT DO NOTHING;`
);

console.log(`
✅  All done!

Login:   http://localhost:3000/login
  Email:    owner@tandoorihut.com
  Password: Test1234!

Admin:   http://localhost:3000/admin/login
  Secret:   qbite-dev-admin-secret-change-before-prod
`);
