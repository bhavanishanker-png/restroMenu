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

// Never hardcode credentials here — this file is committed.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PAT = process.env.SUPABASE_ACCESS_TOKEN;

const missing = [
  !SUPABASE_URL && "NEXT_PUBLIC_SUPABASE_URL",
  !SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
  !PAT && "SUPABASE_ACCESS_TOKEN",
].filter(Boolean);

if (missing.length) {
  console.error(`❌  Missing env var(s): ${missing.join(", ")}`);
  console.error("   The first two live in .env.local; the PAT comes from");
  console.error("   https://supabase.com/dashboard/account/tokens");
  console.error("   Run:  set -a; . ./.env.local; set +a; SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/setup-db.mjs");
  process.exit(1);
}

const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];

// The service role key must actually carry the service_role claim — the anon
// key is a valid JWT for the same project and fails silently under RLS.
try {
  const claims = JSON.parse(Buffer.from(SERVICE_ROLE_KEY.split(".")[1], "base64url").toString());
  if (claims.role !== "service_role") {
    console.error(`❌  SUPABASE_SERVICE_ROLE_KEY has role "${claims.role}", expected "service_role".`);
    console.error("   Copy the service_role key from Supabase → Settings → API.");
    process.exit(1);
  }
} catch {
  // Newer sb_secret_* keys are opaque, not JWTs. Nothing to check.
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

// 5. is_staff_of recursion fix (idempotent — create or replace)
await runSQL(
  "006_fix_is_staff_of_recursion.sql",
  readFileSync(join(docs, "migrations/006_fix_is_staff_of_recursion.sql"), "utf8")
);

// 6. Demo restaurant — the slug the login screen and README advertise.
const DEMO_SLUG = "test-kitchen";
const DEMO_EMAIL = "testowner@qbite.dev";
const DEMO_PASSWORD = "Test1234!";

await runSQL(
  `Ensure ${DEMO_SLUG} restaurant`,
  `INSERT INTO restaurants (slug, name, is_active)
   VALUES ('${DEMO_SLUG}', 'Test Kitchen', true)
   ON CONFLICT (slug) DO NOTHING;`
);

// 7. Owner auth user
await createAuthUser(DEMO_EMAIL, DEMO_PASSWORD);

// 8. Staff row — without this, login fails with "No active owner or
//    manager account found." even though the password is correct.
await runSQL(
  "Link owner → staff",
  `INSERT INTO staff (restaurant_id, auth_user_id, name, role, is_active)
   SELECT r.id, u.id, 'Demo Owner', 'owner', true
   FROM restaurants r, auth.users u
   WHERE r.slug = '${DEMO_SLUG}'
     AND u.email = '${DEMO_EMAIL}'
     AND NOT EXISTS (
       SELECT 1 FROM staff s
        WHERE s.restaurant_id = r.id AND s.auth_user_id = u.id
     );`
);

const linked = await queryOne(
  `SELECT s.role, s.is_active FROM staff s
     JOIN restaurants r ON r.id = s.restaurant_id
     JOIN auth.users u  ON u.id = s.auth_user_id
    WHERE r.slug = '${DEMO_SLUG}' AND u.email = '${DEMO_EMAIL}';`
);

if (!linked) {
  console.error(`\n❌  Owner staff row still missing for ${DEMO_EMAIL} @ ${DEMO_SLUG}.`);
  process.exit(1);
}

console.log(`
✅  All done!  Verified owner staff row: role=${linked.role} active=${linked.is_active}

Login:   http://localhost:3000/login
  Email:    ${DEMO_EMAIL}
  Password: ${DEMO_PASSWORD}

Admin:   http://localhost:3000/admin/login
  Secret:   value of SUPER_ADMIN_SECRET in .env.local
`);
