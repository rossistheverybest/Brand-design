import { db, log } from "@/lib/db";
import { route } from "@/lib/http";

export const PATCH = route<{ id: string }>(async (req, { id }, user) => {
  const { kit, meta, name } = await req.json();
  const { error } = await db().from("brands").update({ kit, meta, name, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  await log("brand_updated", { id }, {}, user);
});
