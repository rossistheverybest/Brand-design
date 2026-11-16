// Learning from review. Claude is not retrained; instead every review is
// recorded, and the useful parts go back into future requests:
//   1. approved posts become style examples,
//   2. edits become "do it this way" before/after pairs,
//   3. rejections carry the reason,
//   4. on request, Claude proposes new brand rules from all of the above,
//      which a person accepts or dismisses (accepted ones join kit.rules).
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { claude, MODEL } from "./copy";
import { db, getBrand } from "./db";
import { snapshot, type CreativeRecord } from "./generate";

type Snap = ReturnType<typeof snapshot>;

/** Record what happened at review time. Called when a creative is approved or rejected. */
export async function recordReview(creativeId: string, decision: "approved" | "rejected", reason?: string | null) {
  const sb = db();
  const { data } = await sb.from("creatives").select("*, calendar_items(brand_id, pillar)").eq("id", creativeId).single();
  if (!data) return;
  const c = data as CreativeRecord & { original: Snap | null; calendar_items: { brand_id: string; pillar: string | null } };
  const final = snapshot(c);
  const edited = c.original ? JSON.stringify(normalise(c.original)) !== JSON.stringify(normalise(final)) : false;
  await sb.from("feedback").insert({
    brand_id: c.calendar_items.brand_id,
    item_id: c.item_id,
    creative_id: c.id,
    kind: decision === "rejected" ? "rejected" : edited ? "approved_edited" : "approved_unchanged",
    placement: c.placement,
    pillar: c.calendar_items.pillar,
    original: c.original,
    final,
    reason: reason || null,
  });
}

function normalise(s: Snap) {
  return { slides: s.slides.map((x) => ({ l: x.layout, p: x.photo_id, o: x.overlay })), copy: s.copy };
}

interface FeedbackRow { kind: string; placement: string | null; pillar: string | null; original: Snap | null; final: Snap | null; reason: string | null; created_at: string }

/** Text block added to the generation request so new drafts follow past reviews. */
export async function learningContext(brandId: string, pillar: string | null): Promise<string | null> {
  const { data } = await db().from("feedback").select("kind, placement, pillar, original, final, reason, created_at")
    .eq("brand_id", brandId).order("created_at", { ascending: false }).limit(60);
  const rows = (data ?? []) as FeedbackRow[];
  if (!rows.length) return null;
  const samePillarFirst = (a: FeedbackRow, b: FeedbackRow) => Number(b.pillar === pillar) - Number(a.pillar === pillar);

  const approved = rows.filter((r) => r.kind !== "rejected" && r.placement === "feed" && r.final).sort(samePillarFirst).slice(0, 4);
  const edits = rows.filter((r) => r.kind === "approved_edited").flatMap((r) => diffs(r)).slice(0, 8);
  const rejected = rows.filter((r) => r.kind === "rejected" && r.reason).slice(0, 5);

  const parts: string[] = ["What the reviewer has taught us about this brand (most recent first):"];
  if (approved.length) {
    parts.push("Approved posts. Match this tone and level of detail:");
    for (const r of approved) {
      const heads = r.final!.slides.map((s) => s.overlay?.headline).filter(Boolean).join(" / ");
      const cap = String(r.final!.copy?.caption ?? "").slice(0, 350);
      parts.push(`- [${r.pillar ?? "post"}] on-image: "${heads}" | caption: "${cap}${cap.length >= 350 ? "…" : ""}"`);
    }
  }
  if (edits.length) {
    parts.push("Changes the reviewer made to drafts. Write it their way from the start:");
    parts.push(...edits.map((e) => `- ${e}`));
  }
  if (rejected.length) {
    parts.push("Drafts the reviewer rejected, and why. Avoid repeating these:");
    for (const r of rejected) {
      const head = r.original?.slides.map((s) => s.overlay?.headline).filter(Boolean)[0] ?? "";
      parts.push(`- ${r.placement}${head ? ` "${head}"` : ""}: ${r.reason}`);
    }
  }
  return parts.length > 1 ? parts.join("\n") : null;
}

/** Field-level before → after lines for one edited creative. */
function diffs(r: FeedbackRow): string[] {
  const o = r.original, f = r.final;
  if (!o || !f) return [];
  const out: string[] = [];
  const clip = (v: unknown) => { const s = String(v ?? "").replace(/\s+/g, " ").trim(); return s.length > 220 ? `${s.slice(0, 220)}…` : s; };
  f.slides.forEach((s, i) => {
    const before = o.slides[i];
    if (!before) return;
    for (const k of ["eyebrow", "headline", "body", "cta"] as const) {
      const a = before.overlay?.[k], b = s.overlay?.[k];
      if ((a ?? "") !== (b ?? "")) out.push(`${r.placement} slide ${i + 1} ${k}: "${clip(a)}" → "${clip(b)}"`);
    }
    if (before.layout !== s.layout) out.push(`${r.placement} slide ${i + 1} layout: ${before.layout} → ${s.layout}`);
  });
  for (const k of ["caption", "primary_text", "headline", "description", "cta"]) {
    const a = o.copy?.[k], b = f.copy?.[k];
    if (a !== undefined && clip(a) !== clip(b)) out.push(`${r.placement} ${k}: "${clip(a)}" → "${clip(b)}"`);
  }
  return out;
}

const SuggestionSchema = z.object({
  suggestions: z.array(z.object({
    rule: z.string().describe("One short, specific, actionable rule in the imperative, e.g. 'Keep on-image headlines to 5 words or fewer.'"),
    evidence: z.string().describe("What in the feedback shows this, with counts where possible."),
  })).describe("0 to 5 new rules. Empty if the feedback shows no clear pattern."),
});

/** Ask Claude for new brand rules from recent feedback; stored as pending suggestions. */
export async function suggestRules(brandId: string) {
  const sb = db();
  const brand = await getBrand(brandId);
  const { data } = await sb.from("feedback").select("kind, placement, pillar, original, final, reason, created_at")
    .eq("brand_id", brandId).order("created_at", { ascending: false }).limit(40);
  const rows = (data ?? []) as FeedbackRow[];
  if (rows.length < 3) return { added: 0, note: "Not enough reviews yet. Approve or reject a few more posts first." };

  const { data: prior } = await sb.from("rule_suggestions").select("rule, status").eq("brand_id", brandId);
  const counts = rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.kind]: (m[r.kind] ?? 0) + 1 }), {});
  const lines = [
    `Brand: ${brand.name}`,
    `Current rules:\n${brand.kit.rules.map((r) => `- ${r}`).join("\n")}`,
    prior?.length ? `Already suggested before (do not repeat, including dismissed ones):\n${prior.map((p) => `- (${p.status}) ${p.rule}`).join("\n")}` : null,
    `Last ${rows.length} reviews: ${counts.approved_unchanged ?? 0} approved as-is, ${counts.approved_edited ?? 0} approved after edits, ${counts.rejected ?? 0} rejected.`,
    `Edits (before → after):\n${rows.flatMap(diffs).slice(0, 60).join("\n") || "(none)"}`,
    `Rejection reasons:\n${rows.filter((r) => r.reason).map((r) => `- ${r.reason}`).join("\n") || "(none)"}`,
  ].filter(Boolean).join("\n\n");

  const res = await claude().messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: "You help a small outdoor-guiding business keep its social media consistent. From a reviewer's edits and rejections, propose new house-style rules that would have prevented the edits. Only propose a rule when there is a repeated pattern (2+ instances) or a rejection reason states it directly. Rules must be about writing or design choices the generator controls, not about facts. Do not restate existing rules.",
    messages: [{ role: "user", content: lines }],
    output_config: { effort: "medium", format: zodOutputFormat(SuggestionSchema) },
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("Could not produce suggestions; try again later.");
  const fresh = res.parsed_output.suggestions.slice(0, 5);
  if (fresh.length) await sb.from("rule_suggestions").insert(fresh.map((s) => ({ brand_id: brandId, rule: s.rule, evidence: s.evidence })));
  return { added: fresh.length };
}
