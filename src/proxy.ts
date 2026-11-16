import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./lib/public-config";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Keeps the Supabase session cookie fresh and sends signed-out visitors to /login.
// The email allowlist itself is checked server-side in lib/auth.ts.
// Paths that must never be redirected to /login. Checked here in code as well
// as in `config.matcher`, because on Netlify the matcher was not applied: the
// proxy ran on /login (redirect loop) and on /auth/callback (sign-in code lost).
const PUBLIC = [/^\/login(\/|$)/, /^\/auth(\/|$)/, /^\/api\/cron(\/|$)/, /^\/_next\//, /^\/favicon\.ico$/, /^\/\.netlify\//];

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();

  // If Supabase lands the sign-in link on any other page (e.g. the Site URL),
  // hand the one-time code to the callback instead of dropping it.
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
