// Inspiration board.
//  - analyzeInspiration: Claude reads a screenshot (+ your note) and pulls out
//    concrete design/copy traits, rule ideas and, if needed, a template idea.
//  - syncWatchList: Instagram Business Discovery pulls recent public posts from
//    watched business/creator accounts, scores them against each account's own
//    normal, keeps the standouts, and writes a "what's working" report.
// Ideas are for borrowing traits, never for copying someone's design, words or photos.
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import sharp from "sharp";
import { z } from "zod";
import { claude, MODEL } from "./copy";
import { db, download, getBrand, listBrands, log, upload } from "./db";
import { graph } from "./meta/graph";
import { LAYOUTS } from "./render/templates";

const TraitSchema = z.object({
  area: z.enum(["layout", "type", "colour", "copy", "photo", "other"]),
  observation: z.string().describe("What the design does, concretely (sizes, positions, word counts)."),
  how_to_apply: z.string().describe("How our brand could borrow this trait without copying the design."),
});

const AnalysisSchema = z.object({
  summary: z.string().describe("One sentence: what makes this work."),
  traits: z.array(TraitSchema).describe("3-6 traits, most important first. Focus on what the reviewer said they like."),
  rule_ideas: z.array(z.string()).describe("0-3 short house-style rules our generator could follow (writing/layout choices only)."),
  closest_template: z.string().nullable().describe(`The closest of our existing templates (${Object.keys(LAYOUTS).join(", ")}), or null if none is close.`),
  template_idea: z.object({ title: z.string(), description: z.string().describe("Precise spec for a developer: where text sits, sizes, shapes, what varies per post.") })
    .nullable().describe("Only if the liked look needs a layout we don't have. Null otherwise."),
});

const TEMPLATES = Object.entries(LAYOUTS).map(([id, d]) => `- ${id}: ${d}`).join("\n");

const SYSTEM = `You are a social media art director for small outdoor-guiding brands (Altus Mountain Guides, Corvus Snowboarding, Winterstoke). Our posts are rendered from fixed templates in a black-and-white palette with each brand's logo; headlines use a bold condensed display face.
Our templates:
${TEMPLATES}

When analysing reference material: describe transferable traits precisely, tie them to what the reviewer said they like, and suggest how we could borrow the idea in our own style. Never suggest copying another brand's photos, wording, logo or distinctive trade dress.`;

async function smallJpeg(buf: Buffer) {
  return (await sharp(buf, { failOn: "none" }).rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()).toString("base64");
}

export async function analyzeInspiration(id: string) {
  const sb = db();
  const { data: ins } = await sb.from("inspirations").select("*").eq("id", id).single();
  if (!ins?.image_path) throw new Error("No image to analyse");
  const brandName = ins.brand_id ? (await getBrand(ins.brand_id)).name : "all three brands";
  const img = await smallJpeg(await download(ins.image_path));

  const res = await claude().messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: img } },
        { type: "text", text: [
          `Reference for: ${brandName}.`,
          ins.account ? `Posted by @${ins.account}${ins.engagement?.score ? `, engagement ${ins.engagement.score.toFixed(1)}x that account's usual` : ""}.` : "Uploaded screenshot.",
          ins.caption ? `Caption: ${String(ins.caption).slice(0, 1200)}` : null,
          ins.note ? `What the reviewer likes about it: ${ins.note}` : "The reviewer didn't say what they like; infer the strongest transferable traits.",
        ].filter(Boolean).join("\n") },
      ],
    }],
    output_config: { effort: "medium", format: zodOutputFormat(AnalysisSchema) },
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("Could not analyse this image.");
  await sb.from("inspirations").update({ analysis: res.parsed_output }).eq("id", id);
  return res.parsed_output;
}

// ---------------- Instagram watch list ----------------

interface IgMedia {
  id: string; caption?: string; like_count?: number; comments_count?: number; media_type: string;
  media_url?: string; thumbnail_url?: string; permalink: string; timestamp: string;
  children?: { data: { media_url?: string; media_type: string }[] };
}

/** Our own IG account id (any brand's) is needed to call Business Discovery. */
async function ourIgId(brandId: string) {
  const brand = await getBrand(brandId);
  if (brand.meta.igUserId) return brand.meta.igUserId;
  const any = (await listBrands()).find((b) => b.meta.igUserId);
  if (!any) throw new Error("Add an Instagram account id on the Brands page first (needed to look up other accounts).");
  return any.meta.igUserId!;
}

async function fetchAccount(igId: string, username: string) {
  const fields = `business_discovery.username(${username}){followers_count,media.limit(30){id,caption,like_count,comments_count,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_url,media_type}}}`;
  const r = await graph<{ business_discovery: { followers_count: number; media?: { data: IgMedia[] } } }>(igId, { fields }, "GET");
  return { followers: r.business_discovery.followers_count, media: r.business_discovery.media?.data ?? [] };
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/** Pull watched accounts for a brand, keep standout posts from the last 45 days, write a report. */
export async function syncWatchList(brandId: string, actor: string) {
  const sb = db();
  const { data: accounts } = await sb.from("watch_accounts").select("*").eq("brand_id", brandId);
  if (!accounts?.length) return { kept: 0, note: "No accounts on the watch list yet." };
  const igId = await ourIgId(brandId);
  const since = Date.now() - 45 * 864e5;
  const keptIds: string[] = [];

  for (const acc of accounts) {
    try {
      const { followers, media } = await fetchAccount(igId, acc.username);
      const scored = media.map((m) => {
        const eng = (m.like_count ?? 0) + (m.comments_count ?? 0);
        return { m, eng, rate: followers ? eng / followers : 0 };
      });
      const norm = median(scored.map((s) => s.rate)) || 1e-9;
      const standouts = scored
        .filter((s) => new Date(s.m.timestamp).getTime() >= since)
        .map((s) => ({ ...s, score: s.rate / norm }))
        .sort((a, b) => b.score - a.score)
        .filter((s, i) => s.score >= 1.5 || i < 2)
        .slice(0, 4);

      for (const s of standouts) {
        const { data: exists } = await sb.from("inspirations").select("id").eq("permalink", s.m.permalink).maybeSingle();
        if (exists) continue;
        const imgUrl = s.m.media_type === "VIDEO" ? s.m.thumbnail_url : s.m.media_url ?? s.m.children?.data.find((c) => c.media_url)?.media_url;
        if (!imgUrl) continue;
        const resp = await fetch(imgUrl);
        if (!resp.ok) continue;
        const jpg = await sharp(Buffer.from(await resp.arrayBuffer()), { failOn: "none" }).resize(1080, 1350, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
        const path = `inspiration/ig/${acc.username}/${s.m.id}.jpg`;
        await upload(path, jpg);
        const { data: row } = await sb.from("inspirations").insert({
          brand_id: brandId, source: "instagram", image_path: path, permalink: s.m.permalink, account: acc.username,
          caption: s.m.caption ?? null, posted_at: s.m.timestamp, created_by: actor,
          engagement: { likes: s.m.like_count ?? null, comments: s.m.comments_count ?? null, followers, rate: s.rate, score: s.score, format: s.m.media_type },
        }).select("id").single();
        if (row) keptIds.push(row.id);
      }
      await sb.from("watch_accounts").update({ followers, last_synced: new Date().toISOString(), last_error: null }).eq("id", acc.id);
    } catch (e) {
      // Personal accounts and private/renamed ones can't be looked up; note it and carry on.
      await sb.from("watch_accounts").update({ last_error: e instanceof Error ? e.message : String(e), last_synced: new Date().toISOString() }).eq("id", acc.id);
    }
  }

  for (const id of keptIds) await analyzeInspiration(id).catch(() => null);
  const report = keptIds.length ? await writeTrendReport(brandId, keptIds) : null;
  await log("inspiration_synced", { brandId, kept: keptIds.length }, {}, actor);
  return { kept: keptIds.length, report: report?.id ?? null };
}

const ReportSchema = z.object({
  summary: z.string().describe("3-5 sentences: what is working for these accounts right now and what that means for us."),
  findings: z.array(z.object({ finding: z.string(), evidence: z.string().describe("Which posts / numbers show it.") })).describe("2-5 findings."),
  rule_ideas: z.array(z.object({ rule: z.string(), evidence: z.string() })).describe("0-3 house-style rules worth trying."),
  template_ideas: z.array(z.object({ title: z.string(), description: z.string() })).describe("0-2 layouts we don't have that the standouts suggest."),
});

async function writeTrendReport(brandId: string, ids: string[]) {
  const sb = db();
  const brand = await getBrand(brandId);
  const { data: posts } = await sb.from("inspirations").select("*").in("id", ids);
  const content: Anthropic.ContentBlockParam[] = [];
  const list = (posts ?? []).slice(0, 12);
  for (const [n, p] of list.entries()) {
    const e = p.engagement ?? {};
    content.push({ type: "text", text: `Post ${n + 1}: @${p.account}, ${e.format ?? ""}, ${e.score ? `${e.score.toFixed(1)}x usual engagement` : ""}${e.likes != null ? `, ${e.likes} likes` : ""}${e.comments != null ? `, ${e.comments} comments` : ""}. Caption: ${String(p.caption ?? "").slice(0, 600)}` });
    if (p.image_path) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: await smallJpeg(await download(p.image_path)) } });
  }
  content.push({ type: "text", text: `These are this week's standout posts from accounts ${brand.name} watches. Current rules for ${brand.name}:\n${brand.kit.rules.map((r) => `- ${r}`).join("\n")}\nWrite the report.` });

  const res = await claude().messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    output_config: { effort: "medium", format: zodOutputFormat(ReportSchema) },
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) return null;
  const r = res.parsed_output;
  const { data: row } = await sb.from("trend_reports").insert({
    brand_id: brandId, summary: r.summary, findings: r.findings, template_ideas: r.template_ideas, post_ids: ids,
  }).select("id").single();
  if (r.rule_ideas.length) {
    await sb.from("rule_suggestions").insert(r.rule_ideas.map((x) => ({ brand_id: brandId, rule: x.rule, evidence: `Weekly inspiration report: ${x.evidence}` })));
  }
  return row;
}

/** Short block for generation prompts: traits the reviewer has said they like. */
export async function likedTraits(brandId: string): Promise<string | null> {
  const { data } = await db().from("inspirations").select("note, analysis, brand_id")
    .or(`brand_id.eq.${brandId},brand_id.is.null`).eq("status", "kept").not("analysis", "is", null)
    .order("created_at", { ascending: false }).limit(5);
  const lines = (data ?? []).flatMap((i) => {
    const traits = (i.analysis?.traits ?? []).filter((t: { area: string }) => t.area === "copy" || t.area === "layout").slice(0, 2);
    return traits.map((t: { how_to_apply: string }) => `- ${t.how_to_apply}${i.note ? ` (reviewer liked: "${String(i.note).slice(0, 120)}")` : ""}`);
  });
  return lines.length ? `Styles the reviewer has saved as inspiration (borrow the idea, in our own templates):\n${lines.join("\n")}` : null;
}
