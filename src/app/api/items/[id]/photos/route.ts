import sharp from "sharp";
import { db, download, log } from "@/lib/db";
import { route } from "@/lib/http";

/** Register an uploaded photo against a calendar item. */
export const POST = route<{ id: string }>(async (req, { id }, user) => {
  const { path, credit } = await req.json();
  if (!String(path).startsWith("uploads/")) throw new Error("Bad path");
  const meta = await sharp(await download(path)).metadata().catch(() => null);
  if (!meta) throw new Error("That file is not an image we can read (use JPEG, PNG or WebP).");
  const { data: item } = await db().from("calendar_items").select("brand_id").eq("id", id).single();
  const { data, error } = await db().from("photos").insert({
    item_id: id, brand_id: item?.brand_id, storage_path: path, credit: credit || null,
    width: meta.width, height: meta.height,
  }).select("id").single();
  if (error) throw error;
  await log("photo_added", { path }, { item_id: id }, user);
  return data;
});
