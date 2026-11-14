import "server-only";
import { redirect } from "next/navigation";
import { authClient } from "./supabase-ssr";

const allowed = () =>
  (process.env.ALLOWED_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export function isAllowed(email?: string | null) {
  return !!email && allowed().includes(email.toLowerCase());
}

/** Returns the signed-in, allow-listed user's email or null. */
export async function currentUser(): Promise<string | null> {
  const { data } = await (await authClient()).auth.getUser();
  return isAllowed(data.user?.email) ? data.user!.email! : null;
}

/** For pages: redirect to /login when not signed in. */
export async function requireUser(): Promise<string> {
  const email = await currentUser();
  if (!email) redirect("/login");
  return email;
}

/** For route handlers: throws a 401 Response when not signed in. */
export async function requireApiUser(): Promise<string> {
  const email = await currentUser();
  if (!email) throw new Response("Unauthorized", { status: 401 });
  return email;
}
