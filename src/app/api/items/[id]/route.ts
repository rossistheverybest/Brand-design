import { db } from "@/lib/db";
import { route } from "@/lib/http";
import { pick } from "../route";

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const { data: cur } = await db().from("calendar_items").select("brand_id").eq("id", id).single();
  const body = await pick(await req.json(), cur?.brand_id);
  const { error } = await db().from("calendar_items").update({ ...body, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
});

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  await db().from("calendar_items").update({ status: "cancelled" }).eq("id", id);
});
