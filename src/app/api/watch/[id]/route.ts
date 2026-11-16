import { db } from "@/lib/db";
import { route } from "@/lib/http";

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  await db().from("watch_accounts").delete().eq("id", id);
});
