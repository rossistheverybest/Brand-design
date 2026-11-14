import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db, listBrands, signedUrl } from "@/lib/db";
import { BrandFilter } from "@/components/BrandFilter";

export const dynamic = "force-dynamic";

const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function Calendar({ searchParams }: { searchParams: Promise<{ from?: string; brands?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const brands = await listBrands();
  const show = sp.brands ? sp.brands.split(",") : brands.map((b) => b.id);

  const today = new Date(); today.setUTCHours(12, 0, 0, 0);
  const start = sp.from ? new Date(`${sp.from}T12:00:00Z`) : new Date(today);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7)); // Monday
  const weeks = 6;
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + weeks * 7 - 1);

  const sb = db();
  const [{ data: items }, { data: themes }] = await Promise.all([
    sb.from("calendar_items").select("id, brand_id, date, kind, format, pillar, title, flag, status, creatives(slides, placement)")
      .gte("date", iso(start)).lte("date", iso(end)).in("brand_id", show).order("date"),
    sb.from("week_themes").select("*").gte("week_start", iso(start)).lte("week_start", iso(end)).in("brand_id", show),
  ]);

  // First rendered feed image per item for the thumbnail.
  const thumbs = new Map<string, string>();
  await Promise.all((items ?? []).map(async (it) => {
    const c = (it.creatives as { slides: { image_path?: string }[]; placement: string }[]).find((x) => x.placement === "feed") ?? it.creatives[0];
    const p = c?.slides?.[0]?.image_path;
    if (p) thumbs.set(it.id, await signedUrl(p, 600));
  }));

  const prev = new Date(start); prev.setUTCDate(prev.getUTCDate() - 7 * weeks);
  const next = new Date(start); next.setUTCDate(next.getUTCDate() + 7 * weeks);
  const qs = (from: Date) => `/?from=${iso(from)}${sp.brands ? `&brands=${sp.brands}` : ""}`;

  return (
    <main className="wrap">
      <header style={{ display: "grid", gap: 10 }}>
        <div className="k">{MON[start.getUTCMonth()]} {start.getUTCDate()} – {MON[end.getUTCMonth()]} {end.getUTCDate()}, {end.getUTCFullYear()}</div>
        <h1>Marketing calendar</h1>
        <div className="row">
          <BrandFilter brands={brands.map((b) => ({ id: b.id, name: b.name }))} active={show} />
          <span style={{ flex: 1 }} />
          <Link className="btn" href={qs(prev)}>← Earlier</Link>
          <Link className="btn" href="/">Today</Link>
          <Link className="btn" href={qs(next)}>Later →</Link>
        </div>
      </header>

      {Array.from({ length: weeks }, (_, w) => {
        const wk = new Date(start); wk.setUTCDate(start.getUTCDate() + w * 7);
        const wkThemes = (themes ?? []).filter((t) => t.week_start === iso(wk));
        return (
          <section key={w} style={{ display: "grid", gap: 6 }}>
            <div className="week-head">
              <span className="k">Week of {MON[wk.getUTCMonth()]} {wk.getUTCDate()}</span>
              {wkThemes.map((t) => <span key={t.brand_id} className={`b-${t.brand_id}`}><span className="dot b" /> <b>{t.theme}</b>{t.goal ? <span className="muted"> · {t.goal}</span> : null}</span>)}
            </div>
            <div className="week">
              {Array.from({ length: 7 }, (_, d) => {
                const day = new Date(wk); day.setUTCDate(wk.getUTCDate() + d);
                const k = iso(day);
                const its = (items ?? []).filter((i) => i.date === k);
                const cls = ["day", k === iso(today) ? "today" : "", k < iso(today) ? "past" : ""].join(" ");
                return (
                  <div key={d} className={cls}>
                    <span className="k">{DAY[d]} {MON[day.getUTCMonth()]} {day.getUTCDate()}</span>
                    <div className="items">
                      {its.map((i) => {
                        const visual = ["post", "story", "ad", "event"].includes(i.kind);
                        return (
                          <Link key={i.id} href={`/items/${i.id}`} className={`item b-${i.brand_id} ${visual ? "" : "nonvisual"}`}>
                            {visual && (thumbs.get(i.id) ? <img className="thumb" src={thumbs.get(i.id)} alt="" /> : <span className="thumb" />)}
                            <span style={{ display: "grid" }}>
                              <span className="m">{brands.find((b) => b.id === i.brand_id)?.name} · {i.kind}{i.pillar ? ` · ${i.pillar}` : ""}{i.format !== "none" && i.format !== "single" ? ` · ${i.format}` : ""}</span>
                              <span className="t">{i.title}</span>
                              {i.flag && <span className="flag">● {i.flag}</span>}
                            </span>
                            <span className={`status ${i.status}`}>{i.status}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}
