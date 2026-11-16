import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./public-config";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Cookie-bound client used only for authentication (sign-in state). */
export async function authClient() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* called from a Server Component */ }
      },
    },
  });
}
