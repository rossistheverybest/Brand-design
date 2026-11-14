"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Brand } from "@/lib/brand";
import { api, uploadFile } from "@/lib/supabase-browser";

export function BrandEditor({ brand, fonts }: { brand: Brand & { logoUrl: string | null }; fonts: string[] }) {
  const router = useRouter();
  const [kit, setKit] = useState(brand.kit);
  const [meta, setMeta] = useState(brand.meta);
  const [msg, setMsg] = useState("");
  const set = <K extends keyof typeof kit>(k: K, v: (typeof kit)[K]) => setKit({ ...kit, [k]: v });

  async function save() {
    setMsg("Saving…");
    try { await api(`/api/brands/${brand.id}`, "PATCH", { kit, meta, name: brand.name }); setMsg("Saved"); router.refresh(); }
    catch (e) { setMsg((e as Error).message); }
  }
  async function logo(file: File) {
    setMsg("Uploading logo…");
    const path = await uploadFile(file, "brand-assets");
    const next = { ...kit, logo: { ...kit.logo, light: path } };
    setKit(next);
    await api(`/api/brands/${brand.id}`, "PATCH", { kit: next, meta, name: brand.name });
    setMsg("Logo saved"); router.refresh();
  }

  return (
    <section className={`card b-${brand.id}`}>
      <div className="row"><span className="dot b" /><h2>{brand.name}</h2></div>
      <div className="grid2">
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <fieldset>
            <legend>Colours</legend>
            <div className="row">
              {(Object.keys(kit.colors) as (keyof typeof kit.colors)[]).map((k) => (
                <label key={k}>{k}<input className="swatch" type="color" value={kit.colors[k]} onChange={(e) => set("colors", { ...kit.colors, [k]: e.target.value })} /></label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Type</legend>
            <label>Headline font<select value={kit.fonts.display.family} onChange={(e) => set("fonts", { ...kit.fonts, display: { ...kit.fonts.display, family: e.target.value } })}>{fonts.map((f) => <option key={f}>{f}</option>)}</select></label>
            <label>Body font<select value={kit.fonts.body.family} onChange={(e) => set("fonts", { ...kit.fonts, body: { ...kit.fonts.body, family: e.target.value } })}>{fonts.map((f) => <option key={f}>{f}</option>)}</select></label>
            <label>Headline case<select value={kit.headlineCase} onChange={(e) => set("headlineCase", e.target.value as "upper" | "none")}><option value="upper">UPPERCASE</option><option value="none">As written</option></select></label>
          </fieldset>
          <fieldset>
            <legend>Logo (white / light PNG with transparency)</legend>
            {brand.logoUrl ? <img src={brand.logoUrl} alt="" style={{ height: 48, width: "auto", background: kit.colors.primary, padding: 8, borderRadius: 4 }} /> : <span className="muted">None yet. Templates show the brand name instead.</span>}
            <input type="file" accept="image/png" onChange={(e) => e.target.files?.[0] && logo(e.target.files[0])} />
          </fieldset>
          <fieldset>
            <legend>Meta accounts</legend>
            <label>Facebook Page id<input value={meta.pageId ?? ""} onChange={(e) => setMeta({ ...meta, pageId: e.target.value.trim() })} /></label>
            <label>Instagram account id (IG user id, not the handle)<input value={meta.igUserId ?? ""} onChange={(e) => setMeta({ ...meta, igUserId: e.target.value.trim() })} /></label>
            <label>Ad account id (numbers only)<input value={meta.adAccountId ?? ""} onChange={(e) => setMeta({ ...meta, adAccountId: e.target.value.trim().replace(/^act_/, "") })} /></label>
            <label>Default ad set id<input value={meta.defaultAdSetId ?? ""} onChange={(e) => setMeta({ ...meta, defaultAdSetId: e.target.value.trim() })} /></label>
          </fieldset>
        </div>
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <label>Voice<textarea rows={4} value={kit.voice} onChange={(e) => set("voice", e.target.value)} /></label>
          <label>Hard rules (one per line)<textarea rows={6} value={kit.rules.join("\n")} onChange={(e) => set("rules", e.target.value.split("\n").filter((x) => x.trim()))} /></label>
          <label>Hashtags<input value={kit.hashtags.join(" ")} onChange={(e) => set("hashtags", e.target.value.split(/\s+/).filter(Boolean))} /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label>Handle<input value={kit.handle} onChange={(e) => set("handle", e.target.value)} /></label>
            <label>Website<input value={kit.website} onChange={(e) => set("website", e.target.value)} /></label>
            <label>Default publish time<input type="time" value={kit.defaultPublishTime} onChange={(e) => set("defaultPublishTime", e.target.value)} /></label>
            <label>Time zone<input value={kit.timezone} onChange={(e) => set("timezone", e.target.value)} /></label>
          </div>
        </div>
      </div>
      <div className="row"><button className="primary" onClick={save}>Save {brand.name}</button><span className="muted">{msg}</span></div>
    </section>
  );
}
