/**
 * Personal access tokens for the owner MCP server (T35). SERVER-ONLY.
 *
 * Format: "qbt_" + 32 random bytes in base64url (256 bits). Only a SHA-256
 * hash is stored. A slow hash (bcrypt) protects low-entropy secrets like PINs;
 * a 256-bit random token can't be brute-forced, so a fast hash is enough and
 * lets us look the token up by its hash directly.
 *
 * Verification is done on EVERY request, the same way staff sessions are
 * (ADR 0006): the token row must exist and not be revoked, and the staff
 * member must still be active and still an owner or manager. Demoting or
 * removing someone disables their tokens immediately.
 */
import { createHash, randomBytes } from "crypto";
import type { AccessTokenPrincipal, AccessTokenScope } from "@/types";

export const TOKEN_PREFIX = "qbt_";
/** How much of the token the dashboard shows, e.g. "qbt_8f3kX2a1". */
export const TOKEN_DISPLAY_LENGTH = 12;
/** Most active tokens one restaurant can have at a time. */
export const MAX_ACTIVE_TOKENS = 10;
/** last_used_at is updated at most this often per token, not on every call. */
const TOUCH_INTERVAL_MS = 60_000;

const TOKEN_RE = /^qbt_[A-Za-z0-9_-]{43}$/;

export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** A new token. `token` is shown to the owner once; only `hash` and `prefix` are stored. */
export function generateAccessToken(): { token: string; prefix: string; hash: string } {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, prefix: token.slice(0, TOKEN_DISPLAY_LENGTH), hash: hashAccessToken(token) };
}

export function looksLikeAccessToken(value: string): boolean {
  return TOKEN_RE.test(value);
}

/** The token from an `Authorization: Bearer <token>` header, or null. */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------- verification

export type TokenRow = {
  id: string;
  restaurant_id: string;
  staff_id: string;
  scopes: string[];
  last_used_at: string | null;
};

/** The database operations verification needs; an interface so tests can fake it. */
export type TokenStore = {
  /** A token row with this hash that is not revoked. */
  findActiveByHash(hash: string): Promise<TokenRow | null>;
  /** The staff member's current role, if they are still active in this restaurant. */
  findActiveStaffRole(staffId: string, restaurantId: string): Promise<string | null>;
  touch(tokenId: string, restaurantId: string, at: Date): Promise<void>;
};

export async function verifyAccessToken(
  token: string,
  store: TokenStore,
  now: Date = new Date()
): Promise<AccessTokenPrincipal | null> {
  // Cheap format check first: random strings never reach the database.
  if (!looksLikeAccessToken(token)) return null;

  const row = await store.findActiveByHash(hashAccessToken(token));
  if (!row) return null;

  const role = await store.findActiveStaffRole(row.staff_id, row.restaurant_id);
  if (role !== "owner" && role !== "manager") return null;

  const scopes = row.scopes.filter((s): s is AccessTokenScope => s === "read");
  if (!scopes.includes("read")) return null;

  const lastUsed = row.last_used_at ? Date.parse(row.last_used_at) : 0;
  if (now.getTime() - lastUsed > TOUCH_INTERVAL_MS) {
    // Best effort: a failed "last used" update must not fail the request.
    store.touch(row.id, row.restaurant_id, now).catch((err: unknown) => {
      console.error("[access-tokens] last_used_at update failed", err);
    });
  }

  return { tokenId: row.id, staffId: row.staff_id, restaurantId: row.restaurant_id, role, scopes };
}
