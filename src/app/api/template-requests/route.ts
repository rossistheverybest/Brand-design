import { db, log } from "@/lib/db";
import { route } from "@/lib/http";

export const POST = route(async (req, _p, user) => {
  const { title, description, brand_id, inspiration_ids } = await req.json();
  if (!title || !description) throw new Error("Title and description are required");
  const { data, error } = await db().from("template_requests").insert({
    title, description, brand_id: brand_id || null, inspiration_ids: inspiration_ids ?? [], created_by: user,
  }).select("id").single();
  if (error) throw error;
  await log("template_requested", { title }, {}, user);
  return data;
});
