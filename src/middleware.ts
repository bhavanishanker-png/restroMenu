import { NextRequest, NextResponse } from "next/server";

// Guard all /dashboard routes.
// Signature verification is deferred to getStaffSession() in each route handler /
// server component — middleware just does a fast cookie-presence check.
export function middleware(req: NextRequest): NextResponse {
  const cookie = req.cookies.get("qbite-staff");
  if (!cookie?.value) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
