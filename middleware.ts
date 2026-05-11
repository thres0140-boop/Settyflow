import { NextResponse, type NextRequest } from "next/server";
import { readSessionFromRequest, SESSION_COOKIE } from "@/lib/session";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/unipile/webhook", // Unipile must POST here without auth
  "/api/unipile/callback", // redirect target after hosted auth
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/icon")
  ) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await readSessionFromRequest(token);

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
