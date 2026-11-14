import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { META_CTAS, type Brand } from "./brand";
import { LIMITS, type Placement } from "./formats";
import { LAYOUTS } from "./render/templates";

const MODEL = "claude-opus-5-5";
const client = new Anthropic();

const LayoutEnum = z.enum(Object.keys(LAYOUTS) as [keyof typeof LAYOUTS, ...(keyof typeof LAYOUTS)[]]);

const OverlaySchema = z.object({
  eyebrow: z.string().nullable().describe("Short kicker above the headline, e.g. pillar or dates. <= 32 chars."),
  headline: z.string().nullable().describe(`On-image headline, <= ${LIMITS.overlayHeadline} chars, 2-6 words ideal.`),
  body: z.string().nullable().describe(`Optional one-line support text, <= ${LIMITS.overlayBody} chars. Usually null on cover slides.`),
  cta: z.string().nullable().describe("Button text on the image, 1-3 words, e.g. 'Book now', 'Link in bio'. Null for inspiration posts."),
});

const SlideSchema = z.object({
  photo_index: z.number().int().nullable().describe("Index into the supplied photos; null only for the 'endcard' layout."),
  layout: LayoutEnum,
  overlay: OverlaySchema,
});

export const PlanSchema = z.object({
  photo_checks: z.array(z.object({
    photo_index: z.number().int(),
    subject: z.string().describe("What the photo shows, one sentence."),
    focal_x: z.number().describe("Horizontal centre of the main subject, 0 (left) to 1 (right)."),
    focal_y: z.number().describe("Vertical centre of the main subject, 0 (top) to 1 (bottom)."),
    warnings: z.array(z.string()).describe("Brand-rule or quality problems (wrong sport, logos of competitors, blurry, faces cut off). Empty if none."),
  })),
  feed: z.object({
    slides: z.array(SlideSchema).describe("1 slide for a single post; 3-10 for a carousel, ending with an 'endcard' when there is a CTA."),
    caption: z.string().describe("Instagram/Facebook caption in brand voice. Hook in the first line. No hashtags here."),
    hashtags: z.array(z.string()),
  }).nullable(),
  story: z.object({
    frames: z.array(SlideSchema).describe("1-3 story frames, 9:16."),
  }).nullable(),
  ad: z.object({
    slide: SlideSchema.describe("The ad image design; rendered at 4:5 for feeds and 9:16 for stories/reels."),
    primary_text: z.string().describe(`Ad primary text. First ${LIMITS.primaryText} chars must stand alone.`),
    headline: z.string().describe(`<= ${LIMITS.headline} chars.`),
    description: z.string().describe(`<= ${LIMITS.description} chars.`),
    cta: z.enum(META_CTAS),
  }).nullable(),
  review_notes: z.array(z.string()).describe("Things the approver must check or fill in (missing price, unconfirmed dates, weak photo). Empty if none."),
});
export type Plan = z.infer<typeof PlanSchema>;

export interface PlanInput {
  brand: Brand;
  item: {
    date: string; kind: string; format: string; pillar: string | null;
    title: string; brief: string | null; link_url: string | null; flag: string | null;
  };
  weekTheme?: { theme: string; goal: string | null } | null;
  placements: Placement[];
  photos: { data: string; width: number; height: number; credit: string | null }[];
  /** Free-text direction from the reviewer when regenerating. */
  direction?: string | null;
}

function systemPrompt(brand: Brand) {
  const k = brand.kit;
  return `You are the social media designer and copywriter for ${brand.name}.
You plan creatives that are rendered with fixed brand templates, so your job is choosing photos, layouts and words, never visual styling.

Brand voice: ${k.voice}

Hard rules (never break these):
${k.rules.map((r) => `- ${r}`).join("\n")}

Templates:
${Object.entries(LAYOUTS).map(([id, d]) => `- ${id}: ${d}`).join("\n")}

Guidance:
- Overlay text is read in under two seconds. Fewer words beats clever words. Never repeat the caption on the image.
- 'minimal' for pure inspiration posts. 'overlay' for covers and single posts with a message. 'band' for information slides (dates, what's included, steps). 'endcard' as the last carousel slide with the CTA.
- Use each photo at most once per carousel unless there are not enough photos. Prefer the strongest photo for the cover and the ad.
- Stories: CTA reads 'Link in bio' or 'Tap the link' style, never 'swipe up'.
- Ads: lead with the outcome for the customer, include the concrete detail (dates, place) from the brief, no ALL CAPS, no more than one emoji.
- Only state prices, dates and claims that appear in the brief or calendar item. If something a post needs is missing, put it in review_notes instead of inventing it.
- Hashtags: start from the brand set ${k.hashtags.join(" ")} and add at most 4 specific ones.
- Brand handle: ${k.handle}. Website: ${k.website || "none"}.`;
}

export async function planCreatives(input: PlanInput): Promise<Plan> {
  const { item, placements } = input;
  const brief = [
    `Calendar item for ${input.brand.name}`,
    `Date: ${item.date}`,
    `Kind: ${item.kind} · Format: ${item.format}${item.pillar ? ` · Pillar: ${item.pillar}` : ""}`,
    `Title: ${item.title}`,
    item.brief ? `Brief: ${item.brief}` : "Brief: (none, work from the title)",
    item.link_url ? `Link: ${item.link_url}` : null,
    item.flag ? `Open flag on the calendar: ${item.flag}` : null,
    input.weekTheme ? `This week's theme: ${input.weekTheme.theme}${input.weekTheme.goal ? ` (goal: ${input.weekTheme.goal})` : ""}` : null,
    `Make: ${placements.join(", ")}. Return null for anything not listed.`,
    item.format === "carousel" ? "The feed post is a carousel." : "The feed post is a single image unless the brief asks for a carousel.",
    input.direction ? `Reviewer direction for this version: ${input.direction}` : null,
    `${input.photos.length} photo(s) follow, in order, indexed from 0.`,
  ].filter(Boolean).join("\n");

  const content: Anthropic.ContentBlockParam[] = [{ type: "text", text: brief }];
  input.photos.forEach((p, i) => {
    content.push({ type: "text", text: `Photo ${i} (${p.width}x${p.height})${p.credit ? `, credit ${p.credit}` : ""}:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: p.data } });
  });

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: systemPrompt(input.brand), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    output_config: { effort: "medium", format: zodOutputFormat(PlanSchema) },
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Claude declined to plan this item${response.stop_details?.explanation ? `: ${response.stop_details.explanation}` : ""}`);
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new Error("Claude's plan was incomplete; try again.");
  }
  return sanitize(response.parsed_output, input.photos.length);
}

/** Guard against out-of-range indexes and over-long copy. */
function sanitize(plan: Plan, nPhotos: number): Plan {
  const fix = <T extends { photo_index: number | null; layout: string }>(s: T): T => {
    if (s.layout !== "endcard" && (s.photo_index === null || s.photo_index < 0 || s.photo_index >= nPhotos)) {
      return { ...s, photo_index: nPhotos ? 0 : null, layout: nPhotos ? s.layout : "endcard" };
    }
    return s;
  };
  if (plan.feed) plan.feed.slides = plan.feed.slides.slice(0, LIMITS.carouselMaxSlides).map(fix);
  if (plan.story) plan.story.frames = plan.story.frames.slice(0, 3).map(fix);
  if (plan.ad) {
    plan.ad.slide = fix(plan.ad.slide);
    plan.ad.headline = plan.ad.headline.slice(0, LIMITS.headline);
    plan.ad.description = plan.ad.description.slice(0, LIMITS.description);
  }
  plan.photo_checks.forEach((c) => {
    c.focal_x = Math.min(1, Math.max(0, c.focal_x));
    c.focal_y = Math.min(1, Math.max(0, c.focal_y));
  });
  return plan;
}
