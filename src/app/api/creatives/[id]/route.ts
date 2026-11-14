import { db, log } from "@/lib/db";
import { renderCreative, type CreativeRecord, type SlideRecord } from "@/lib/generate";
import { route } from "@/lib/http";
import { LAYOUTS } from "@/lib/render/templates";

export const maxDuration = 120;

/** Edit overlay text / layouts / copy, then re-render. */
export const PATCH = route<{ id: string }>(async (req, { id }, user) => {
  const body = (await req.json()) as { slides?: SlideRecord[]; copy?: Record<string, unknown> };
  const sb = db();
  const { data } = await sb.from("creatives").select("*").eq("id", id).single();
  const c = data as CreativeRecord;
  if (c.status === "published") throw new Error("Already published.");

  const slides = body.slides
    ? c.slides.map((s, i) => {
        const n = body.slides![i];
        if (!n) return s;
        const layout = n.layout in LAYOUTS ? n.layout : s.layout;
        return { ...s, layout, overlay: n.overlay ?? s.overlay, photo_id: n.photo_id !== undefined ? n.photo_id : s.photo_id };
      })
    : c.slides;
  // An ad's feed and story images share one design.
  if (c.placement === "ad" && body.slides?.[0]) slides[1] = { ...slides[1], layout: slides[0].layout, overlay: slides[0].overlay, photo_id: slides[0].photo_id };

  const updated = { ...c, slides, copy: { ...c.copy, ...(body.copy ?? {}) }, status: "draft" };
  await sb.from("creatives").update({ copy: updated.copy, status: "draft" }).eq("id", id);
  // An edit needs a fresh approval before anything publishes.
  await sb.from("calendar_items").update({ status: "generated" }).eq("id", c.item_id).eq("status", "approved");
  const textOnly = !body.slides;
  if (!textOnly) await renderCreative(updated);
  await log("edited", { rerendered: !textOnly }, { item_id: c.item_id, creative_id: id }, user);
});
