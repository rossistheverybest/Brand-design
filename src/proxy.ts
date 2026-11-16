import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./lib/public-config";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Keeps the Supabase session cookie fresh and sends signed-out visitors to /login.
// The email allowlist itself is checked server-side in lib/auth.ts.
export async function proxy(request: NextRequest) {
  // If Supabase lands the sign-in link on any page other than /auth/callback
  // (e.g. the Site URL), hand the one-time code to the callback instead of
  // dropping it on the way to /login.
  const { searchParams } = request.nextUrl;
  if (searchParams.get("code") || searchParams.get("error_description")) {
    const to = new URL("/auth/callback", request.url);
    searchParams.forEach((v, k) => to.searchParams.set(k, v));
    return NextResponse.redirect(to);
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (!data.user && !request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|auth|api/cron).*)"],
};
