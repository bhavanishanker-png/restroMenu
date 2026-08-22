import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { StaffRole, StaffSession } from "@/types";

// ---------------------------------------------------------------- constants

const COOKIE_NAME = "qbite-staff";
const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours

type SessionPayload = {
  staffId: string;
  restaurantId: string;
  role: StaffRole;
  exp: number; // unix seconds
};

// ---------------------------------------------------------------- crypto helpers

const encoder = new TextEncoder();

async function importKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET ?? "dev-secret-change-in-production";
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function b64UrlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64UrlDecode(str: string): Uint8Array {
  const pad = str.length + ((4 - (str.length % 4)) % 4);
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(pad, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function signToken(payload: SessionPayload): Promise<string> {
  const key = await importKey();
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = b64UrlEncode(new Uint8Array(encoder.encode(payloadJson)).buffer as ArrayBuffer);
  const sig = await crypto.subtle.sign("HMAC", key, new Uint8Array(encoder.encode(payloadB64)));
  return `${payloadB64}.${b64UrlEncode(sig)}`;
}

async function verifyToken(token: string): Promise<SessionPayload | null> {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;

  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  try {
    const key = await importKey();
    const sigBytes = b64UrlDecode(sigB64);
    // new Uint8Array(src) copies into a fresh ArrayBuffer — TS types it as
    // Uint8Array<ArrayBuffer>, satisfying the BufferSource constraint.
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      new Uint8Array(sigBytes),
      new Uint8Array(encoder.encode(payloadB64))
    );
    if (!valid) return null;

    const payloadBytes = b64UrlDecode(payloadB64);
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- public API

/** Read and verify the session cookie. Returns null if absent, expired, or tampered. */
export async function getStaffSession(): Promise<StaffSession | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  return {
    staffId: payload.staffId,
    restaurantId: payload.restaurantId,
    role: payload.role,
  };
}

/** Sign a session and write it as an HTTP-only cookie. */
export async function setSessionCookie(session: StaffSession): Promise<void> {
  const payload: SessionPayload = {
    ...session,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const token = await signToken(payload);
  cookies().set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

/** Expire the session cookie. */
export function clearSessionCookie(): void {
  cookies().set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Guard helper for API routes.
 * Returns a NextResponse (401 or 403) if the session is missing or the role
 * is not in `allowedRoles`; returns null when access is granted.
 *
 * Usage:
 *   const guard = await requireRole(['owner', 'manager']);
 *   if (guard) return guard;
 */
export async function requireRole(allowedRoles: StaffRole[]): Promise<NextResponse | null> {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required." } },
      { status: 401 }
    );
  }
  if (!allowedRoles.includes(session.role)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Insufficient permissions." } },
      { status: 403 }
    );
  }
  return null;
}
