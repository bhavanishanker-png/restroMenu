/**
 * The owner Q&A MCP server (T35): the four read-only owner tools over one
 * restaurant's data. SERVER-ONLY.
 *
 * The tools themselves are defined once in owner-tools.ts and shared with the
 * dashboard "Ask AI" chat (T36); this file only exposes them over MCP.
 *
 * Built fresh for every HTTP request (stateless Streamable HTTP), for the
 * principal resolved from that request's access token. `data` is already
 * bound to principal.restaurantId; no input schema has a restaurant field,
 * and the SDK strips unknown arguments, so tool input can't select another
 * restaurant. Read-only by design (ADR 0009, 0012).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import {
  OWNER_TOOL_ERROR,
  getDeadItems,
  getTodaySales,
  getTopItems,
  listOrders,
  type OwnerTool,
  type OwnerToolContext,
} from "@/lib/mcp/owner-tools";
import type { OwnerData } from "@/lib/mcp/owner-data";
import type { AccessTokenPrincipal } from "@/types";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export function buildOwnerMcpServer(
  principal: AccessTokenPrincipal,
  data: OwnerData,
  now: () => Date = () => new Date()
): McpServer {
  const server = new McpServer(
    { name: "qbite-owner", version: "1.0.0" },
    {
      instructions:
        "Read-only data for one QBite restaurant: sales, orders, best sellers and dishes that don't sell. " +
        "Money is in the restaurant's currency and includes tax. Days follow the restaurant's own timezone. " +
        "These tools cannot change anything; to change the menu or orders, use the QBite dashboard.",
    }
  );
  const ctx: OwnerToolContext = { data, now };

  /** Registers one shared tool: logs counts and timing (never the data), turns failures into a tool error. */
  function expose(tool: OwnerTool<z.ZodRawShape>) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.input, annotations: READ_ONLY },
      // The SDK has already validated `args`; parsing again with the tool's own
      // schema gives a typed value without a cast, and costs microseconds.
      async (args: unknown): Promise<CallToolResult> => {
        const started = Date.now();
        const log = { restaurantId: principal.restaurantId, tokenId: principal.tokenId, tool: tool.name };
        try {
          const value = await tool.run(ctx, z.object(tool.input).parse(args));
          console.info("[mcp]", { ...log, ok: true, ms: Date.now() - started });
          return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
        } catch (err) {
          console.error("[mcp]", { ...log, ok: false }, err);
          return { isError: true, content: [{ type: "text", text: OWNER_TOOL_ERROR }] };
        }
      }
    );
  }

  expose(getTodaySales);
  expose(listOrders);
  expose(getTopItems);
  expose(getDeadItems);
  return server;
}

/**
 * The one place a request's token is turned into a server: the data source is
 * created from principal.restaurantId, nothing else. Exported so the tenant
 * binding is unit-tested, and used by /api/mcp.
 */
export function ownerServerFor(
  principal: AccessTokenPrincipal,
  dataFor: (restaurantId: string) => OwnerData
): McpServer {
  return buildOwnerMcpServer(principal, dataFor(principal.restaurantId));
}
