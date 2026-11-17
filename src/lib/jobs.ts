// Background jobs. Slow work (Claude + rendering, Meta publishing, image
// edits) runs as a job so no web request has to wait for it. The browser
// polls /api/jobs/:id. Jobs run in the Netlify background worker
// (netlify/functions/worker-background.mts) or, elsewhere, in-process after
// the response is sent (see jobs-trigger.ts).
import { db } from "./db";
import { generateForItem, renderCreative, type CreativeRecord } from "./generate";
import { suggestRules } from "./learning";
import { publishCreative, zonedTime } from "./publishing";
import { extendForStory } from "./touchup";
import { analyzeInspiration, syncWatchList } from "./inspiration";
import { getBrand } from "./db";

export type JobType = "generate" | "rerender" | "publish" | "extend_photo" | "learn" | "analyze_inspiration" | "sync_inspiration";

export async function enqueue(type: JobType, payload: Record<string, unknown>, actor: string) {
  const { data, error } = await db().from("jobs").insert({ type, payload, actor }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

const handlers: Record<JobType, (p: Record<string, string>, actor: string) => Promise<unknown>> = {
  generate: async (p, actor) => ({ review_notes: (await generateForItem(p.itemId, actor, p.direction, String(p.includeAd) === "true")).review_notes }),
  rerender: async (p) => {
    const { data } = await db().from("creatives").select("*").eq("id", p.creativeId).single();
    await renderCreative(data as CreativeRecord);
    return {};
  },
  publish: (p, actor) => publishCreative(p.creativeId, actor),
  extend_photo: (p, actor) => extendForStory(p.photoId, actor),
  learn: (p) => suggestRules(p.brandId),
  analyze_inspiration: (p) => analyzeInspiration(p.inspirationId),
  sync_inspiration: (p, actor) => syncWatchList(p.brandId, actor),
};

/** Claim and run one job. Safe to call twice: only the first claim runs it. */
export async function runJob(id: string) {
  const sb = db();
  const { data: claimed } = await sb.rpc("claim_job", { job_id: id });
  const job = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!job) return;
  try {
    const result = await handlers[job.type as JobType](job.payload, job.actor ?? "system");
    await sb.from("jobs").update({ status: "done", result: result ?? {}, updated_at: new Date().toISOString() }).eq("id", id);
  } catch (e) {
    const message = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
    console.error(`job ${id} (${job.type}) failed:`, e);
    await sb.from("jobs").update({ status: "failed", error: message, updated_at: new Date().toISOString() }).eq("id", id);
  }
}

/** Scheduler: queue a publish job for every approved organic creative that is due. */
export async function enqueueDue(): Promise<string[]> {
  const sb = db();
  const today = new Date().toISOString().slice(0, 10);
  const { data: items } = await sb.from("calendar_items").select("*").eq("status", "approved").lte("date", today);
  const ids: string[] = [];
  for (const item of items ?? []) {
    const brand = await getBrand(item.brand_id);
    const due = item.publish_at ? new Date(item.publish_at) : zonedTime(item.date, brand.kit.defaultPublishTime, brand.kit.timezone);
    if (due > new Date()) continue;
    const { data: creatives } = await sb.from("creatives").select("id").eq("item_id", item.id).eq("status", "approved").neq("placement", "ad");
    for (const c of creatives ?? []) {
      // Skip if a publish job for this creative is already queued or running.
      const { data: open } = await sb.from("jobs").select("id").eq("type", "publish").in("status", ["queued", "running"]).contains("payload", { creativeId: c.id }).limit(1);
      if (open?.length) continue;
      ids.push(await enqueue("publish", { creativeId: c.id }, "scheduler"));
    }
  }
  return ids;
}

/** Start a job: Netlify background worker when configured, otherwise in this process. */
export async function dispatch(id: string, runLocal: (fn: () => Promise<void>) => void) {
  if (process.env.JOB_RUNNER === "netlify") {
    const base = process.env.SITE_URL ?? process.env.URL;
    const res = await fetch(`${base}/.netlify/functions/worker-background`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.JOB_SECRET}`, "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok && res.status !== 202) throw new Error(`Could not start background job (${res.status})`);
  } else {
    runLocal(() => runJob(id));
  }
}

/** Weekly: queue a watch-list sync for every brand that watches accounts. */
export async function enqueueInspirationSyncs(): Promise<string[]> {
  const { data } = await db().from("watch_accounts").select("brand_id");
  const brands = [...new Set((data ?? []).map((r) => r.brand_id as string))];
  return Promise.all(brands.map((b) => enqueue("sync_inspiration", { brandId: b }, "scheduler")));
}
