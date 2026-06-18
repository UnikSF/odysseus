import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico).+)"],
};

const PUBLIC = ["/login", "/register", "/setup", "/api/auth/login", "/api/auth/register", "/api/auth/setup", "/api/auth/status"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Invite routes are always public
  if (pathname.startsWith("/invite/") || pathname.startsWith("/api/invite/")) {
    return NextResponse.next();
  }

  // Other public paths
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const session = req.cookies.get("fw_session")?.value;
  if (!session) {
    const login = req.nextUrl.clone();
    login.pathname = "/login";
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}
