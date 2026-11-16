import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db, listBrands, signedUrls } from "@/lib/db";
import { InspirationBoard, type Card, type Report, type Watch, type TemplateReq } from "@/components/InspirationBoard";

export const dynamic = "force-dynamic";

export default async function Inspiration({ searchParams }: { searchParams: Promise<{ brand?: string; show?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const brands = await listBrands();
  const brand = brands.find((b) => b.id === sp.brand)?.id ?? "all";
  const archived = sp.show === "archived";
  const sb = db();

  let q = sb.from("inspirations").select("*").order("created_at", { ascending: false }).limit(60);
  q = archived ? q.eq("status", "archived") : q.neq("status", "archived");
  if (brand !== "all") q = q.or(`brand_id.eq.${brand},brand_id.is.null`);
  const [{ data: ins }, { data: watch }, { data: reports }, { data: reqs }] = await Promise.all([
    q,
    sb.from("watch_accounts").select("*").order("username"),
    sb.from("trend_reports").select("*").order("created_at", { ascending: false }).limit(12),
    sb.from("template_requests").select("*").eq("status", "open").order("created_at", { ascending: false }),
  ]);
  const urls = await signedUrls((ins ?? []).map((i) => i.image_path).filter(Boolean), 3600).catch(() => new Map<string, string>());

  const cards: Card[] = (ins ?? []).map((i) => ({
    id: i.id, brand_id: i.brand_id, source: i.source, url: i.image_path ? urls.get(i.image_path) ?? null : null, permalink: i.permalink,
    account: i.account, caption: i.caption, note: i.note, engagement: i.engagement, analysis: i.analysis, status: i.status, created_at: i.created_at,
  }));
  // Latest report per brand.
  const latest = new Map<string, Report>();
  for (const r of (reports ?? []) as Report[]) if (!latest.has(r.brand_id)) latest.set(r.brand_id, r);
  const shownBrands = brand === "all" ? brands : brands.filter((b) => b.id === brand);
  const href = (b: string) => `/inspiration${b !== "all" ? `?brand=${b}` : ""}`;

  return (
    <main className="wrap">
      <header style={{ display: "grid", gap: 12 }}>
        <span className="k">Ideas to borrow, not copy</span>
        <h1>Inspiration</h1>
        <nav className="row">
          <div className="seg">
            <Link href={href("all")} aria-current={brand === "all" ? "page" : undefined}>All</Link>
            {brands.map((b) => <Link key={b.id} href={href(b.id)} aria-current={brand === b.id ? "page" : undefined} className={`b-${b.id}`}><span className="dot b" />{b.name.replace(/ (Mountain Guides|Snowboarding)$/, "")}</Link>)}
          </div>
          <span style={{ flex: 1 }} />
          <Link className="btn" href={archived ? href(brand) : `${href(brand)}${brand === "all" ? "?" : "&"}show=archived`}>{archived ? "Back to board" : "Archived"}</Link>
        </nav>
      </header>
      <InspirationBoard
        brands={brands.map((b) => ({ id: b.id, name: b.name }))}
        current={brand}
        cards={cards}
        watch={((watch ?? []) as Watch[]).filter((w) => brand === "all" || w.brand_id === brand)}
        reports={shownBrands.map((b) => latest.get(b.id)).filter(Boolean) as Report[]}
        requests={((reqs ?? []) as TemplateReq[]).filter((r) => brand === "all" || !r.brand_id || r.brand_id === brand)}
      />
    </main>
  );
}
