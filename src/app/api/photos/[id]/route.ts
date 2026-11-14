import { db } from "@/lib/db";
import { route } from "@/lib/http";

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const { credit } = await req.json();
  await db().from("photos").update({ credit: credit || null }).eq("id", id);
});

/** Detach from the item (the file stays in storage for reuse). */
export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  await db().from("photos").update({ item_id: null }).eq("id", id);
});
