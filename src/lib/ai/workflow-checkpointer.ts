/**
 * Where paused AI workflows (LangGraph checkpoints) are stored: menu import
 * (T33) and dish writing (T34). SERVER-ONLY.
 *
 *  - DATABASE_URL set → Postgres (the Supabase database), in the `langgraph`
 *    schema. Not `public`: Supabase exposes `public` through its REST API to
 *    anyone with the anon key, and these rows hold restaurants' draft menus and dish text.
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
  __qbiteWorkflowCheckpointer?: Holder;
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
    "[workflow] DATABASE_URL is not set: paused AI workflows are kept in memory and " +
      "may expire between serverless instances."
  );
  return { saver: new MemorySaver(), ready: Promise.resolve() };
}

export async function getWorkflowCheckpointer(): Promise<BaseCheckpointSaver> {
  let holder = globalForCheckpointer.__qbiteWorkflowCheckpointer;
  if (!holder) {
    holder = create();
    globalForCheckpointer.__qbiteWorkflowCheckpointer = holder;
  }
  try {
    await holder.ready;
  } catch (err) {
    // Don't cache a failed setup: the next request retries it.
    globalForCheckpointer.__qbiteWorkflowCheckpointer = undefined;
    throw err;
  }
  return holder.saver;
}
