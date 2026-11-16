import { db } from "@/lib/db";
import { route } from "@/lib/http";
import { startJob } from "@/lib/jobs-trigger";

/** Save an uploaded screenshot with what you like about it, then analyse it. */
export const POST = route(async (req, _p, user) => {
  const { path, note, brand_id } = await req.json();
  if (!String(path).startsWith("inspiration/")) throw new Error("Bad path");
  const { data, error } = await db().from("inspirations").insert({
    source: "upload", image_path: path, note: note || null, brand_id: brand_id || null, status: "kept", created_by: user,
  }).select("id").single();
  if (error) throw error;
  return startJob("analyze_inspiration", { inspirationId: data.id }, user);
});
