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
