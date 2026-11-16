import { NextResponse } from "next/server";
import { isAllowed } from "@/lib/auth";
import { authClient } from "@/lib/supabase-ssr";

/** Finishes the email sign-in: swaps the one-time code for a session cookie. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const fail = (msg: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, url.origin));

  const linkError = url.searchParams.get("error_description");
  if (linkError) return fail(linkError);

  const code = url.searchParams.get("code");
  if (!code) return fail("The sign-in link was missing its code. Request a new link.");

  const { data, error } = await (await authClient()).auth.exchangeCodeForSession(code);
  if (error) {
    // Most common: the link was opened in a different browser or app than the one that requested it.
    return fail(`${error.message}. Open the link in the same browser you requested it from, or request a new one.`);
  }
  if (!isAllowed(data.user?.email)) {
    await (await authClient()).auth.signOut();
    return fail(`${data.user?.email ?? "This email"} isn't on the list of people allowed to use Brand Studio.`);
  }
  return NextResponse.redirect(new URL("/", url.origin));
}
