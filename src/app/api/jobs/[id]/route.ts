import { db } from "@/lib/db";
import { route } from "@/lib/http";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const { data } = await db().from("jobs").select("id, type, status, result, error, updated_at").eq("id", id).single();
  if (!data) throw new Error("Job not found");
  return data;
});
