"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/supabase-browser";

type Item = Record<string, unknown> & { id?: string };

export function ItemForm({ item, brands }: { item: Item; brands: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = Object.fromEntries(f.entries());
    body.channels = f.getAll("channels");
    setBusy(true); setErr("");
    try {
      if (item.id) { await api(`/api/items/${item.id}`, "PATCH", body); router.refresh(); }
      else { const r = await api<{ id: string }>("/api/items", "POST", body); router.push(`/items/${r.id}`); }
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const v = (k: string) => (item[k] as string | null) ?? "";
  const channels = (item.channels as string[] | undefined) ?? ["instagram", "facebook"];
  return (
    <form onSubmit={save} style={{ display: "grid", gap: 10 }}>
      <div className="row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label>Brand<select name="brand_id" defaultValue={v("brand_id") || brands[0]?.id}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label>Date<input type="date" name="date" required defaultValue={v("date")} /></label>
        <label>Kind<select name="kind" defaultValue={v("kind") || "post"}>{["post", "story", "ad", "event", "email", "film"].map((k) => <option key={k}>{k}</option>)}</select></label>
        <label>Format<select name="format" defaultValue={v("format") || "single"}>{["single", "carousel", "story", "reel", "none"].map((k) => <option key={k}>{k}</option>)}</select></label>
      </div>
      <label>Title<input name="title" required defaultValue={v("title")} /></label>
      <label>Pillar<input name="pillar" placeholder="Trip Feature, Skills Tip, Inspiration…" defaultValue={v("pillar")} /></label>
      <label>Brief (key message, dates, prices, offer: Claude only uses facts written here)<textarea name="brief" defaultValue={v("brief")} /></label>
      <label>Link URL<input name="link_url" type="url" defaultValue={v("link_url")} /></label>
      <div className="row">
        <label className="row" style={{ display: "flex" }}><input type="checkbox" name="channels" value="instagram" defaultChecked={channels.includes("instagram")} style={{ width: "auto" }} />Instagram</label>
        <label className="row" style={{ display: "flex" }}><input type="checkbox" name="channels" value="facebook" defaultChecked={channels.includes("facebook")} style={{ width: "auto" }} />Facebook</label>
      </div>
      <label>Paid: ad set id (adds a paused ad; blank uses the brand default when kind is “ad”)<input name="ad_set_id" defaultValue={v("ad_set_id")} /></label>
      <label>Publish at (blank = the brand’s default time on the date)<input type="datetime-local" name="publish_at" defaultValue={v("publish_at")?.slice(0, 16)} /></label>
      <label>Flag (shown on the calendar)<input name="flag" defaultValue={v("flag")} /></label>
      <div className="row"><button className="primary" disabled={busy}>{item.id ? "Save" : "Create"}</button>{err && <pre className="err">{err}</pre>}</div>
    </form>
  );
}
