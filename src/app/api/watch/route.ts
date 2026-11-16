import { db } from "@/lib/db";
import { route } from "@/lib/http";

/** Add an Instagram business/creator account to a brand's watch list. */
export const POST = route(async (req) => {
  const { brand_id, username } = await req.json();
  const u = String(username ?? "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(u)) throw new Error("That doesn't look like an Instagram username.");
  const { error } = await db().from("watch_accounts").insert({ brand_id, username: u });
  if (error && !String(error.message).includes("duplicate")) throw error;
});
