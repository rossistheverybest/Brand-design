import { db } from "@/lib/db";
import { route } from "@/lib/http";
import { startJob } from "@/lib/jobs-trigger";

/** Publish now (organic) or create the paused ad. Approval is re-checked inside the job. */
export const POST = route<{ id: string }>(async (_req, { id }, user) => {
  const { data } = await db().from("creatives").select("status").eq("id", id).single();
  if (data?.status !== "approved") throw new Error("Approve this creative before publishing it.");
  return startJob("publish", { creativeId: id }, user);
});
