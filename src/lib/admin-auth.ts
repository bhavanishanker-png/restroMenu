import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const COOKIE_NAME = "qbite-admin";
const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours

const encoder = new TextEncoder();

async function importKey(): Promise<CryptoKey> {
  const secret = process.env.SUPER_ADMIN_SECRET ?? "dev-admin-secret-change-in-prod";
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

async function signToken(exp: number): Promise<string> {
  const key = await importKey();
  const payload = b64UrlEncode(
    new Uint8Array(encoder.encode(JSON.stringify({ exp }))).buffer as ArrayBuffer
  );
  const sig = await crypto.subtle.sign("HMAC", key, new Uint8Array(encoder.encode(payload)));
  return `${payload}.${b64UrlEncode(sig)}`;
}

async function verifyToken(token: string): Promise<boolean> {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return false;
  const payload = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  try {
    const key = await importKey();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      new Uint8Array(b64UrlDecode(sigB64)),
      new Uint8Array(encoder.encode(payload))
    );
    if (!valid) return false;
    const { exp } = JSON.parse(new TextDecoder().decode(b64UrlDecode(payload))) as { exp: number };
    return exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function getAdminSession(): Promise<boolean> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return false;
  return verifyToken(token);
}

export async function setAdminCookie(): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = await signToken(exp);
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

export function clearAdminCookie(): void {
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

export async function requireAdmin(): Promise<NextResponse | null> {
  const ok = await getAdminSession();
  if (!ok) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Admin authentication required." } },
      { status: 401 }
    );
  }
  return null;
}
