import { createHash } from "crypto";
import { describe, expect, it, vi } from "vitest";
import {
  TOKEN_DISPLAY_LENGTH,
  bearerToken,
  generateAccessToken,
  hashAccessToken,
  looksLikeAccessToken,
  verifyAccessToken,
  type TokenRow,
  type TokenStore,
} from "./access-tokens";

function fakeStore(opts: { row?: TokenRow | null; role?: string | null; touchFails?: boolean } = {}) {
  const calls = { findByHash: [] as string[], touch: 0 };
  const store: TokenStore = {
    async findActiveByHash(hash) {
      calls.findByHash.push(hash);
      return opts.row ?? null;
    },
    async findActiveStaffRole() {
      return opts.role === undefined ? "owner" : opts.role;
    },
    async touch() {
      calls.touch++;
      if (opts.touchFails) throw new Error("db down");
    },
  };
  return { store, calls };
}

const ROW: TokenRow = { id: "tok-1", restaurant_id: "rest-a", staff_id: "staff-1", scopes: ["read"], last_used_at: null };

describe("generateAccessToken", () => {
  it("makes a qbt_ token, a display prefix and a SHA-256 hash of it", () => {
    const { token, prefix, hash } = generateAccessToken();
    expect(looksLikeAccessToken(token)).toBe(true);
    expect(prefix).toBe(token.slice(0, TOKEN_DISPLAY_LENGTH));
    expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hash).not.toContain(token); // the stored value reveals nothing
  });

  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateAccessToken().token));
    expect(tokens.size).toBe(200);
  });
});

describe("bearerToken", () => {
  it("reads the token from an Authorization header", () => {
    expect(bearerToken("Bearer qbt_abc")).toBe("qbt_abc");
    expect(bearerToken("bearer   qbt_abc ")).toBe("qbt_abc");
    expect(bearerToken("Basic dXNlcjpwYXNz")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});

describe("verifyAccessToken", () => {
  const { token } = generateAccessToken();

  it("returns the restaurant from the token row for a valid token", async () => {
    const { store, calls } = fakeStore({ row: ROW });
    const p = await verifyAccessToken(token, store);
    expect(p).toEqual({ tokenId: "tok-1", staffId: "staff-1", restaurantId: "rest-a", role: "owner", scopes: ["read"] });
    expect(calls.findByHash).toEqual([hashAccessToken(token)]); // looked up by hash, never by the raw token
  });

  it("rejects malformed tokens without touching the database", async () => {
    const { store, calls } = fakeStore({ row: ROW });
    expect(await verifyAccessToken("qbt_short", store)).toBeNull();
    expect(await verifyAccessToken("not-a-token", store)).toBeNull();
    expect(calls.findByHash).toHaveLength(0);
  });

  it("rejects unknown and revoked tokens (the store only returns non-revoked rows)", async () => {
    expect(await verifyAccessToken(token, fakeStore({ row: null }).store)).toBeNull();
  });

  it("rejects a token whose staff member was removed or demoted", async () => {
    expect(await verifyAccessToken(token, fakeStore({ row: ROW, role: null }).store)).toBeNull();
    expect(await verifyAccessToken(token, fakeStore({ row: ROW, role: "kitchen" }).store)).toBeNull();
    expect(await verifyAccessToken(token, fakeStore({ row: ROW, role: "waiter" }).store)).toBeNull();
    expect((await verifyAccessToken(token, fakeStore({ row: ROW, role: "manager" }).store))?.role).toBe("manager");
  });

  it("rejects a token without the read scope", async () => {
    expect(await verifyAccessToken(token, fakeStore({ row: { ...ROW, scopes: [] } }).store)).toBeNull();
  });

  it("updates last_used_at at most once a minute, and never fails the request over it", async () => {
    const now = new Date("2026-11-14T10:00:00Z");
    const fresh = fakeStore({ row: { ...ROW, last_used_at: "2026-11-14T09:59:30Z" } });
    await verifyAccessToken(token, fresh.store, now);
    expect(fresh.calls.touch).toBe(0);

    vi.spyOn(console, "error").mockImplementation(() => {});
    const stale = fakeStore({ row: { ...ROW, last_used_at: "2026-11-14T09:50:00Z" }, touchFails: true });
    expect(await verifyAccessToken(token, stale.store, now)).not.toBeNull();
    expect(stale.calls.touch).toBe(1);
  });
});
