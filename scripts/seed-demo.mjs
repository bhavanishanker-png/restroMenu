/**
 * Fills out the `test-kitchen` demo restaurant so every screen in the app has
 * something real to show: a full menu with variants and add-ons, staff for all
 * four roles, and a few live orders on the kitchen display.
 *
 * Idempotent — re-running skips anything that already exists.
 *
 * Usage:
 *   set -a; . ./.env.local; set +a; node scripts/seed-demo.mjs
 */

import bcrypt from "bcryptjs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const SLUG = "test-kitchen";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌  Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  console.error("   Run:  set -a; . ./.env.local; set +a; node scripts/seed-demo.mjs");
  process.exit(1);
}

// The anon key is a valid JWT for the same project but silently fails under
// RLS, so check the claim rather than trusting the variable name.
try {
  const claims = JSON.parse(Buffer.from(SERVICE_ROLE_KEY.split(".")[1], "base64url").toString());
  if (claims.role !== "service_role") {
    console.error(`❌  SUPABASE_SERVICE_ROLE_KEY has role "${claims.role}", expected "service_role".`);
    process.exit(1);
  }
} catch {
  /* opaque sb_secret_* keys are not JWTs — nothing to check */
}

const H = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

// ── PostgREST helpers ────────────────────────────────────────────────────────

async function rest(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...H, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    console.error(`\n❌  ${init.method ?? "GET"} ${path} → ${res.status}`);
    console.error(JSON.stringify(body).slice(0, 400));
    process.exit(1);
  }
  return body;
}

const select = (path) => rest(path);

const insert = (table, rows) =>
  rest(table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(rows),
  });

// ── main ─────────────────────────────────────────────────────────────────────

console.log(`\n🌱  Seeding demo data for "${SLUG}"\n`);

const [restaurant] = await select(`restaurants?select=id&slug=eq.${SLUG}`);
if (!restaurant) {
  console.error(`❌  Restaurant "${SLUG}" not found. Run scripts/setup-db.mjs first.`);
  process.exit(1);
}
const R = restaurant.id;

// ---------------------------------------------------------------- staff

console.log("👤  Staff");

const existingStaff = await select(`staff?select=id,name,role&restaurant_id=eq.${R}`);
const staffByName = new Map(existingStaff.map((s) => [s.name, s]));

// PINs are bcrypt-hashed exactly as the login route expects. These are demo
// credentials on a demo tenant — documented, not secret.
const STAFF = [
  { name: "Priya Nair",     role: "manager", pin: null,   phone: "9810012001" },
  { name: "Ravi Kumar",     role: "kitchen", pin: "1111", phone: "9810012002" },
  { name: "Meena Iyer",     role: "kitchen", pin: "2222", phone: "9810012003" },
  { name: "Anjali Sharma",  role: "waiter",  pin: "3333", phone: "9810012004" },
  { name: "Imran Shaikh",   role: "waiter",  pin: "4444", phone: "9810012005" },
];

for (const s of STAFF) {
  if (staffByName.has(s.name)) {
    console.log(`   ${s.name} (${s.role}) — exists, skipping`);
    continue;
  }
  await insert("staff", {
    restaurant_id: R,
    name: s.name,
    role: s.role,
    phone: s.phone,
    pin_hash: s.pin ? await bcrypt.hash(s.pin, 10) : null,
    is_active: true,
  });
  console.log(`   ${s.name} (${s.role})${s.pin ? ` — PIN ${s.pin}` : ""} ✅`);
}

// ---------------------------------------------------------------- categories

console.log("\n📂  Categories");

const existingCats = await select(`menu_categories?select=id,name&restaurant_id=eq.${R}`);
const catByName = new Map(existingCats.map((c) => [c.name, c.id]));

const CATEGORIES = [
  { name: "Starters", sort_order: 1 },
  { name: "Main Course", sort_order: 2 },
  { name: "Breads", sort_order: 3 },
  { name: "Rice & Biryani", sort_order: 4 },
  { name: "Desserts", sort_order: 5 },
  { name: "Beverages", sort_order: 6 },
];

for (const c of CATEGORIES) {
  if (catByName.has(c.name)) {
    // Keep sort_order aligned with the list above so the tab bar reads sensibly.
    await rest(`menu_categories?id=eq.${catByName.get(c.name)}`, {
      method: "PATCH",
      body: JSON.stringify({ sort_order: c.sort_order }),
    });
    console.log(`   ${c.name} — exists`);
    continue;
  }
  const [row] = await insert("menu_categories", {
    restaurant_id: R,
    name: c.name,
    sort_order: c.sort_order,
    is_active: true,
  });
  catByName.set(c.name, row.id);
  console.log(`   ${c.name} ✅`);
}

// ---------------------------------------------------------------- add-on groups

console.log("\n🧩  Add-on groups");

const existingGroups = await select(`addon_groups?select=id,name&restaurant_id=eq.${R}`);
const groupByName = new Map(existingGroups.map((g) => [g.name, g.id]));

const ADDON_GROUPS = [
  {
    name: "Extras",
    min_select: 0,
    max_select: 4,
    addons: [
      { name: "Extra Butter", price: 30 },
      { name: "Extra Cheese", price: 50 },
      { name: "Extra Gravy", price: 60 },
      { name: "Green Salad", price: 40 },
    ],
  },
  {
    name: "Make it a meal",
    min_select: 0,
    max_select: 2,
    addons: [
      { name: "Butter Naan (2)", price: 90 },
      { name: "Jeera Rice", price: 120 },
    ],
  },
];

for (const g of ADDON_GROUPS) {
  if (groupByName.has(g.name)) {
    console.log(`   ${g.name} — exists`);
    continue;
  }
  const [row] = await insert("addon_groups", {
    restaurant_id: R,
    name: g.name,
    min_select: g.min_select,
    max_select: g.max_select,
  });
  await insert("addons", g.addons.map((a) => ({ group_id: row.id, ...a })));
  groupByName.set(g.name, row.id);
  console.log(`   ${g.name} (${g.addons.length} add-ons) ✅`);
}

// ---------------------------------------------------------------- menu items

console.log("\n🍽️   Menu items");

// tax_rate: 5% on food, 12% on beverages — deliberately different so the
// per-item tax path in lib/pricing.ts is actually exercised by demo data.
const ITEMS = [
  // ── Starters ──
  { cat: "Starters", name: "Paneer Tikka", price: 240, type: "veg", spice: 2, prep: 15, desc: "Char-grilled cottage cheese in a smoked yoghurt marinade.", tags: ["bestseller"], variants: [["Half", 0, true], ["Full", 120, false]] },
  { cat: "Starters", name: "Chicken Tikka", price: 280, type: "non_veg", spice: 2, prep: 18, desc: "Boneless thigh, overnight marinade, finished in the tandoor.", tags: ["bestseller"], variants: [["Half", 0, true], ["Full", 140, false]] },
  { cat: "Starters", name: "Veg Spring Roll", price: 160, type: "veg", spice: 1, prep: 12, desc: "Crisp rolls stuffed with shredded vegetables and glass noodles." },
  { cat: "Starters", name: "Tandoori Chicken", price: 340, type: "non_veg", spice: 3, prep: 25, desc: "The classic, on the bone, with mint chutney and onion.", tags: ["chef_special"], variants: [["Half", 0, true], ["Full", 300, false]] },
  { cat: "Starters", name: "Chilli Paneer Dry", price: 250, type: "veg", spice: 3, prep: 14, desc: "Indo-Chinese, tossed with peppers and spring onion." },
  { cat: "Starters", name: "Mushroom 65", price: 220, type: "veg", spice: 2, prep: 14, desc: "Curry-leaf tempered, deep fried, dangerously moreish." },
  { cat: "Starters", name: "Egg Devilled", price: 140, type: "egg", spice: 1, prep: 10, desc: "Halved boiled eggs with a spiced mayonnaise crown." },

  // ── Main Course ──
  { cat: "Main Course", name: "Butter Chicken", price: 380, type: "non_veg", spice: 1, prep: 20, desc: "Tomato and cashew gravy, finished with cream and kasuri methi.", tags: ["bestseller"], addons: ["Extras", "Make it a meal"] },
  { cat: "Main Course", name: "Dal Makhani", price: 260, type: "veg", spice: 1, prep: 20, desc: "Black lentils simmered overnight. Slow food, properly done.", tags: ["bestseller"], addons: ["Extras", "Make it a meal"] },
  { cat: "Main Course", name: "Shahi Paneer", price: 290, type: "veg", spice: 1, prep: 18, desc: "Rich, mildly sweet gravy with almond and saffron.", addons: ["Extras", "Make it a meal"] },
  { cat: "Main Course", name: "Kadai Mutton", price: 460, type: "non_veg", spice: 3, prep: 35, desc: "Slow-cooked goat in a freshly pounded kadai masala.", available: false, addons: ["Extras"] },
  { cat: "Main Course", name: "Kadai Paneer", price: 300, type: "veg", spice: 2, prep: 18, desc: "Cottage cheese and peppers in a coarse, aromatic masala.", addons: ["Extras", "Make it a meal"] },
  { cat: "Main Course", name: "Malai Kofta", price: 310, type: "veg", spice: 0, prep: 22, desc: "Potato-paneer dumplings in a delicate white gravy.", addons: ["Extras"] },
  { cat: "Main Course", name: "Chicken Chettinad", price: 400, type: "non_veg", spice: 3, prep: 25, desc: "Peppery Tamil classic with roasted coconut and star anise.", tags: ["chef_special"], addons: ["Extras"] },

  // ── Breads ──
  { cat: "Breads", name: "Butter Naan", price: 70, type: "veg", spice: 0, prep: 8, desc: "Leavened flatbread, brushed with white butter.", addons: ["Extras"] },
  { cat: "Breads", name: "Garlic Naan", price: 90, type: "veg", spice: 0, prep: 8, desc: "Loaded with garlic and coriander.", tags: ["bestseller"], addons: ["Extras"] },
  { cat: "Breads", name: "Tandoori Roti", price: 45, type: "veg", spice: 0, prep: 6, desc: "Wholewheat, straight off the tandoor wall.", tags: ["jain"] },
  { cat: "Breads", name: "Laccha Paratha", price: 80, type: "veg", spice: 0, prep: 10, desc: "Layered, flaky, worth the extra minute." },

  // ── Rice & Biryani ──
  { cat: "Rice & Biryani", name: "Hyderabadi Chicken Dum Biryani", price: 420, type: "non_veg", spice: 3, prep: 30, desc: "Sealed and cooked on dum. Served with mirchi ka salan and raita.", tags: ["bestseller", "chef_special"], variants: [["Half", 0, true], ["Full", 200, false]] },
  { cat: "Rice & Biryani", name: "Veg Dum Biryani", price: 320, type: "veg", spice: 2, prep: 28, desc: "Seasonal vegetables layered with saffron rice.", variants: [["Half", 0, true], ["Full", 150, false]] },
  { cat: "Rice & Biryani", name: "Jeera Rice", price: 160, type: "veg", spice: 0, prep: 12, desc: "Basmati tempered with cumin and ghee." },
  { cat: "Rice & Biryani", name: "Curd Rice", price: 140, type: "veg", spice: 1, prep: 10, desc: "Cooling, tempered with curry leaf and mustard seed." },

  // ── Desserts ──
  { cat: "Desserts", name: "Gulab Jamun (2 pc)", price: 120, type: "veg", spice: 0, prep: 5, desc: "Warm, soaked in cardamom syrup.", tags: ["bestseller"] },
  { cat: "Desserts", name: "Gajar Ka Halwa", price: 150, type: "veg", spice: 0, prep: 8, desc: "Slow-cooked carrot halwa with khoya and pistachio." },
  { cat: "Desserts", name: "Rasmalai (2 pc)", price: 160, type: "veg", spice: 0, prep: 5, desc: "Soft paneer discs in saffron-infused reduced milk." },

  // ── Beverages (12% GST) ──
  { cat: "Beverages", name: "Sweet Lassi", price: 90, type: "veg", spice: 0, prep: 5, tax: 12, desc: "Thick, chilled, lightly sweetened." },
  { cat: "Beverages", name: "Masala Chai", price: 40, type: "veg", spice: 0, prep: 5, tax: 12, desc: "Brewed with ginger and cardamom." },
  { cat: "Beverages", name: "Fresh Lime Soda", price: 80, type: "veg", spice: 0, prep: 4, tax: 12, desc: "Sweet, salted, or mixed — tell us in the notes." },
  { cat: "Beverages", name: "Cold Coffee", price: 140, type: "veg", spice: 0, prep: 6, tax: 12, desc: "Blended with ice cream." },
  { cat: "Beverages", name: "Mineral Water (1L)", price: 40, type: "veg", spice: 0, prep: 1, tax: 12, desc: "Sealed bottle." },
];

const existingItems = await select(`menu_items?select=id,name&restaurant_id=eq.${R}`);
const itemByName = new Map(existingItems.map((i) => [i.name, i.id]));

let created = 0;
for (const [idx, it] of ITEMS.entries()) {
  if (itemByName.has(it.name)) continue;

  const [row] = await insert("menu_items", {
    restaurant_id: R,
    category_id: catByName.get(it.cat),
    name: it.name,
    description: it.desc ?? null,
    base_price: it.price,
    cost_price: Math.round(it.price * 0.38),
    food_type: it.type,
    spice_level: it.spice,
    prep_minutes: it.prep,
    tax_rate: it.tax ?? 5,
    kitchen_station: "main",
    tags: it.tags ?? [],
    is_available: it.available ?? true,
    sort_order: idx,
    is_active: true,
  });
  itemByName.set(it.name, row.id);
  created++;
}
console.log(`   ${created} new item(s), ${itemByName.size} total`);

// ---------------------------------------------------------------- variants & add-on links

console.log("\n🔀  Variants & add-on links");

const existingVariants = await select(`item_variants?select=item_id,name`);
const variantKeys = new Set(existingVariants.map((v) => `${v.item_id}:${v.name}`));

let variantCount = 0;
for (const it of ITEMS) {
  if (!it.variants) continue;
  const itemId = itemByName.get(it.name);
  const rows = it.variants
    .filter(([name]) => !variantKeys.has(`${itemId}:${name}`))
    .map(([name, delta, isDefault], i) => ({
      item_id: itemId,
      name,
      price_delta: delta,
      is_default: isDefault,
      sort_order: i,
    }));
  if (rows.length) {
    await insert("item_variants", rows);
    variantCount += rows.length;
  }
}
console.log(`   ${variantCount} new variant(s)`);

const links = [];
for (const it of ITEMS) {
  if (!it.addons) continue;
  for (const groupName of it.addons) {
    links.push({ item_id: itemByName.get(it.name), group_id: groupByName.get(groupName) });
  }
}
if (links.length) {
  // Composite PK makes this safe to re-run.
  await rest("item_addon_groups", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify(links),
  });
}
console.log(`   ${links.length} item→add-on-group link(s)`);

// ---------------------------------------------------------------- sample orders

console.log("\n🧾  Sample orders");

const tables = await select(`restaurant_tables?select=label,qr_token&restaurant_id=eq.${R}&order=label`);
const openOrders = await select(
  `orders?select=id&restaurant_id=eq.${R}&status=in.(placed,accepted,preparing,ready)`
);

if (openOrders.length >= 4) {
  console.log(`   ${openOrders.length} open order(s) already on the board — skipping`);
} else {
  // Placed through the real API so totals come from lib/pricing.ts. Seeding
  // them directly would mean duplicating pricing maths outside that module.
  const BASKETS = [
    { table: "T1", name: "Arjun Mehta",   phone: "9810055001", items: [["Butter Chicken", 1], ["Garlic Naan", 2]], notes: "Less spicy please" },
    { table: "T3", name: "Sneha Rao",     phone: "9810055002", items: [["Paneer Tikka", 1], ["Dal Makhani", 1], ["Butter Naan", 3]] },
    { table: "T4", name: "Vikram Singh",  phone: "9810055003", items: [["Hyderabadi Chicken Dum Biryani", 2], ["Sweet Lassi", 2]], notes: "One without raita" },
    { table: "T5", name: "Fatima Khan",   phone: "9810055004", items: [["Chilli Paneer Dry", 1], ["Veg Dum Biryani", 1], ["Gulab Jamun (2 pc)", 1], ["Masala Chai", 2]] },
  ];

  let placed = 0;
  for (const b of BASKETS) {
    const table = tables.find((t) => t.label === b.table);
    if (!table) continue;

    const payload = {
      restaurantSlug: SLUG,
      tableToken: table.qr_token,
      orderType: "dine_in",
      customerName: b.name,
      customerPhone: b.phone,
      notes: b.notes,
      idempotencyKey: crypto.randomUUID(),
      paymentMethod: "cash",
      items: b.items.map(([name, qty]) => ({
        itemId: itemByName.get(name),
        variantId: null,
        addonIds: [],
        quantity: qty,
      })),
    };

    const res = await fetch(`${APP_URL}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);

    if (!res) {
      console.log(`   ⚠️  ${APP_URL} unreachable — start \`npm run dev\`, then re-run for sample orders.`);
      break;
    }
    const body = await res.json();
    if (!res.ok) {
      console.log(`   ⚠️  ${b.table} failed (${res.status}): ${JSON.stringify(body).slice(0, 160)}`);
      continue;
    }
    placed++;
    console.log(`   ${b.table} · ${b.name} · ${body.order?.orderNumber ?? "?"} · ₹${body.order?.total ?? "?"} ✅`);
  }
  if (placed) console.log(`   ${placed} order(s) placed`);
}

// ---------------------------------------------------------------- summary

const t1 = tables.find((t) => t.label === "T1");

console.log(`
✅  Done.

Owner / Manager    ${APP_URL}/login
  testowner@qbite.dev / Test1234!

Kitchen & waiter   ${APP_URL}/login  → PIN tab → code "${SLUG}"
  Ravi Kumar     kitchen   1111
  Meena Iyer     kitchen   2222
  Anjali Sharma  waiter    3333
  Imran Shaikh   waiter    4444

Customer menu      ${APP_URL}/r/${SLUG}/t/${t1?.qr_token ?? "<token>"}
Kitchen display    ${APP_URL}/dashboard/kitchen
`);
