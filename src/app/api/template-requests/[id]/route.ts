import { db } from "@/lib/db";
import { route } from "@/lib/http";

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const { status } = await req.json();
  if (!["open", "built", "declined"].includes(status)) throw new Error("Bad status");
  await db().from("template_requests").update({ status }).eq("id", id);
});
