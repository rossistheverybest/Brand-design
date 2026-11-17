"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api, runJob, uploadFile } from "@/lib/supabase-browser";

interface PhotoView {
  id: string; url: string; credit: string | null; warnings: string[]; subject?: string;
  width: number | null; height: number | null; storyUrl: string | null; storyAi: boolean;
}
interface Overlay { eyebrow?: string; headline?: string; body?: string; cta?: string }
interface Slide { photo_id: string | null; layout: string; overlay: Overlay; aspect: string; image_path?: string }
interface CreativeView {
  id: string; placement: string; status: string; slides: Slide[]; urls: string[];
  copy: Record<string, unknown>; meta_result: Record<string, unknown> | null;
}

const LAYOUTS = ["overlay", "band", "minimal", "endcard"];
const LABEL: Record<string, string> = { feed: "Feed post", story: "Story", ad: "Paid ad (feed 4:5 + story 9:16)" };

export function Workspace(props: {
  itemId: string; kind: string; format: string; reviewNotes: string[]; allowAiImages: boolean;
  photos: PhotoView[]; creatives: CreativeView[]; adReady: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [over, setOver] = useState(false);
  const [credit, setCredit] = useState("");
  const [direction, setDirection] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const visual = ["post", "story", "ad", "event"].includes(props.kind);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label); setErr("");
    try { await fn(); router.refresh(); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }

  async function addFiles(files: FileList | File[]) {
    await run("upload", async () => {
      for (const f of Array.from(files)) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) throw new Error(`${f.name}: use JPEG, PNG or WebP (export HEIC photos as JPEG first).`);
        const path = await uploadFile(f, "uploads");
        await api(`/api/items/${props.itemId}/photos`, "POST", { path, credit });
      }
    });
  }

  if (props.format === "reel" && props.kind !== "ad") {
    return <div className="card"><p className="muted">Reels are video, and Brand Studio makes images for now. Change the format to single, carousel or story to design an image version.</p></div>;
  }
  if (!visual) {
    return <div className="card"><p className="muted">This is a {props.kind} item, so there’s nothing to design here. It stays on the calendar as a reminder.</p></div>;
  }

  return (
    <div style={{ display: "grid", gap: 20, alignContent: "start" }}>
      <section className="card">
        <h2>Photos</h2>
        <div
          className={`drop ${over ? "over" : ""}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
          role="button" tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
        >
          {busy === "upload" ? "Uploading…" : "Drop photos here or click to choose"}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
        </div>
        <label>Photographer credit for the next upload (optional, e.g. @guyfattal)<input value={credit} onChange={(e) => setCredit(e.target.value)} /></label>
        {props.photos.length > 0 && (
          <div className="photos">
            {props.photos.map((p) => (
              <div key={p.id} className="photo">
                <img src={p.url} alt={p.subject ?? ""} />
                {p.credit && <span className="muted">Photo: {p.credit}</span>}
                {p.warnings.map((w) => <span key={w} className="flag">● {w}</span>)}
                {p.storyUrl ? (
                  <span className="row" style={{ gap: 6 }}>
                    <a href={p.storyUrl} target="_blank" rel="noreferrer"><img src={p.storyUrl} alt="Story version" style={{ width: 36, aspectRatio: "9 / 16", objectFit: "cover", borderRadius: 3 }} /></a>
                    <span className="aibadge" title="Top and bottom were extended with AI; the middle is the real photo.">AI-extended for stories</span>
                    <button style={{ padding: "2px 8px" }} disabled={!!busy} onClick={() => run("undo-ext", () => api(`/api/photos/${p.id}/extend`, "DELETE"))}>Undo</button>
                  </span>
                ) : props.allowAiImages && p.width && p.height && p.width / p.height > 0.6 ? (
                  <button style={{ justifySelf: "start", padding: "2px 10px" }} disabled={!!busy}
                    title="Uses AI to extend the sky and snow above and below this photo so stories show the whole shot instead of a tight crop. You approve the result like everything else."
                    onClick={() => run(`ext-${p.id}`, () => runJob(`/api/photos/${p.id}/extend`, "POST"))}>
                    {busy === `ext-${p.id}` ? "Extending…" : "Extend for stories (AI)"}
                  </button>
                ) : null}
                <button className="danger" style={{ justifySelf: "start", padding: "2px 10px" }} onClick={() => run("rm", () => api(`/api/photos/${p.id}`, "DELETE"))}>Remove</button>
              </div>
            ))}
          </div>
        )}
        <label>Direction for Claude (optional): “use the summit shot as the cover”, “make it a 5-slide carousel”<input value={direction} onChange={(e) => setDirection(e.target.value)} /></label>
        <div className="row">
          <button className="primary" disabled={!!busy || !props.photos.length} onClick={() => run("gen", () => runJob(`/api/items/${props.itemId}/generate`, "POST", { direction }))}>
            {busy === "gen" ? "Designing… (up to a minute)" : props.creatives.length ? "Regenerate drafts" : "Generate"}
          </button>
          {props.creatives.length > 0 && <span className="muted" style={{ fontSize: 13 }}>Regenerating replaces drafts only. Approved and published creatives stay. Your past edits and rejections are taken into account.</span>}
        </div>
        {err && <pre className="err">{err}</pre>}
      </section>

      {props.reviewNotes.length > 0 && (
        <div className="notes"><b>Check before approving</b><ul>{props.reviewNotes.map((n) => <li key={n}>{n}</li>)}</ul></div>
      )}

      {props.creatives.map((c) => <CreativeCard key={c.id} c={c} photos={props.photos} busy={busy} run={run} adReady={props.adReady} />)}
    </div>
  );
}

function CreativeCard({ c, photos, busy, run, adReady }: {
  c: CreativeView; photos: PhotoView[]; busy: string | null; adReady: boolean;
  run: (label: string, fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [slides, setSlides] = useState<Slide[]>(c.slides);
  const [copy, setCopy] = useState<Record<string, unknown>>(c.copy);
  const [editing, setEditing] = useState(false);
  const editable = c.placement === "ad" ? slides.slice(0, 1) : slides;
  const locked = c.status === "published";
  const err = (c.meta_result as { error?: { message?: string } } | null)?.error?.message;

  const setOverlay = (i: number, k: keyof Overlay, v: string) =>
    setSlides((s) => s.map((x, j) => (j === i ? { ...x, overlay: { ...x.overlay, [k]: v || undefined } } : x)));
  const setSlide = (i: number, patch: Partial<Slide>) => setSlides((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <section className="card">
      <div className="row">
        <h3>{LABEL[c.placement] ?? c.placement}</h3>
        <span className={`status ${c.status}`}>{c.status}</span>
        {c.placement === "feed" && slides.length > 1 && <span className="k">{slides.length} slides</span>}
      </div>

      <div className={`slides ${c.placement === "story" ? "story" : ""}`}>
        {c.urls.map((u, i) => (
          <figure key={i}>
            {u && <a href={u} target="_blank" rel="noreferrer"><img src={u} alt={`${c.placement} ${i + 1}`} /></a>}
            <figcaption className="k">{slides[i]?.aspect} · {slides[i]?.layout}</figcaption>
          </figure>
        ))}
      </div>

      {c.placement === "feed" && (
        <label>Caption<textarea rows={6} disabled={locked} value={String(copy.caption ?? "")} onChange={(e) => setCopy({ ...copy, caption: e.target.value })} /></label>
      )}
      {c.placement === "feed" && (
        <label>Hashtags<input disabled={locked} value={((copy.hashtags as string[]) ?? []).join(" ")} onChange={(e) => setCopy({ ...copy, hashtags: e.target.value.split(/\s+/).filter(Boolean) })} /></label>
      )}
      {c.placement === "ad" && (
        <div style={{ display: "grid", gap: 8 }}>
          <label>Primary text ({String(copy.primary_text ?? "").length}/125 before “more”)<textarea disabled={locked} value={String(copy.primary_text ?? "")} onChange={(e) => setCopy({ ...copy, primary_text: e.target.value })} /></label>
          <label>Headline ({String(copy.headline ?? "").length}/40)<input disabled={locked} maxLength={40} value={String(copy.headline ?? "")} onChange={(e) => setCopy({ ...copy, headline: e.target.value })} /></label>
          <label>Description ({String(copy.description ?? "").length}/30)<input disabled={locked} maxLength={30} value={String(copy.description ?? "")} onChange={(e) => setCopy({ ...copy, description: e.target.value })} /></label>
          <label>Button<select disabled={locked} value={String(copy.cta)} onChange={(e) => setCopy({ ...copy, cta: e.target.value })}>
            {["LEARN_MORE", "BOOK_TRAVEL", "SIGN_UP", "SHOP_NOW", "CONTACT_US", "GET_OFFER", "SUBSCRIBE"].map((x) => <option key={x}>{x}</option>)}
          </select></label>
          <label>Link<input disabled={locked} value={String(copy.link_url ?? "")} onChange={(e) => setCopy({ ...copy, link_url: e.target.value })} /></label>
        </div>
      )}

      {!locked && (
        <details open={editing} onToggle={(e) => setEditing((e.target as HTMLDetailsElement).open)}>
          <summary>Edit on-image text and layout</summary>
          <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
            {editable.map((s, i) => (
              <fieldset key={i}>
                <legend>{c.placement === "ad" ? "Ad image" : `Slide ${i + 1}`}</legend>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <label>Layout<select value={s.layout} onChange={(e) => setSlide(i, { layout: e.target.value })}>{LAYOUTS.map((l) => <option key={l}>{l}</option>)}</select></label>
                  <label>Photo<select value={s.photo_id ?? ""} onChange={(e) => setSlide(i, { photo_id: e.target.value || null })}>
                    <option value="">(none)</option>
                    {photos.map((p, n) => <option key={p.id} value={p.id}>Photo {n + 1}{p.subject ? `: ${p.subject.slice(0, 40)}` : ""}</option>)}
                  </select></label>
                </div>
                {(["eyebrow", "headline", "body", "cta"] as const).map((k) => (
                  <label key={k}>{k}<input value={s.overlay[k] ?? ""} onChange={(e) => setOverlay(i, k, e.target.value)} /></label>
                ))}
              </fieldset>
            ))}
          </div>
        </details>
      )}

      {err && <pre className="err">Meta: {err}</pre>}
      {locked && c.meta_result && <p className="muted" style={{ fontSize: 13 }}>{c.placement === "ad" ? "Paused ad created. Turn it on in Ads Manager." : "Published."} {Object.entries(c.meta_result).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(" · ")}</p>}

      {!locked && (
        <div className="row">
          <button disabled={!!busy} onClick={() => run(`save-${c.id}`, () => runJob(`/api/creatives/${c.id}`, "PATCH", editing ? { slides, copy } : { copy }))}>
            {busy === `save-${c.id}` ? "Saving…" : editing ? "Save and re-render" : "Save copy"}
          </button>
          {c.status !== "approved"
            ? <button className="ok" disabled={!!busy} onClick={() => run(`ap-${c.id}`, () => api(`/api/creatives/${c.id}/review`, "POST", { decision: "approved" }))}>Approve</button>
            : <button disabled={!!busy} onClick={() => run(`un-${c.id}`, () => api(`/api/creatives/${c.id}/review`, "POST", { decision: "draft" }))}>Unapprove</button>}
          {c.status === "draft" && <button className="danger" disabled={!!busy} onClick={() => {
            const reason = prompt("Why are you rejecting this? (One line. It helps future drafts.)");
            if (reason === null) return;
            run(`rj-${c.id}`, () => api(`/api/creatives/${c.id}/review`, "POST", { decision: "rejected", reason }));
          }}>Reject</button>}
          {c.status === "approved" && (
            <button className="primary" disabled={!!busy || (c.placement === "ad" && !adReady)}
              title={c.placement === "ad" && !adReady ? "Set an ad set on this item or a default for the brand" : undefined}
              onClick={() => confirm(c.placement === "ad" ? "Create this ad (paused) in Ads Manager?" : "Publish to Meta now?") && run(`pub-${c.id}`, () => runJob(`/api/creatives/${c.id}/publish`, "POST"))}>
              {busy === `pub-${c.id}` ? "Sending to Meta…" : c.placement === "ad" ? "Create paused ad" : "Publish now"}
            </button>
          )}
          {c.status === "approved" && c.placement !== "ad" && <span className="muted" style={{ fontSize: 13 }}>Otherwise it publishes automatically on its date.</span>}
        </div>
      )}
    </section>
  );
}
