-- 009 — Schema for LangGraph checkpoints (paused AI menu imports, task T33).
--
-- The checkpointer (src/lib/ai/menu-import-checkpointer.ts) creates its own
-- tables inside this schema on first use (PostgresSaver.setup()), but it does
-- not create the schema itself.
--
-- Kept out of `public` on purpose: Supabase serves `public` through its REST
-- API to anyone holding the anon key, and checkpoints contain restaurants'
-- draft menus. Do NOT add `langgraph` to the API's exposed schemas.
-- Only the server reaches it, over DATABASE_URL.

create schema if not exists langgraph;

-- Belt and braces: nothing reachable with the anon or authenticated roles.
revoke all on schema langgraph from anon, authenticated;
