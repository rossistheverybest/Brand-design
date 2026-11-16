import { db, log } from "@/lib/db";
import { route } from "@/lib/http";
import { recordReview } from "@/lib/learning";

/** Approve or reject (with a reason). When nothing is left in draft, the item is approved and will publish on its date. */
export const POST = route<{ id: string }>(async (req, { id }, user) => {
  const { decision, reason } = await req.json();
  if (!["approved", "rejected", "draft"].includes(decision)) throw new Error("Bad decision");
  const sb = db();
  const { data: c } = await sb.from("creatives").update({ status: decision }).eq("id", id).select("item_id").single();
  const { data: all } = await sb.from("creatives").select("status").eq("item_id", c!.item_id);
  const anyApproved = all!.some((x) => x.status === "approved");
  const anyDraft = all!.some((x) => x.status === "draft");
  await sb.from("calendar_items").update({ status: anyApproved && !anyDraft ? "approved" : "generated" }).eq("id", c!.item_id).in("status", ["generated", "approved"]);
  if (decision !== "draft") await recordReview(id, decision, reason);
  await log(decision, reason ? { reason } : {}, { item_id: c!.item_id, creative_id: id }, user);
});
