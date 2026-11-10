/**
 * Menu-import eval runner.
 *
 *   npm run eval:menu                 extract uncached cases, score everything
 *   npm run eval:menu -- --fresh      re-extract every case (costs API calls)
 *   npm run eval:menu -- --case x     only case "x"
 *   npm run eval:menu -- --bootstrap  write <id>.draft.json label drafts for unlabelled photos
 *
 * Extraction goes through src/lib/ai/menu-extract.ts, the same function the
 * production route calls. Model outputs are cached in results/ under a
 * fingerprint of (file, prompt, schema, model): rescoring is free, and a
 * prompt or model change re-extracts automatically.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as z from "zod/v4";
import { AI_MODELS, getAnthropicClient } from "@/lib/ai/client";
import { extractMenu, type ExtractResult, type MenuMediaType } from "@/lib/ai/menu-extract";
import {
  EXTRACTION_SYSTEM_PROMPT,
  ExtractionSchema,
  reconcileDraft,
  type Extraction,
} from "@/lib/ai/menu-onboarding";
import {
  LabelSchema,
  MATCH_THRESHOLD,
  addCounts,
  emptyCounts,
  metrics,
  scoreCase,
  type CaseLabel,
  type Counts,
  type Metrics,
  type PredictedDish,
  type VegFalsePositive,
} from "./score";

const ROOT = path.resolve(process.cwd(), "evals/menu-extract");
const CASES_DIR = path.join(ROOT, "cases");
const RESULTS_DIR = path.join(ROOT, "results");
const CONCURRENCY = 3;

const MEDIA_TYPES: Record<string, MenuMediaType> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
};

// ---------------------------------------------------------------- args & env

const args = process.argv.slice(2);
const FRESH = args.includes("--fresh");
const BOOTSTRAP = args.includes("--bootstrap");
const ONLY = args.includes("--case") ? args[args.indexOf("--case") + 1] : null;

try {
  process.loadEnvFile(path.resolve(process.cwd(), ".env.local"));
} catch {
  // No .env.local: rely on the shell environment.
}

// ---------------------------------------------------------------- cases

type Case = { id: string; file: string; mediaType: MenuMediaType; labelPath: string };

function listCases(): Case[] {
  if (!existsSync(CASES_DIR)) return [];
  return readdirSync(CASES_DIR)
    .filter((f) => MEDIA_TYPES[path.extname(f).toLowerCase()])
    .map((f) => {
      const id = path.basename(f, path.extname(f));
      return {
        id,
        file: path.join(CASES_DIR, f),
        mediaType: MEDIA_TYPES[path.extname(f).toLowerCase()],
        labelPath: path.join(CASES_DIR, `${id}.json`),
      };
    })
    .filter((c) => ONLY === null || c.id === ONLY)
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------- extraction cache

type CachedRun = {
  fingerprint: string;
  model: string;
  extractedAt: string;
  durationMs: number;
  result: ExtractResult;
};

const PIPELINE_FINGERPRINT = createHash("sha256")
  .update(AI_MODELS.menuOnboarding)
  .update(EXTRACTION_SYSTEM_PROMPT)
  .update(JSON.stringify(z.toJSONSchema(ExtractionSchema)))
  .digest("hex");

function fingerprint(bytes: Uint8Array): string {
  return createHash("sha256").update(PIPELINE_FINGERPRINT).update(bytes).digest("hex").slice(0, 16);
}

async function getRun(c: Case): Promise<CachedRun> {
  const bytes = new Uint8Array(readFileSync(c.file));
  const fp = fingerprint(bytes);
  const cachePath = path.join(RESULTS_DIR, `${c.id}.json`);

  if (!FRESH && existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, "utf8")) as CachedRun;
    if (cached.fingerprint === fp) return cached;
    console.log(`  ${c.id}: prompt, schema, model or photo changed — re-extracting`);
  }

  const client = getAnthropicClient();
  if (!client) throw new Error("ANTHROPIC_API_KEY is not set (looked in .env.local and the shell).");

  console.log(`  ${c.id}: extracting…`);
  const started = Date.now();
  const result = await extractMenu(client, bytes, c.mediaType);
  const run: CachedRun = {
    fingerprint: fp,
    model: AI_MODELS.menuOnboarding,
    extractedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    result,
  };
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(cachePath, JSON.stringify(run, null, 2));
  return run;
}

async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ---------------------------------------------------------------- predictions

/** The model's answer, before any code checks. */
function rawPredictions(x: Extraction): PredictedDish[] {
  return x.categories.flatMap((cat) =>
    cat.items.map((i) => ({ name: i.name.trim(), price: i.price, foodType: i.foodType }))
  );
}

/** What the owner sees: after reconcileDraft (price cleaning, food-type gate, limits). */
function gatedPredictions(x: Extraction): PredictedDish[] {
  // Empty catalog: duplicate detection against the live menu isn't what we measure here.
  const draft = reconcileDraft(x, { categories: [], items: [] });
  return draft.categories.flatMap((cat) =>
    cat.items.map((i) => ({ name: i.name, price: i.basePrice, foodType: i.foodType }))
  );
}

// ---------------------------------------------------------------- bootstrap

/**
 * Pre-fills names and prices from the model so you only correct them.
 * Food type is deliberately left as "TODO": it is the field the eval cares
 * most about, and pre-filling it would anchor you on the model's answer.
 */
async function bootstrap(cases: Case[]) {
  const todo = cases.filter((c) => !existsSync(c.labelPath));
  if (todo.length === 0) {
    console.log("Every photo already has a label file.");
    return;
  }
  for (const c of todo) {
    const run = await getRun(c);
    if (!run.result.ok) {
      console.log(`  ${c.id}: extraction failed (${run.result.code}) — label it by hand`);
      continue;
    }
    const draft = {
      source: "TODO: where this photo came from",
      hasVegMarkers: "TODO: true or false",
      dishes: rawPredictions(run.result.extraction).map((d) => ({
        name: d.name,
        price: d.price,
        foodType: "TODO",
      })),
    };
    const out = path.join(CASES_DIR, `${c.id}.draft.json`);
    writeFileSync(out, JSON.stringify(draft, null, 2) + "\n");
    console.log(`  wrote ${path.relative(process.cwd(), out)} (${draft.dishes.length} dishes)`);
  }
  console.log(
    "\nCheck every name and price against the photo, add dishes the model missed, delete ones it invented,\n" +
      "fill in each foodType yourself, then rename <id>.draft.json to <id>.json."
  );
}

// ---------------------------------------------------------------- report

type CaseReport = {
  id: string;
  hasVegMarkers: boolean;
  status: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  raw: Counts;
  gated: Counts;
  rawVegFalsePositives: VegFalsePositive[];
  gatedVegFalsePositives: VegFalsePositive[];
  missed: string[];
  extra: string[];
};

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

function metricRows(raw: Metrics, gated: Metrics): string[] {
  const row = (name: string, a: string, b: string) => `| ${name} | ${a} | ${b} |`;
  return [
    "| Metric | Raw model | After code gate (shipped) |",
    "|---|---|---|",
    row("Dish precision", pct(raw.dishPrecision), pct(gated.dishPrecision)),
    row("Dish recall", pct(raw.dishRecall), pct(gated.dishRecall)),
    row("Dish F1", pct(raw.dishF1), pct(gated.dishF1)),
    row("Price accuracy (correct ÷ printed)", pct(raw.priceAccuracy), pct(gated.priceAccuracy)),
    row("Price precision (correct ÷ given)", pct(raw.pricePrecision), pct(gated.pricePrecision)),
    row("Invented prices (none printed)", String(raw.priceInvented), String(gated.priceInvented)),
    row("Food-type coverage", pct(raw.foodCoverage), pct(gated.foodCoverage)),
    row("Food-type accuracy when set", pct(raw.foodAccuracyWhenSet), pct(gated.foodAccuracyWhenSet)),
    row("Veg precision", pct(raw.vegPrecision), pct(gated.vegPrecision)),
    row("Veg recall", pct(raw.vegRecall), pct(gated.vegRecall)),
    row("**Veg false-positive rate**", pct(raw.vegFalsePositiveRate), pct(gated.vegFalsePositiveRate)),
    row("**Veg false positives (count)**", String(raw.vegFalsePositives), String(gated.vegFalsePositives)),
  ];
}

function writeReport(reports: CaseReport[], skipped: string[]) {
  const rawTotal = reports.reduce((acc, r) => addCounts(acc, r.raw), emptyCounts());
  const gatedTotal = reports.reduce((acc, r) => addCounts(acc, r.gated), emptyCounts());
  const raw = metrics(rawTotal);
  const gated = metrics(gatedTotal);
  const ms = reports.map((r) => r.durationMs).sort((a, b) => a - b);
  const median = ms.length ? ms[Math.floor(ms.length / 2)] : 0;
  const tokensIn = reports.reduce((s, r) => s + r.inputTokens, 0);
  const tokensOut = reports.reduce((s, r) => s + r.outputTokens, 0);

  const lines: string[] = [
    "# Menu import eval",
    "",
    `Generated ${new Date().toISOString()} · model \`${AI_MODELS.menuOnboarding}\` · ` +
      `${reports.length} menus · ${gatedTotal.labelled} labelled dishes · ` +
      `name-match threshold ${MATCH_THRESHOLD}`,
    "",
    "Micro-averaged over all dishes. *Raw model* is the structured output before code checks; " +
      "*after code gate* is the draft the owner sees (reconcileDraft).",
    "",
    ...metricRows(raw, gated),
    "",
    `Median extraction time ${(median / 1000).toFixed(1)}s · ${tokensIn} input / ${tokensOut} output tokens in total.`,
    "",
    "## Per menu (after code gate)",
    "",
    "| Menu | Veg markers | Status | Dishes P / R | Price acc. | Food coverage | Veg FP (raw → gated) |",
    "|---|---|---|---|---|---|---|",
    ...reports.map((r) => {
      const m = metrics(r.gated);
      return `| ${r.id} | ${r.hasVegMarkers ? "yes" : "no"} | ${r.status} | ${pct(m.dishPrecision)} / ${pct(m.dishRecall)} | ${pct(m.priceAccuracy)} | ${pct(m.foodCoverage)} | ${r.raw.vegFalsePos} → ${r.gated.vegFalsePos} |`;
    }),
    "",
    "## Veg false positives",
    "",
    "Non-veg or egg dishes labelled veg. These are the errors the printed-marker rule exists to stop.",
    "",
  ];

  const fpRows = reports.flatMap((r) => [
    ...r.rawVegFalsePositives.map((f) => `| ${r.id} | ${f.name} | ${f.truth} | raw model | ${r.gatedVegFalsePositives.some((g) => g.name === f.name) ? "**no**" : "yes"} |`),
  ]);
  const gatedOnly = reports.flatMap((r) =>
    r.gatedVegFalsePositives
      .filter((g) => !r.rawVegFalsePositives.some((f) => f.name === g.name))
      .map((g) => `| ${r.id} | ${g.name} | ${g.truth} | gate only | **no** |`)
  );
  if (fpRows.length + gatedOnly.length === 0) {
    lines.push("None, raw or gated.");
  } else {
    lines.push("| Menu | Dish | Truth | Seen in | Caught by gate |", "|---|---|---|---|---|", ...fpRows, ...gatedOnly);
  }

  lines.push("", "## Dish-level misses", "");
  for (const r of reports) {
    if (r.missed.length === 0 && r.extra.length === 0) continue;
    lines.push(`**${r.id}**`);
    if (r.missed.length) lines.push(`- Missed (in label, not extracted): ${r.missed.join(", ")}`);
    if (r.extra.length) lines.push(`- Extra (extracted, not in label): ${r.extra.join(", ")}`);
    lines.push("");
  }
  if (skipped.length) lines.push("## Skipped (no valid label)", "", ...skipped.map((s) => `- ${s}`), "");

  const md = lines.join("\n") + "\n";
  writeFileSync(path.join(ROOT, "report.md"), md);
  writeFileSync(
    path.join(ROOT, "report.json"),
    JSON.stringify({ model: AI_MODELS.menuOnboarding, raw, gated, rawTotal, gatedTotal, cases: reports }, null, 2)
  );

  console.log("\n" + metricRows(raw, gated).join("\n"));
  console.log(`\nFull report: ${path.relative(process.cwd(), path.join(ROOT, "report.md"))}`);
}

// ---------------------------------------------------------------- main

async function main() {
  const cases = listCases();
  if (cases.length === 0) {
    console.log(`No menu photos in ${path.relative(process.cwd(), CASES_DIR)}/. See evals/menu-extract/README.md.`);
    return;
  }

  if (BOOTSTRAP) {
    await bootstrap(cases);
    return;
  }

  const skipped: string[] = [];
  const labelled: { c: Case; label: CaseLabel }[] = [];
  for (const c of cases) {
    if (!existsSync(c.labelPath)) {
      skipped.push(`${c.id}: no ${c.id}.json (run with --bootstrap to draft one)`);
      continue;
    }
    const parsed = LabelSchema.safeParse(JSON.parse(readFileSync(c.labelPath, "utf8")));
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      skipped.push(`${c.id}: invalid label at ${first?.path.join(".") || "root"} — ${first?.message}`);
      continue;
    }
    labelled.push({ c, label: parsed.data });
  }

  console.log(`Scoring ${labelled.length} menu(s)${skipped.length ? `, skipping ${skipped.length}` : ""}:`);
  const reports = await pool(labelled, CONCURRENCY, async ({ c, label }): Promise<CaseReport> => {
    const run = await getRun(c);
    const extraction = run.result.ok ? run.result.extraction : null;
    const rawScore = scoreCase(label, extraction ? rawPredictions(extraction) : []);
    const gatedScore = scoreCase(label, extraction ? gatedPredictions(extraction) : []);
    return {
      id: c.id,
      hasVegMarkers: label.hasVegMarkers,
      status: run.result.ok ? "ok" : run.result.code,
      durationMs: run.durationMs,
      inputTokens: run.result.usage.inputTokens,
      outputTokens: run.result.usage.outputTokens,
      raw: rawScore.counts,
      gated: gatedScore.counts,
      rawVegFalsePositives: rawScore.vegFalsePositives,
      gatedVegFalsePositives: gatedScore.vegFalsePositives,
      missed: gatedScore.missed,
      extra: gatedScore.extra,
    };
  });

  writeReport(reports, skipped);
  for (const s of skipped) console.log(`  skipped ${s}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
