# 0012 — Owner Q&A over MCP

**Status:** Accepted (task T35)

## Context

Owners aren't at the dashboard all day, but many have an AI assistant open. "How were sales today?", "Which dishes didn't sell this month?" and "What's waiting in the kitchen?" are questions the dashboard already answers, but only on its own screens. MCP (Model Context Protocol) is a standard way for AI apps such as Claude Desktop and Claude Code to call a server's tools. So one MCP server makes QBite's data available in any compatible AI app, without building a chat screen for each one.

## Decisions

### Auth: personal access tokens (owner's choice)

Options were full OAuth 2.1 (the MCP-spec login flow: an authorization server, PKCE, client registration and refresh) or personal access tokens. Tokens were chosen: they're small, secure, and can be upgraded to OAuth later.

- **Created by owners and managers only.** Kitchen and waiter roles get 403. The token is shown **once**.
- **Format:** `qbt_` plus 256 random bits. **Only a SHA-256 hash is stored.** A slow hash (bcrypt) protects low-entropy secrets like PINs, but a 256-bit random token can't be brute-forced, so a fast hash is enough and allows direct lookup by hash.
- **Verified on every request,** the same way staff sessions are (ADR 0006): the token must not be revoked, **and** the staff member must still be active and still an owner or manager. Removing or demoting someone disables their tokens immediately. Revoking works on the next call.
- The table is server-only: **RLS on, no policies**, so the anon key reads nothing, not even the hashes.

### Tools: read-only (owner's choice)

`get_today_sales` (any day up to 90 back, in the restaurant's timezone), `list_orders`, `get_top_items` and `get_dead_items`. All are marked `readOnlyHint`, and the data layer has no write methods at all. This follows ADR 0009: the worst a confused or manipulated AI app can do is read the owner's own numbers.

### Tenant scope comes from the token, by construction

`ownerServerFor(principal, dataFor)` builds the data source from `principal.restaurantId`. No tool's input schema has a restaurant field, and the SDK strips unknown arguments. A test smuggles `restaurantId` into a tool call and checks it's ignored. `order_items` has no `restaurant_id`, so sales queries scope through an inner join on `orders`.

### Privacy

Tool results leave QBite and go to a third-party AI app, so **customer names and phone numbers are never selected**. Logs record the tool name, success and duration, never the data. A failed query returns a generic tool error; internal error text never reaches the AI app.

### Transport: stateless Streamable HTTP

The SDK's web-standard transport (`Request` in, `Response` out) in stateless JSON mode: a fresh server per request, so nothing is held between serverless invocations. Rate limits: 60 calls a minute per token, and failed authentications per IP (only failures count).

## Consequences

- ✅ Owners can ask questions in plain language from any MCP client.
- ✅ Revoking or demoting takes effect on the next request.
- ⚠️ Pasting a token into a config file is less friendly than an OAuth "Connect" button, and claude.ai web connectors need OAuth. OAuth is the upgrade path.
- ⚠️ The dashboard's token card is on the owner-only Settings page. Managers can use the API but have no screen yet.
- ⚠️ Read-only for now. A write tool (for example "mark paneer sold out") would need a confirmation step and the existing API checks.
- ⚠️ The Claude Desktop config shown in the dashboard uses the `mcp-remote` bridge with an `Authorization` header. If a client changes how headers are passed, check the `mcp-remote` README.

## Where it lives

- `src/lib/access-tokens.ts` (generate, hash, verify) and `src/lib/access-token-store.ts`
- `src/lib/mcp/owner-server.ts` (tools), `owner-data.ts` (scoped queries), `owner-stats.ts` (pure aggregation)
- `src/app/api/mcp/route.ts`, `src/app/api/settings/access-tokens/…`
- `src/components/settings/AccessTokensCard.tsx`
- `docs/migrations/011_staff_access_tokens.sql`

## Update — T36: the same tools inside the dashboard

**Context.** After T35 shipped, the owner pointed out that restaurant owners mostly use the Claude or ChatGPT websites, or their phone. Claude on the web and ChatGPT connect to MCP servers through OAuth sign-in and can't reach a token-protected server. Installing Claude Desktop and editing a config file is too much to ask of most owners.

**Decision.** The owner Q&A also lives **inside the QBite dashboard** ("Ask AI", `/dashboard/assistant`). MCP stays for technical users.

- **One definition, two ways in.** The four tools are defined once in `src/lib/mcp/owner-tools.ts`. The MCP server exposes them over MCP. The dashboard assistant (`src/lib/ai/owner-assistant.ts`) gives them to Claude through the Anthropic SDK's tool runner, like the diner menu assistant. A test checks both expose the same names and descriptions.
- **Scope comes from the staff session.** There are no tokens: the owner is already signed in, and `supabaseOwnerData(session.restaurantId)` binds the data before the model sees any tool.
- **The same guardrails** as the diner chat: client history is capped and sanitised (`sanitizeChatHistory`, now shared by both chats), tool results are fenced as data, internal errors are hidden from the model, the loop is capped (6 rounds, 45 s), rate limits apply per staff member and restaurant, there's a kill switch (`AI_OWNER_ASSISTANT_ENABLED`), and logs record counts and token usage only.
- Owners and managers only; other roles are redirected or get 403.

**Consequences.**
- ✅ Every owner can use it on a phone, with nothing to install and no extra AI subscription.
- ✅ The two ways in can't drift: same definitions, same data layer, same "no customer PII" rule.
- ⚠️ The restaurant pays for the model calls (rate-limited). With MCP, the owner's own AI subscription pays.
- 📌 OAuth for claude.ai web and ChatGPT connectors remains an option if owners ask for it.
