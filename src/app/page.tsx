import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db, listBrands, signedUrls } from "@/lib/db";
import type { Brand } from "@/lib/brand";

export const dynamic = "force-dynamic";

type View = "month" | "week" | "day";
type Status = "planned" | "generated" | "approved" | "published" | "cancelled";

// What each status means to a person reading the calendar.
const STATUS: Record<Status, string> = {
  published: "Posted",
  approved: "Scheduled",
  generated: "In review",
  planned: "Planned",
  cancelled: "Cancelled",
};
const ORDER: Status[] = ["published", "approved", "generated", "planned"];
const VISUAL = ["post", "story", "ad", "event"];

const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (s: string) => new Date(`${s}T12:00:00Z`);
const add = (d: Date, days: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + days); return x; };
const monday = (d: Date) => add(d, -((d.getUTCDay() + 6) % 7));

interface Creative { placement: string; status: string; slides: { image_path?: string }[]; copy: { caption?: string; headline?: string }; published_at: string | null }
interface Item {
  id: string; brand_id: string; date: string; publish_at: string | null; kind: string; format: string;
  pillar: string | null; title: string; flag: string | null; status: Status; creatives: Creative[];
}

export default async function Calendar({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; brand?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const view: View = sp.view === "month" || sp.view === "day" ? sp.view : "week";
  const brands = await listBrands();
  const brand = brands.find((b) => b.id === sp.brand)?.id ?? "all";
  const ids = brand === "all" ? brands.map((b) => b.id) : [brand];

  const today = at(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver" }).format(new Date()));
  const anchor = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? at(sp.date) : today;

  // Range shown on screen, and the "period" the summary counts cover.
  let from: Date, to: Date, periodFrom: Date, periodTo: Date, title: string, prev: Date, next: Date;
  if (view === "day") {
    from = to = periodFrom = periodTo = anchor;
    title = `${DAY[(anchor.getUTCDay() + 6) % 7]} ${MON[anchor.getUTCMonth()]} ${anchor.getUTCDate()}, ${anchor.getUTCFullYear()}`;
    prev = add(anchor, -1); next = add(anchor, 1);
  } else if (view === "week") {
    from = periodFrom = monday(anchor); to = periodTo = add(from, 6);
    title = `${MON[from.getUTCMonth()]} ${from.getUTCDate()} – ${MON[to.getUTCMonth()]} ${to.getUTCDate()}, ${to.getUTCFullYear()}`;
    prev = add(from, -7); next = add(from, 7);
  } else {
    periodFrom = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1, 12));
    periodTo = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0, 12));
    from = monday(periodFrom); to = add(monday(periodTo), 6);
    title = `${MONTH[anchor.getUTCMonth()]} ${anchor.getUTCFullYear()}`;
    prev = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 1, 1, 12));
    next = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1, 12));
  }

  const sb = db();
  const [{ data }, { data: themes }] = await Promise.all([
    sb.from("calendar_items")
      .select("id, brand_id, date, publish_at, kind, format, pillar, title, flag, status, creatives(placement, status, slides, copy, published_at)")
      .gte("date", iso(from)).lte("date", iso(to)).in("brand_id", ids).neq("status", "cancelled").order("date"),
    sb.from("week_themes").select("*").gte("week_start", iso(monday(from))).lte("week_start", iso(to)).in("brand_id", ids),
  ]);
  const items = (data ?? []) as Item[];

  // One thumbnail per item for month/week; every slide for the day view.
  const paths = items.flatMap((i) => view === "day"
    ? i.creatives.flatMap((c) => c.slides.map((s) => s.image_path ?? ""))
    : [thumbPath(i)]);
  const urls = await signedUrls(paths.filter(Boolean) as string[]).catch(() => new Map<string, string>());

  const brandById = new Map(brands.map((b) => [b.id, b]));
  const href = (p: { view?: View; date?: Date; brand?: string }) => {
    const q = new URLSearchParams({ view: p.view ?? view, date: iso(p.date ?? anchor) });
    const b = p.brand ?? brand;
    if (b !== "all") q.set("brand", b);
    return `/?${q}`;
  };

  // Summary: per business, counts by status for the period.
  const inPeriod = items.filter((i) => i.date >= iso(periodFrom) && i.date <= iso(periodTo) && VISUAL.includes(i.kind));
  const summary = ids.map((id) => ({
    id,
    counts: Object.fromEntries(ORDER.map((s) => [s, inPeriod.filter((i) => i.brand_id === id && i.status === s).length])) as Record<Status, number>,
  }));

  return (
    <main className="wrap">
      <header style={{ display: "grid", gap: 14 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <span className="k">{brand === "all" ? "All businesses" : brandById.get(brand)?.name}</span>
            <h1>{title}</h1>
          </div>
          <Link className="btn primary" href={`/items/new?date=${iso(view === "day" ? anchor : today)}${brand !== "all" ? `&brand=${brand}` : ""}`}>+ New item</Link>
        </div>

        <nav className="row" aria-label="Business">
          <div className="seg">
            <Link href={href({ brand: "all" })} aria-current={brand === "all" ? "page" : undefined}>All</Link>
            {brands.map((b) => (
              <Link key={b.id} href={href({ brand: b.id })} aria-current={brand === b.id ? "page" : undefined} className={`b-${b.id}`}>
                <span className="dot b" />{b.name.replace(/ (Mountain Guides|Snowboarding)$/, "")}
              </Link>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          <div className="seg" aria-label="View">
            {(["month", "week", "day"] as View[]).map((v) => (
              <Link key={v} href={href({ view: v })} aria-current={view === v ? "page" : undefined}>{v[0].toUpperCase() + v.slice(1)}</Link>
            ))}
          </div>
          <div className="seg">
            <Link href={href({ date: prev })} aria-label="Previous">←</Link>
            <Link href={href({ date: today })}>Today</Link>
            <Link href={href({ date: next })} aria-label="Next">→</Link>
          </div>
        </nav>

        <div className="summary">
          {summary.map((s) => (
            <div key={s.id} className={`sum b-${s.id}`}>
              <span className="row" style={{ gap: 6 }}><span className="dot b" /><b>{brandById.get(s.id)?.name}</b></span>
              <span className="counts">
                {ORDER.map((st) => <span key={st}><span className={`pip ${st}`} />{s.counts[st]} {STATUS[st].toLowerCase()}</span>)}
              </span>
            </div>
          ))}
        </div>
      </header>

      {view === "month" && <MonthView {...{ items, from, to, periodFrom, today, urls, brandById, href }} />}
      {view === "week" && <WeekView {...{ items, from, today, urls, brandById, href, themes: themes ?? [] }} />}
      {view === "day" && <DayView {...{ items, urls, brandById, href }} />}

      <p className="legend">
        {ORDER.map((s) => <span key={s}><span className={`pip ${s}`} />{STATUS[s]}</span>)}
        <span className="muted">Posted = live on Meta · Scheduled = approved, goes out automatically · In review = drafts waiting for approval</span>
      </p>
    </main>
  );
}

function thumbPath(i: Item) {
  const c = i.creatives.find((x) => x.placement === "feed") ?? i.creatives.find((x) => x.placement === "ad") ?? i.creatives[0];
  return c?.slides?.[0]?.image_path ?? "";
}

function timeLabel(i: Item, brand?: Brand) {
  const posted = i.creatives.map((c) => c.published_at).filter(Boolean).sort()[0];
  const ts = posted ?? i.publish_at;
  const tz = brand?.kit.timezone ?? "America/Vancouver";
  if (ts) return new Date(ts).toLocaleTimeString("en-CA", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  return brand?.kit.defaultPublishTime ?? "";
}

function what(i: Item) {
  if (!VISUAL.includes(i.kind)) return i.kind;
  const f = i.format === "carousel" ? "carousel" : i.format === "reel" ? "reel" : i.kind === "story" || i.format === "story" ? "story" : i.kind === "ad" ? "ad" : "post";
  return i.creatives.some((c) => c.placement === "ad") && f !== "ad" ? `${f} + ad` : f;
}

type Href = (p: { view?: View; date?: Date; brand?: string }) => string;

function Chip({ i, brandById, compact }: { i: Item; brandById: Map<string, Brand>; compact?: boolean }) {
  const visual = VISUAL.includes(i.kind);
  return (
    <Link href={`/items/${i.id}`} className={`chip-item b-${i.brand_id} ${visual ? "" : "nonvisual"}`} title={`${brandById.get(i.brand_id)?.name}: ${i.title} (${STATUS[i.status]})`}>
      <span className={`pip ${i.status}`} />
      <span className="ct">{i.title}</span>
      {!compact && i.flag && <span className="flag" aria-label="Needs something">●</span>}
    </Link>
  );
}

function MonthView({ items, from, to, periodFrom, today, urls, brandById, href }: {
  items: Item[]; from: Date; to: Date; periodFrom: Date; today: Date; urls: Map<string, string>; brandById: Map<string, Brand>; href: Href;
}) {
  const days: Date[] = [];
  for (let d = from; d <= to; d = add(d, 1)) days.push(d);
  return (
    <section className="month" aria-label="Month">
      {DAY.map((d) => <div key={d} className="dow k">{d}</div>)}
      {days.map((d) => {
        const k = iso(d);
        const its = items.filter((i) => i.date === k);
        const out = d.getUTCMonth() !== periodFrom.getUTCMonth();
        return (
          <div key={k} className={`mcell ${out ? "out" : ""} ${k === iso(today) ? "today" : ""} ${its.length ? "" : "empty"}`}>
            <Link href={href({ view: "day", date: d })} className="num">{DAY[(d.getUTCDay() + 6) % 7]} {d.getUTCDate()}</Link>
            {its.map((i) => <Chip key={i.id} i={i} brandById={brandById} compact />)}
          </div>
        );
      })}
    </section>
  );
}

function WeekView({ items, from, today, urls, brandById, href, themes }: {
  items: Item[]; from: Date; today: Date; urls: Map<string, string>; brandById: Map<string, Brand>; href: Href;
  themes: { brand_id: string; week_start: string; theme: string; goal: string | null }[];
}) {
  const wkThemes = themes.filter((t) => t.week_start === iso(from));
  return (
    <section style={{ display: "grid", gap: 10 }} aria-label="Week">
      {wkThemes.length > 0 && (
        <div className="row">
          {wkThemes.map((t) => <span key={t.brand_id} className={`b-${t.brand_id}`}><span className="dot b" /> <b>{t.theme}</b>{t.goal ? <span className="muted"> · {t.goal}</span> : null}</span>)}
        </div>
      )}
      <div className="weekgrid">
        {Array.from({ length: 7 }, (_, n) => {
          const d = add(from, n), k = iso(d);
          const its = items.filter((i) => i.date === k);
          return (
            <div key={k} className={`wcol ${k === iso(today) ? "today" : ""} ${k < iso(today) ? "past" : ""} ${its.length ? "" : "empty"}`}>
              <Link href={href({ view: "day", date: d })} className="num">{DAY[n]} {MON[d.getUTCMonth()]} {d.getUTCDate()}</Link>
              {its.map((i) => {
                const b = brandById.get(i.brand_id);
                const u = urls.get(thumbPath(i));
                const visual = VISUAL.includes(i.kind);
                return (
                  <Link key={i.id} href={`/items/${i.id}`} className={`wcard b-${i.brand_id} ${visual ? "" : "nonvisual"}`}>
                    {visual && (u ? <img src={u} alt="" /> : <span className="ph">{i.format === "reel" ? "Reel" : "No design yet"}</span>)}
                    <span className="m">{b?.name.replace(/ (Mountain Guides|Snowboarding)$/, "")} · {what(i)}{visual ? ` · ${timeLabel(i, b)}` : ""}</span>
                    <span className="t">{i.title}</span>
                    <span className="row" style={{ gap: 6 }}><span className={`status ${i.status}`}>{STATUS[i.status]}</span>{i.flag && <span className="flag" title={i.flag}>● needs info</span>}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DayView({ items, urls, brandById, href }: { items: Item[]; urls: Map<string, string>; brandById: Map<string, Brand>; href: Href }) {
  if (!items.length) return <div className="card"><p className="muted" style={{ margin: 0 }}>Nothing on the calendar for this day.</p></div>;
  const sorted = [...items].sort((a, b) => timeLabel(a, brandById.get(a.brand_id)).localeCompare(timeLabel(b, brandById.get(b.brand_id))));
  const PL: Record<string, string> = { feed: "Feed", story: "Story", ad: "Ad" };
  return (
    <section style={{ display: "grid", gap: 14 }} aria-label="Day">
      {sorted.map((i) => {
        const b = brandById.get(i.brand_id);
        const visual = VISUAL.includes(i.kind);
        const caption = i.creatives.find((c) => c.placement === "feed")?.copy?.caption;
        return (
          <article key={i.id} className={`card dcard b-${i.brand_id}`}>
            <div className="row">
              <span className="dot b" /><span className="k">{b?.name} · {what(i)}{visual ? ` · ${timeLabel(i, b)}` : ""}{i.pillar ? ` · ${i.pillar}` : ""}</span>
              <span className={`status ${i.status}`}>{STATUS[i.status]}</span>
            </div>
            <Link href={`/items/${i.id}`}><h2>{i.title}</h2></Link>
            {i.flag && <div className="flag">● {i.flag}</div>}
            {i.creatives.filter((c) => c.status !== "rejected").map((c, n) => (
              <div key={n} style={{ display: "grid", gap: 6 }}>
                <span className="k">{PL[c.placement] ?? c.placement} · <span className={`status ${c.status}`}>{c.status === "published" ? (c.placement === "ad" ? "Ad created (paused)" : "Posted") : c.status}</span></span>
                <div className={`slides ${c.placement === "story" ? "story" : ""}`} style={{ maxWidth: "100%" }}>
                  {c.slides.map((s, k) => s.image_path && urls.get(s.image_path) ? <img key={k} src={urls.get(s.image_path)} alt="" style={{ height: c.placement === "story" ? 260 : 220 }} /> : null)}
                </div>
              </div>
            ))}
            {caption && <p className="muted" style={{ margin: 0, whiteSpace: "pre-line" }}>{caption.length > 280 ? `${caption.slice(0, 280)}…` : caption}</p>}
            {visual && !i.creatives.length && <p className="muted" style={{ margin: 0 }}>{i.format === "reel" ? "Reel (video, made outside Brand Studio)." : "No design yet. Open it to add photos and generate."}</p>}
            <div className="row"><Link className="btn" href={`/items/${i.id}`}>Open</Link></div>
          </article>
        );
      })}
    </section>
  );
}
