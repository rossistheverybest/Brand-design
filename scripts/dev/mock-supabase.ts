// Local stand-in for Supabase so the UI can be previewed without a project.
// .env.local for the mock: NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=mock,
// SUPABASE_SECRET_KEY=mock, ALLOWED_EMAILS=demo@example.com. The login page will not work against the mock; set an sb-127-auth-token session cookie by hand.
// Serves the imported calendar with fake statuses and the sample renders.
//   npx tsx scripts/dev/mock-supabase.ts   (then run next dev with .env pointing at http://127.0.0.1:54321)
import http from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { DEFAULT_KITS } from "../../src/lib/brand";
import { ITEMS } from "../../data/artifact-calendar";

const B: Record<string, string> = { corvus: "corvus", winter: "winterstoke", altus: "altus" };
const samples = readdirSync("samples").filter((f) => f.endsWith("-4x5.jpg") || f.endsWith("-9x16.jpg"));
const today = new Date().toISOString().slice(0, 10);

const brands = Object.entries(DEFAULT_KITS).map(([id, { name, kit }]) => ({ id, name, kit, meta: {} }));
const items = ITEMS.map((i, n) => {
  const brand_id = B[i.b];
  const past = i.d < today;
  const visual = ["post", "event"].includes(i.kind) && !/Reel/.test(i.m ?? "");
  const status = i.cancel ? "cancelled" : !visual ? "planned" : past ? "published" : n % 4 === 0 ? "approved" : n % 4 === 1 ? "generated" : "planned";
  const s = samples.filter((f) => f.startsWith(brand_id) && f.includes("4x5"));
  const creatives = status === "planned" || status === "cancelled" ? [] : [
    { placement: "feed", status: status === "generated" ? "draft" : status, published_at: past ? `${i.d}T16:30:00Z` : null,
      copy: { caption: `${i.t}. A sample caption written in the brand voice, with the details from the brief.` },
      slides: [0, 1, 2].slice(0, /Carousel/.test(i.m ?? "") ? 3 : 1).map((k) => ({ image_path: `renders/${s[(n + k) % s.length]}` })) },
    { placement: "story", status: status === "generated" ? "draft" : status, published_at: null, copy: {},
      slides: [{ image_path: `renders/${brand_id}-overlay-9x16.jpg` }] },
  ];
  return { id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`, brand_id, date: i.d, publish_at: null, kind: i.kind,
    format: /Carousel/.test(i.m ?? "") ? "carousel" : /Reel/.test(i.m ?? "") ? "reel" : "single", pillar: (i.m ?? "").split(" · ")[0] || null,
    title: i.t, flag: i.flag ?? null, status, creatives };
});

const inspirations = [
  { id: "i1", brand_id: "altus", source: "upload", image_path: "inspiration/altus-overlay-4x5.jpg", permalink: null, account: null, caption: null,
    note: "Love the huge headline sitting low over the photo with lots of sky", status: "kept", created_at: "2026-11-15T10:00:00Z", engagement: null,
    analysis: { summary: "Big, low headline lets the landscape breathe and reads instantly.", closest_template: "overlay",
      traits: [{ area: "layout", observation: "Headline occupies the bottom 30%, top 60% is untouched sky", how_to_apply: "Keep overlay text in the lower third and avoid eyebrow + body on covers" },
               { area: "copy", observation: "Three-word headline, no body copy", how_to_apply: "Cap cover headlines at 3-4 words" }],
      rule_ideas: ["Cover slides: headline only, 4 words max, no body text."], template_idea: null } },
  { id: "i2", brand_id: "corvus", source: "instagram", image_path: "inspiration/corvus-band-4x5.jpg", permalink: "https://instagram.com/p/x", account: "examplesplitco", caption: "Dates + price on slide 2",
    note: null, status: "new", created_at: "2026-11-16T10:00:00Z", engagement: { likes: 812, comments: 44, score: 3.2, format: "CAROUSEL_ALBUM" },
    analysis: { summary: "Price tag in the corner turns an inspiration shot into an offer without clutter.", closest_template: "band",
      traits: [{ area: "layout", observation: "Small rounded price tag top-right, 1/8 of the width", how_to_apply: "Add an optional corner tag for price or dates" }],
      rule_ideas: [], template_idea: { title: "Corner tag", description: "Full-bleed photo with a small rounded tag (price or dates) in the top-right corner, 28px text, white on black." } } },
];
const watch = [{ id: 1, brand_id: "corvus", username: "examplesplitco", followers: 18400, last_synced: "2026-11-16T15:00:00Z", last_error: null },
  { id: 2, brand_id: "altus", username: "someguideco", followers: null, last_synced: "2026-11-16T15:00:00Z", last_error: "Not a business account" }];
const reports = [{ id: 1, brand_id: "corvus", summary: "Carousels that put dates and price on the second slide outperformed single images about 3x this week. Short, lower-case headlines did best.", findings: [{ finding: "Price on slide 2 wins", evidence: "3 of 4 standouts, 2.4-3.2x usual" }], template_ideas: [{ title: "Corner tag", description: "Small price/date tag in a corner of a full-bleed photo." }], post_ids: ["i2"], created_at: "2026-11-16T15:05:00Z" }];

function filter(rows: Record<string, unknown>[], q: URLSearchParams) {
  return rows.filter((r) => [...q.entries()].every(([k, v]) => {
    if (["select", "order", "limit"].includes(k)) return true;
    const [op, ...rest] = v.split("."); const val = rest.join(".");
    const x = String(r[k]);
    if (op === "gte") return x >= val; if (op === "lte") return x <= val;
    if (op === "eq") return x === val; if (op === "neq") return x !== val;
    if (op === "in") return val.replace(/[()]/g, "").split(",").includes(x);
    return true;
  }));
}

http.createServer((req, res) => {
  const url = new URL(req.url!, "http://x");
  const json = (o: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  if (url.pathname === "/auth/v1/user") return json({ id: "u1", email: "demo@example.com", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" });
  if (url.pathname === "/rest/v1/brands") return json(brands);
  if (url.pathname === "/rest/v1/calendar_items") return json(filter(items, url.searchParams));
  if (url.pathname === "/rest/v1/inspirations") return json(inspirations);
  if (url.pathname === "/rest/v1/watch_accounts") return json(watch);
  if (url.pathname === "/rest/v1/trend_reports") return json(reports);
  if (url.pathname.startsWith("/rest/v1/")) return json([]);
  if (url.pathname === "/storage/v1/object/sign/media" && req.method === "POST") {
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
      const { paths } = JSON.parse(body);
      json(paths.map((p: string) => ({ path: p, signedURL: `/object/public-sample/${p.split("/").pop()}`, error: null })));
    }); return;
  }
  if (url.pathname.startsWith("/storage/v1/object/public-sample/")) {
    try { res.writeHead(200, { "content-type": "image/jpeg" }); return res.end(readFileSync(`samples/${url.pathname.split("/").pop()}`)); } catch { res.writeHead(404); return res.end(); }
  }
  res.writeHead(404); res.end();
}).listen(54321, () => console.log("mock supabase on :54321"));
