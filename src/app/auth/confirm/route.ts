import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAllowed } from "@/lib/auth";
import { authClient } from "@/lib/supabase-ssr";

/**
 * Email link sign-in (token hash). Unlike the PKCE code flow this needs nothing
 * stored in the browser beforehand, so the link works from any browser, Chrome
 * profile or device. The email template links here:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const fail = (msg: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, url.origin));

  const token_hash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "email") as EmailOtpType;
  if (!token_hash) return fail("The sign-in link is incomplete. Request a new one.");

  const supabase = await authClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });
  if (error) return fail(`${error.message}. Links work once and expire after an hour; request a new one.`);
  if (!isAllowed(data.user?.email)) {
    await supabase.auth.signOut();
    return fail(`${data.user?.email ?? "This email"} isn't on the list of people allowed to use Brand Studio.`);
  }
  return NextResponse.redirect(new URL("/", url.origin));
}
