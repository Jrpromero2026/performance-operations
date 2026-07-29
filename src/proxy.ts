import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Route protection + session refresh (Next 16 "proxy" convention — the
 * successor to middleware.ts).
 *
 * When Supabase is configured, every non-public route requires a signed-in
 * user; unauthenticated requests are redirected to /login with the intended
 * destination preserved, and authenticated users are bounced away from
 * /login. When Supabase is NOT configured, routing falls through to the app
 * shell, which renders either the explicit offline preview or the
 * setup-required page — never real data.
 */

const PUBLIC_PATHS = new Set([
  "/login",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
]);

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname) || pathname.startsWith("/auth/");
}

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refreshes the session when needed; the ONLY trustworthy signal is
  // getUser() (validates the JWT against the auth server).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    const next = pathname === "/" ? "" : `${pathname}${search}`;
    if (next) loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    const nextParam = request.nextUrl.searchParams.get("next");
    const dest = request.nextUrl.clone();
    dest.pathname =
      nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
        ? nextParam
        : "/overview";
    dest.search = "";
    return NextResponse.redirect(dest);
  }

  return response;
}

export const config = {
  // Everything except static assets and files with extensions.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\..*).*)"],
};
