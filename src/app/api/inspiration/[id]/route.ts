import { db } from "@/lib/db";
import { route } from "@/lib/http";

/** Keep / archive, change the note or which business it's for. */
export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  if (["new", "kept", "archived"].includes(body.status)) patch.status = body.status;
  if (typeof body.note === "string") patch.note = body.note || null;
  if ("brand_id" in body) patch.brand_id = body.brand_id || null;
  await db().from("inspirations").update(patch).eq("id", id);
});
