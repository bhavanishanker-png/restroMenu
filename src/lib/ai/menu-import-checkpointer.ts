/**
 * Where paused menu imports (LangGraph checkpoints) are stored. SERVER-ONLY.
 *
 *  - DATABASE_URL set → Postgres (the Supabase database), in the `langgraph`
 *    schema. Not `public`: Supabase exposes `public` through its REST API to
 *    anyone with the anon key, and these rows hold restaurants' draft menus.
 *    Create the schema once with docs/migrations/009_langgraph_schema.sql.
 *  - DATABASE_URL unset → in-memory. Fine for local dev and tests. On
 *    serverless, a paused import then lives only in the instance that started
 *    it, so "continue later" can come back as "expired" and the owner
 *    re-uploads. Logged once so it is never silent.
 *
 * Use Supabase's pooled connection string (Supavisor, port 6543) on Vercel,
 * so many short-lived functions don't exhaust Postgres connections.
 */
import { MemorySaver, type BaseCheckpointSaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const SCHEMA = "langgraph";

type Holder = { saver: BaseCheckpointSaver; ready: Promise<void> };

// On globalThis so Next's dev hot reload doesn't drop paused imports.
const globalForCheckpointer = globalThis as typeof globalThis & {
  __qbiteMenuImportCheckpointer?: Holder;
};

function create(): Holder {
  const url = process.env.DATABASE_URL;
  if (url) {
    const saver = PostgresSaver.fromConnString(url, { schema: SCHEMA });
    // setup() creates the checkpoint tables (idempotent). Run once per instance.
    const ready = saver.setup();
    return { saver, ready };
  }
  console.warn(
    "[menu-import] DATABASE_URL is not set: paused imports are kept in memory and " +
      "may expire between serverless instances."
  );
  return { saver: new MemorySaver(), ready: Promise.resolve() };
}

export async function getMenuImportCheckpointer(): Promise<BaseCheckpointSaver> {
  let holder = globalForCheckpointer.__qbiteMenuImportCheckpointer;
  if (!holder) {
    holder = create();
    globalForCheckpointer.__qbiteMenuImportCheckpointer = holder;
  }
  try {
    await holder.ready;
  } catch (err) {
    // Don't cache a failed setup: the next request retries it.
    globalForCheckpointer.__qbiteMenuImportCheckpointer = undefined;
    throw err;
  }
  return holder.saver;
}
