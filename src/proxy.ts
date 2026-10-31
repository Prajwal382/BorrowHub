import { unsealData } from "iron-session";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionOptions, type SessionData } from "@/lib/auth/session-config";

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
]);

// FR-01: an early check that a valid session cookie exists. Roles and ownership are decided
// by the server-side guards on each page and route handler (FR-02), never here.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const options = getSessionOptions();
  const cookie = request.cookies.get(options.cookieName)?.value;
  const session = cookie
    ? await unsealData<Partial<SessionData>>(cookie, { password: options.password })
    : {};
  if (session.userId) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Please log in to continue." } },
      { status: 401 },
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
