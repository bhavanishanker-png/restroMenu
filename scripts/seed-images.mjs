/**
 * Gives every demo menu item a real photo of the actual dish.
 *
 * Sources images from Wikipedia (freely licensed, and an actual picture of the
 * named dish rather than generic stock), then re-hosts them in Supabase
 * Storage. Re-hosting matters: next.config.mjs only whitelists **.supabase.co
 * and res.cloudinary.com for next/image, and hotlinking upload.wikimedia.org
 * would both break <Image> and lean on someone else's CDN.
 *
 * Idempotent — skips items that already have an image.
 *
 * Usage:
 *   set -a; . ./.env.local; set +a; node scripts/seed-images.mjs
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "menu-images";
const SLUG = "test-kitchen";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌  Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const AUTH = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
};

// Dish → Wikipedia article. Chosen per dish so the photo actually matches the
// item; a few map to the closest well-photographed relative.
const WIKI = {
  "Paneer Tikka": "Paneer_tikka",
  "Chicken Tikka": "Chicken_tikka",
  "Veg Spring Roll": "Spring_roll",
  "Tandoori Chicken": "Tandoori_chicken",
  "Chilli Paneer Dry": "Chilli_paneer",
  // Chicken_65 has no lead image; Pakora is the same fried-snack idea.
  "Mushroom 65": "Pakora",
  "Egg Devilled": "Deviled_egg",
  "Butter Chicken": "Butter_chicken",
  "Dal Makhani": "Dal_makhani",
  "Shahi Paneer": "Shahi_paneer",
  "Kadai Mutton": "Mutton_curry",
  "Kadai Paneer": "Kadai_paneer",
  "Malai Kofta": "Kofta",
  "Chicken Chettinad": "Chilli_chicken",
  "Butter Naan": "Naan",
  "Garlic Naan": "Naan",
  "Tandoori Roti": "Roti",
  "Laccha Paratha": "Paratha",
  "Hyderabadi Chicken Dum Biryani": "Hyderabadi_biryani",
  "Veg Dum Biryani": "Biryani",
  "Jeera Rice": "Cooked_rice",
  "Curd Rice": "Curd_rice",
  "Gulab Jamun (2 pc)": "Gulab_jamun",
  "Gajar Ka Halwa": "Gajar_ka_halwa",
  "Rasmalai (2 pc)": "Rasmalai",
  "Sweet Lassi": "Lassi",
  "Masala Chai": "Masala_chai",
  "Fresh Lime Soda": "Nimbu_pani",
  "Cold Coffee": "Iced_coffee",
  "Mineral Water (1L)": "Bottled_water",
};

// ── helpers ──────────────────────────────────────────────────────────────────

async function rest(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...AUTH, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`\n❌  ${init.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 300)}`);
    process.exit(1);
  }
  return text ? JSON.parse(text) : null;
}

/**
 * Resolve article titles to image URLs, in one batched request.
 *
 * Uses the Action API's pageimages rather than rewriting the width in a
 * summary-endpoint thumbnail URL: upload.wikimedia.org only serves widths it
 * has already rendered, so a hand-built .../800px-Foo.jpg 400s for most files.
 * pithumbsize asks Wikimedia to pick a real, servable size.
 */
async function wikiImages(titles) {
  const out = new Map();

  // The API caps a batch at 50 titles.
  for (let i = 0; i < titles.length; i += 40) {
    const batch = titles.slice(i, i + 40);
    const url =
      "https://en.wikipedia.org/w/api.php?action=query&format=json" +
      "&prop=pageimages&piprop=thumbnail&pithumbsize=800&redirects=1" +
      `&titles=${batch.join("|")}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "qbite-demo-seed/1.0 (https://github.com/qbite)" },
    }).catch(() => null);
    if (!res?.ok) continue;

    const data = await res.json();
    const pages = data?.query?.pages ?? {};

    // Titles may redirect (Malai kofta → Kofta), so map the resolved title
    // back to what we asked for.
    const resolved = new Map(
      (data?.query?.redirects ?? []).map((r) => [r.to, r.from.replace(/ /g, "_")])
    );

    for (const page of Object.values(pages)) {
      if (!page.thumbnail?.source) continue;
      const asked = resolved.get(page.title) ?? page.title.replace(/ /g, "_");
      out.set(asked, page.thumbnail.source);
    }
  }

  return out;
}

// ── main ─────────────────────────────────────────────────────────────────────

console.log("\n🖼️   Seeding menu images\n");

// 1. Public bucket for dish photos.
const buckets = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, { headers: AUTH }).then((r) => r.json());
if (!buckets.some((b) => b.name === BUCKET)) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: true,
      file_size_limit: 5_242_880,
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
    }),
  });
  if (!res.ok) {
    console.error(`❌  Could not create bucket: ${await res.text()}`);
    process.exit(1);
  }
  console.log(`   Created public bucket "${BUCKET}"`);
} else {
  console.log(`   Bucket "${BUCKET}" exists`);
}

// 2. Items still missing a picture.
const [restaurant] = await rest(`restaurants?select=id&slug=eq.${SLUG}`);
if (!restaurant) {
  console.error(`❌  Restaurant "${SLUG}" not found.`);
  process.exit(1);
}

const items = await rest(
  `menu_items?select=id,name,image_url&restaurant_id=eq.${restaurant.id}&order=name`
);

let done = 0;
let skipped = 0;
let failed = [];

// One batched lookup for every title we need, before touching storage.
const pending = items.filter((i) => !i.image_url);
const wanted = [...new Set(pending.map((i) => WIKI[i.name]).filter(Boolean))];
const imageByTitle = await wikiImages(wanted);
console.log(`   Resolved ${imageByTitle.size}/${wanted.length} article image(s)\n`);

for (const item of items) {
  if (item.image_url) {
    skipped++;
    continue;
  }

  const title = WIKI[item.name];
  if (!title) {
    failed.push(`${item.name} (no Wikipedia mapping)`);
    continue;
  }

  const src = imageByTitle.get(title);
  if (!src) {
    failed.push(`${item.name} (no image on ${title})`);
    continue;
  }

  const imgRes = await fetch(src, {
    headers: { "User-Agent": "qbite-demo-seed/1.0 (https://github.com/qbite)" },
  }).catch(() => null);
  if (!imgRes?.ok) {
    failed.push(`${item.name} (download failed)`);
    continue;
  }

  const bytes = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const path = `${restaurant.id}/${item.id}.${ext}`;

  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { ...AUTH, "Content-Type": contentType, "x-upsert": "true" },
    body: bytes,
  });
  if (!up.ok) {
    failed.push(`${item.name} (upload failed: ${(await up.text()).slice(0, 120)})`);
    continue;
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  await rest(`menu_items?id=eq.${item.id}`, {
    method: "PATCH",
    body: JSON.stringify({ image_url: publicUrl }),
  });

  console.log(`   ${item.name.padEnd(34)} ${(bytes.length / 1024).toFixed(0)}kb ✅`);
  done++;
}

console.log(`\n   ${done} image(s) uploaded, ${skipped} already had one`);
if (failed.length) {
  console.log(`\n   ⚠️  ${failed.length} without an image:`);
  for (const f of failed) console.log(`      ${f}`);
}
console.log("");
