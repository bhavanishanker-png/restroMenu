import { NextRequest, NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { bearerToken, verifyAccessToken } from "@/lib/access-tokens";
import { supabaseTokenStore } from "@/lib/access-token-store";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp, isAiFeatureEnabled } from "@/lib/ai/guardrails";
import { ownerServerFor } from "@/lib/mcp/owner-server";
import { supabaseOwnerData } from "@/lib/mcp/owner-data";

// ─── /api/mcp ───────────────────────────────────────────────────────────────
//
// Owner Q&A MCP server (T35), Streamable HTTP in stateless JSON mode: every
// request carries its own token and gets a fresh server, so nothing is held
// between serverless invocations.
//
// Auth: `Authorization: Bearer qbt_…` (a personal access token from
// Dashboard → Settings → AI access). The restaurant comes from the token,
// never from the request. Tools are read-only.

export const dynamic = "force-dynamic";

function error(code: string, message: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

const UNAUTHORIZED = () =>
  error("UNAUTHORIZED", "A valid QBite access token is required.", 401, {
    // Tells MCP clients this is a bearer-token resource.
    "WWW-Authenticate": 'Bearer realm="qbite", error="invalid_token"',
  });

async function handle(req: NextRequest): Promise<Response> {
  if (!isAiFeatureEnabled("owner_mcp")) {
    return error("AI_DISABLED", "The QBite MCP server is turned off.", 503);
  }

  const token = bearerToken(req.headers.get("authorization"));
  if (!token) return UNAUTHORIZED();

  let principal;
  try {
    principal = await verifyAccessToken(token, supabaseTokenStore());
  } catch (err) {
    console.error("[mcp] token verification failed", err);
    return error("AUTH_UNAVAILABLE", "Couldn't check the token right now. Try again.", 503);
  }

  if (!principal) {
    // Only failures count here, so a guessing client is slowed down without
    // affecting owners using a valid token from the same IP.
    if (!(await checkRateLimit(`mcp-auth-fail:${clientIp(req.headers)}`, 20, 10 * 60_000))) {
      return error("RATE_LIMITED", "Too many failed attempts. Try again later.", 429);
    }
    return UNAUTHORIZED();
  }

  if (!(await checkRateLimit(`mcp:t:${principal.tokenId}`, 60, 60_000))) {
    return error("RATE_LIMITED", "Too many requests for this token. Wait a minute.", 429);
  }

  const server = ownerServerFor(principal, supabaseOwnerData);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    server.close().catch((err: unknown) => console.error("[mcp] close failed", err));
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
