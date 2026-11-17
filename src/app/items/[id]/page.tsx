import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db, getBrand, signedUrl } from "@/lib/db";
import type { CreativeRecord } from "@/lib/generate";
import { Workspace } from "@/components/Workspace";
import { ItemForm } from "@/components/ItemForm";
import { listBrands } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const sb = db();
  const { data: item } = await sb.from("calendar_items").select("*").eq("id", id).maybeSingle();
  if (!item) notFound();
  const [brand, brands, { data: photos }, { data: creatives }, { data: activity }] = await Promise.all([
    getBrand(item.brand_id),
    listBrands(),
    sb.from("photos").select("*").eq("item_id", id).order("created_at"),
    sb.from("creatives").select("*").eq("item_id", id).order("placement"),
    sb.from("activity").select("*").eq("item_id", id).order("created_at", { ascending: false }).limit(15),
  ]);

  const photoViews = await Promise.all((photos ?? []).map(async (p) => ({
    id: p.id as string, credit: p.credit as string | null, url: await signedUrl(p.storage_path, 3600),
    width: p.width as number | null, height: p.height as number | null,
    storyUrl: p.story_variant_path ? await signedUrl(p.story_variant_path, 3600) : null, storyAi: !!p.story_variant_ai,
    warnings: (p.analysis?.warnings ?? []) as string[], subject: p.analysis?.subject as string | undefined,
  })));
  const creativeViews = await Promise.all(((creatives ?? []) as (CreativeRecord & { meta_result: Record<string, unknown> | null })[]).map(async (c) => ({
    ...c,
    urls: await Promise.all(c.slides.map((s) => (s.image_path ? signedUrl(s.image_path, 3600) : ""))),
  })));

  return (
    <main className="wrap">
      <header style={{ display: "grid", gap: 8 }}>
        <Link href={`/?view=week&date=${item.date}`} className="k">← Calendar</Link>
        <div className={`row b-${brand.id}`}>
          <span className="dot b" /><span className="k">{brand.name} · {item.date} · {item.kind}{item.pillar ? ` · ${item.pillar}` : ""}</span>
          <span className={`status ${item.status}`}>{item.status}</span>
        </div>
        <h1>{item.title}</h1>
        {item.flag && <div className="flag">● {item.flag}</div>}
      </header>
      <div className="grid2">
        <div style={{ display: "grid", gap: 24, alignContent: "start" }}>
          <details className="card" open={!item.brief}>
            <summary>Brief and settings</summary>
            <ItemForm item={{ ...item, publish_at: item.publish_at ? localTime(item.publish_at, brand.kit.timezone) : null }} brands={brands.map((b) => ({ id: b.id, name: b.name }))} />
          </details>
          <details className="card">
            <summary>Activity</summary>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {(activity ?? []).map((a) => <li key={a.id}><span className="muted">{new Date(a.created_at).toLocaleString("en-CA", { timeZone: brand.kit.timezone })}</span> · {a.action}{a.actor ? ` · ${a.actor}` : ""}{a.detail?.message ? ` · ${a.detail.message}` : ""}</li>)}
            </ul>
          </details>
        </div>
        <Workspace
          itemId={id}
          kind={item.kind}
          format={item.format}
          allowAiImages={brand.kit.allowAiImages !== false}
          reviewNotes={item.review_notes ?? []}
          photos={photoViews}
          creatives={creativeViews}
          adReady={!!(brand.meta.adAccountId && (item.ad_set_id || brand.meta.defaultAdSetId))}
        />
      </div>
    </main>
  );
}

/** UTC timestamp -> "YYYY-MM-DDTHH:MM" in the brand's zone, for datetime-local inputs. */
function localTime(ts: string, timeZone: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
