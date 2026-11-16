// Public Supabase settings. These are not secrets: they ship to every browser.
// Environment variables win; the fallbacks keep the app working if a host
// builds without them (e.g. a cached build from before they were added).
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://pqpwkjoroczixtzxlvxa.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_D4ks6PsYJ6Tx1LLfIPeGZA_ndy3YYsq";
