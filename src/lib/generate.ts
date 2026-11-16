import { planCreatives, type Plan } from "./copy";
import { db, download, getBrand, log, upload } from "./db";
import { placementsFor, type Aspect, type Placement } from "./formats";
import { renderJpeg } from "./render";
import { previewForModel } from "./render/photo";
import type { LayoutId, Overlay } from "./render/templates";
import { brandLogo, type Brand } from "./brand-assets";
import { learningContext } from "./learning";
import { likedTraits } from "./inspiration";

export interface SlideRecord {
  photo_id: string | null;
  layout: LayoutId;
  overlay: Overlay;
  aspect: Aspect;
  image_path?: string;
}

export interface CreativeRecord {
  id: string;
  item_id: string;
  placement: Placement;
  variant: number;
  layout: string;
  slides: SlideRecord[];
  copy: Record<string, unknown>;
  status: string;
}

type PlanSlide = NonNullable<Plan["feed"]>["slides"][number];

interface PhotoRow {
  id: string; storage_path: string; credit: string | null;
  analysis: { focal_x?: number; focal_y?: number } | null;
  story_variant_path?: string | null;
}

/**
 * Calendar item + its photos -> Claude plan -> rendered creatives in storage.
 * Replaces any existing draft creatives for the item (approved/published ones are kept).
 */
export async function generateForItem(itemId: string, actor: string, direction?: string | null) {
  const sb = db();
  const { data: item, error } = await sb.from("calendar_items").select("*").eq("id", itemId).single();
  if (error) throw error;
  const brand = await getBrand(item.brand_id);

  const { data: photos } = await sb.from("photos").select("*").eq("item_id", itemId).order("created_at");
  const photoRows = (photos ?? []) as PhotoRow[];
  if (!photoRows.length) throw new Error("Add at least one photo first.");

  const placements = placementsFor(item.kind, item.format);
  if (!placements.length) throw new Error(`Nothing to generate for a ${item.kind} item.`);
  if (item.ad_set_id && !placements.includes("ad")) placements.push("ad");

  const originals = await Promise.all(photoRows.map((p) => download(p.storage_path)));
  const previews = await Promise.all(originals.map(previewForModel));

  const monday = mondayOf(item.date);
  const { data: theme } = await sb.from("week_themes").select("theme, goal").eq("brand_id", item.brand_id).eq("week_start", monday).maybeSingle();

  const learning = [await learningContext(brand.id, item.pillar), await likedTraits(brand.id)].filter(Boolean).join("\n\n") || null;

  const plan = await planCreatives({
    brand, item, weekTheme: theme, placements, direction, learning,
    photos: previews.map((p, i) => ({ ...p, credit: photoRows[i].credit })),
  });

  // Save photo checks (focal points drive every future crop of that photo).
  await Promise.all(plan.photo_checks.map((c) => {
    const row = photoRows[c.photo_index];
    if (!row) return null;
    row.analysis = c;
    return sb.from("photos").update({ analysis: c }).eq("id", row.id);
  }));

  await sb.from("creatives").delete().eq("item_id", itemId).eq("status", "draft");

  const toSlides = (s: PlanSlide[], aspect: Aspect): SlideRecord[] =>
    s.map((x) => ({ photo_id: x.photo_index === null ? null : photoRows[x.photo_index]?.id ?? null, layout: x.layout, overlay: clean(x.overlay), aspect }));

  const rows: Omit<CreativeRecord, "id" | "status">[] = [];
  if (plan.feed && placements.includes("feed")) {
    rows.push({ item_id: itemId, placement: "feed", variant: 1, layout: plan.feed.slides[0]?.layout ?? "overlay",
      slides: toSlides(plan.feed.slides, "4:5"),
      copy: { caption: plan.feed.caption, hashtags: plan.feed.hashtags } });
  }
  if (plan.story && placements.includes("story")) {
    rows.push({ item_id: itemId, placement: "story", variant: 1, layout: plan.story.frames[0]?.layout ?? "overlay",
      slides: toSlides(plan.story.frames, "9:16"), copy: {} });
  }
  if (plan.ad && placements.includes("ad")) {
    const base = toSlides([plan.ad.slide], "4:5")[0];
    rows.push({ item_id: itemId, placement: "ad", variant: 1, layout: base.layout,
      slides: [base, { ...base, aspect: "9:16" }],
      copy: { primary_text: plan.ad.primary_text, headline: plan.ad.headline, description: plan.ad.description, cta: plan.ad.cta, link_url: item.link_url } });
  }

  // Keep Claude's version untouched so later edits can be learned from.
  const withOriginal = rows.map((r) => ({ ...r, original: snapshot(r) }));
  const { data: inserted, error: insErr } = await sb.from("creatives").insert(withOriginal).select("*");
  if (insErr) throw insErr;

  const byId = new Map(photoRows.map((p, i) => [p.id, { row: p, buf: originals[i] }]));
  for (const c of inserted as CreativeRecord[]) await renderCreative(c, brand, byId);

  await sb.from("calendar_items").update({ status: "generated", review_notes: plan.review_notes, updated_at: new Date().toISOString() }).eq("id", itemId);
  await log("generated", { placements, notes: plan.review_notes, direction }, { item_id: itemId }, actor);
  return plan;
}

/** (Re)render every slide of a creative from its stored slides + overlay text. */
export async function renderCreative(
  c: CreativeRecord,
  brand?: Brand,
  photoCache?: Map<string, { row: PhotoRow; buf: Buffer }>,
) {
  const sb = db();
  brand ??= await getBrand((await sb.from("calendar_items").select("brand_id").eq("id", c.item_id).single()).data!.brand_id);
  const logo = await brandLogo(brand);
  const cache = photoCache ?? new Map();
  const stamp = Date.now();

  const slides: SlideRecord[] = [];
  for (const [i, s] of c.slides.entries()) {
    let photo: { row: PhotoRow; buf: Buffer } | undefined;
    if (s.photo_id) {
      photo = cache.get(s.photo_id);
      if (!photo) {
        const { data: row } = await sb.from("photos").select("*").eq("id", s.photo_id).single();
        photo = { row: row as PhotoRow, buf: await download(row!.storage_path) };
        cache.set(s.photo_id, photo);
      }
    }
    const a = photo?.row.analysis;
    // Story-shaped renders use the AI-extended 9:16 version of the photo when one exists.
    let buf = photo?.buf;
    let focal = a?.focal_x != null ? { x: a.focal_x, y: a.focal_y! } : null;
    if (photo && s.aspect === "9:16" && photo.row.story_variant_path) {
      const key = `story:${photo.row.id}`;
      if (!cache.has(key)) cache.set(key, { row: photo.row, buf: await download(photo.row.story_variant_path) });
      buf = cache.get(key)!.buf;
      focal = a?.focal_x != null ? { x: a.focal_x, y: 0.5 } : null;
    }
    const jpg = await renderJpeg({
      kit: brand.kit, brandName: brand.name, aspect: s.aspect, layout: s.layout, overlay: s.overlay,
      photo: buf, focal,
      logo, credit: photo?.row.credit ?? undefined,
      slide: c.placement === "feed" ? { index: i, count: c.slides.length } : undefined,
    });
    const path = `renders/${c.item_id}/${c.id}/${i}-${s.aspect.replace(":", "x")}-${stamp}.jpg`;
    await upload(path, jpg);
    slides.push({ ...s, image_path: path });
  }
  await sb.from("creatives").update({ slides, updated_at: new Date().toISOString() }).eq("id", c.id);
  return slides;
}

/** The parts a reviewer can change: per-slide layout/photo/text and the copy. */
export function snapshot(c: { slides: SlideRecord[]; copy: Record<string, unknown> }) {
  return { slides: c.slides.map((s) => ({ layout: s.layout, photo_id: s.photo_id, overlay: s.overlay })), copy: c.copy };
}

function clean(o: { eyebrow: string | null; headline: string | null; body: string | null; cta: string | null }): Overlay {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v)) as Overlay;
}

function mondayOf(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
