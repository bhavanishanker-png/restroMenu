import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // Admin routes — fast cookie-presence check; signature verified server-side.
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const cookie = req.cookies.get("qbite-admin");
    if (!cookie?.value) {
      const loginUrl = new URL("/admin/login", req.url);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // Dashboard routes — fast cookie-presence check; signature verified server-side.
  if (pathname.startsWith("/dashboard")) {
    const cookie = req.cookies.get("qbite-staff");
    if (!cookie?.value) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
