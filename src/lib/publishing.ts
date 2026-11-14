import "server-only";
import { db, download, getBrand, log, signedUrl } from "./db";
import type { CreativeRecord } from "./generate";
import { createPausedAd } from "./meta/ads";
import { publishFacebook, publishInstagram } from "./meta/publish";

/**
 * Publish one creative. Only approved creatives go out. That rule is enforced
 * here, not in the UI, so the scheduler can't skip it either.
 */
export async function publishCreative(creativeId: string, actor: string) {
  const sb = db();
  const { data: c } = await sb.from("creatives").select("*").eq("id", creativeId).single();
  const creative = c as CreativeRecord;
  if (creative.status !== "approved") throw new Error("Approve this creative before publishing it.");

  const { data: item } = await sb.from("calendar_items").select("*").eq("id", creative.item_id).single();
  const brand = await getBrand(item.brand_id);
  const paths = creative.slides.map((s) => s.image_path!).filter(Boolean);
  if (!paths.length) throw new Error("This creative has no rendered images.");

  try {
    let result: Record<string, unknown> = {};
    if (creative.placement === "ad") {
      const adSetId = item.ad_set_id ?? brand.meta.defaultAdSetId;
      const link = (creative.copy.link_url as string) || item.link_url || brand.kit.website;
      if (!brand.meta.adAccountId || !brand.meta.pageId) throw new Error(`Set the ad account and Page ids for ${brand.name} on the Brands page.`);
      if (!adSetId) throw new Error("Choose an ad set for this item (or set a default ad set for the brand).");
      if (!link) throw new Error("Add a link URL for the ad.");
      const feed = creative.slides.find((s) => s.aspect === "4:5")!;
      const story = creative.slides.find((s) => s.aspect === "9:16")!;
      result = await createPausedAd({
        adAccountId: brand.meta.adAccountId, adSetId, pageId: brand.meta.pageId, igUserId: brand.meta.igUserId,
        name: `${item.date} · ${item.title}`,
        feedJpg: await download(feed.image_path!), storyJpg: await download(story.image_path!),
        primaryText: String(creative.copy.primary_text), headline: String(creative.copy.headline),
        description: String(creative.copy.description ?? ""), cta: String(creative.copy.cta), link,
      });
    } else {
      const kind = creative.placement === "story" ? "story" : "feed";
      const urls = await Promise.all(paths.map((p) => signedUrl(p, 3600)));
      const caption = kind === "feed" ? await buildCaption(creative) : "";
      const channels: string[] = item.channels ?? ["instagram", "facebook"];
      if (channels.includes("instagram")) {
        if (!brand.meta.igUserId) throw new Error(`Set the Instagram account id for ${brand.name} on the Brands page.`);
        Object.assign(result, await publishInstagram(brand.meta.igUserId, urls, caption, kind));
      }
      if (channels.includes("facebook")) {
        if (!brand.meta.pageId) throw new Error(`Set the Facebook Page id for ${brand.name} on the Brands page.`);
        Object.assign(result, await publishFacebook(brand.meta.pageId, urls, caption, kind));
      }
    }
    await sb.from("creatives").update({ status: "published", meta_result: result, published_at: new Date().toISOString() }).eq("id", creativeId);
    await log(creative.placement === "ad" ? "ad_created_paused" : "published", result, { item_id: item.id, creative_id: creativeId }, actor);

    // Item is published once every organic creative is out.
    const { data: rest } = await sb.from("creatives").select("status, placement").eq("item_id", item.id).neq("placement", "ad");
    if (rest?.length && rest.every((r) => r.status === "published")) {
      await sb.from("calendar_items").update({ status: "published" }).eq("id", item.id);
    }
    return result;
  } catch (e) {
    const detail = e instanceof Error ? { message: e.message, ...(e as { detail?: object }).detail } : { message: String(e) };
    await sb.from("creatives").update({ meta_result: { error: detail } }).eq("id", creativeId);
    await log("publish_failed", detail, { item_id: item.id, creative_id: creativeId }, actor);
    throw e;
  }
}

async function buildCaption(c: CreativeRecord) {
  const caption = String(c.copy.caption ?? "");
  const tags = (c.copy.hashtags as string[] | undefined) ?? [];
  const ids = [...new Set(c.slides.map((s) => s.photo_id).filter(Boolean))] as string[];
  let credits: string[] = [];
  if (ids.length) {
    const { data } = await db().from("photos").select("credit").in("id", ids);
    credits = [...new Set((data ?? []).map((p) => p.credit).filter(Boolean))];
  }
  return [caption, credits.length ? `📷 ${credits.join(", ")}` : "", tags.join(" ")].filter(Boolean).join("\n\n");
}

/** Called by the cron route: publish approved organic creatives whose time has come. */
export async function publishDue() {
  const sb = db();
  const today = new Date().toISOString().slice(0, 10);
  const { data: items } = await sb.from("calendar_items").select("*").eq("status", "approved").lte("date", today);
  const results: { item: string; creative: string; ok: boolean; error?: string }[] = [];
  for (const item of items ?? []) {
    const brand = await getBrand(item.brand_id);
    const due = item.publish_at ? new Date(item.publish_at) : zonedTime(item.date, brand.kit.defaultPublishTime, brand.kit.timezone);
    if (due > new Date()) continue;
    const { data: creatives } = await sb.from("creatives").select("id").eq("item_id", item.id).eq("status", "approved").neq("placement", "ad");
    for (const c of creatives ?? []) {
      try { await publishCreative(c.id, "scheduler"); results.push({ item: item.id, creative: c.id, ok: true }); }
      catch (e) { results.push({ item: item.id, creative: c.id, ok: false, error: e instanceof Error ? e.message : String(e) }); }
    }
  }
  return results;
}

/** "2026-11-20" + "08:30" in America/Vancouver -> UTC Date. */
export function zonedTime(date: string, time: string, timeZone: string) {
  const guess = new Date(`${date}T${time}:00Z`);
  const local = new Date(guess.toLocaleString("en-US", { timeZone }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() + (utc.getTime() - local.getTime()));
}
