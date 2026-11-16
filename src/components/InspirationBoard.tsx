"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api, runJob, uploadFile } from "@/lib/supabase-browser";

interface Trait { area: string; observation: string; how_to_apply: string }
interface Analysis { summary: string; traits: Trait[]; rule_ideas: string[]; closest_template: string | null; template_idea: { title: string; description: string } | null }
export interface Card {
  id: string; brand_id: string | null; source: "upload" | "instagram"; url: string | null; permalink: string | null;
  account: string | null; caption: string | null; note: string | null; status: string; created_at: string;
  engagement: { likes?: number | null; comments?: number | null; score?: number; format?: string } | null; analysis: Analysis | null;
}
export interface Watch { id: number; brand_id: string; username: string; followers: number | null; last_synced: string | null; last_error: string | null }
export interface Report { id: number; brand_id: string; summary: string; findings: { finding: string; evidence: string }[]; template_ideas: { title: string; description: string }[]; post_ids: string[]; created_at: string }
export interface TemplateReq { id: number; brand_id: string | null; title: string; description: string; status: string; created_at: string }

type Brands = { id: string; name: string }[];

export function InspirationBoard({ brands, current, cards, watch, reports, requests }: {
  brands: Brands; current: string; cards: Card[]; watch: Watch[]; reports: Report[]; requests: TemplateReq[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const name = (id: string | null) => (id ? brands.find((b) => b.id === id)?.name ?? id : "All businesses");

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label); setErr("");
    try { await fn(); router.refresh(); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  const requestTemplate = (t: { title: string; description: string }, brand_id: string | null, ids: string[]) =>
    run(`tr-${t.title}`, () => api("/api/template-requests", "POST", { ...t, brand_id, inspiration_ids: ids }));

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {err && <pre className="err">{err}</pre>}
      <div className="grid2">
        <Upload brands={brands} current={current} busy={busy} run={run} />
        <WatchList brands={brands} current={current} watch={watch} busy={busy} run={run} />
      </div>

      {reports.map((r) => (
        <section key={r.id} className={`card b-${r.brand_id}`} style={{ borderLeft: "4px solid var(--b)" }}>
          <div className="row"><span className="dot b" /><span className="k">{name(r.brand_id)} · What&apos;s working · {new Date(r.created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}</span></div>
          <p style={{ margin: 0 }}>{r.summary}</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{r.findings.map((f, i) => <li key={i}><b>{f.finding}</b> <span className="muted">({f.evidence})</span></li>)}</ul>
          {r.template_ideas.map((t) => (
            <div key={t.title} className="sugg">
              <span className="k">Template idea</span><b>{t.title}</b><span className="muted" style={{ fontSize: 13 }}>{t.description}</span>
              <button style={{ justifySelf: "start" }} disabled={!!busy} onClick={() => requestTemplate(t, r.brand_id, r.post_ids)}>Request this template</button>
            </div>
          ))}
          <span className="muted" style={{ fontSize: 13 }}>Rule ideas from this report are waiting on the Brands page under &ldquo;Learning&rdquo;.</span>
        </section>
      ))}

      {requests.length > 0 && (
        <section className="card">
          <h3>Template requests</h3>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>New layouts are built in code so every post stays consistent. Mark one built once it&apos;s added.</p>
          {requests.map((r) => (
            <div key={r.id} className="sugg">
              <span className="k">{name(r.brand_id)} · {new Date(r.created_at).toLocaleDateString("en-CA")}</span>
              <b>{r.title}</b><span style={{ fontSize: 14 }}>{r.description}</span>
              <div className="row">
                <button disabled={!!busy} onClick={() => run(`b${r.id}`, () => api(`/api/template-requests/${r.id}`, "PATCH", { status: "built" }))}>Mark built</button>
                <button className="danger" disabled={!!busy} onClick={() => run(`d${r.id}`, () => api(`/api/template-requests/${r.id}`, "PATCH", { status: "declined" }))}>Decline</button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section style={{ display: "grid", gap: 12 }}>
        <h2>Board</h2>
        {!cards.length && <p className="muted">Nothing here yet. Upload a screenshot or add accounts to watch.</p>}
        <div className="board">
          {cards.map((c) => <InspoCard key={c.id} c={c} brands={brands} name={name} busy={busy} run={run} requestTemplate={requestTemplate} />)}
        </div>
      </section>
    </div>
  );
}

function Upload({ brands, current, busy, run }: { brands: Brands; current: string; busy: string | null; run: (l: string, f: () => Promise<unknown>) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [brand, setBrand] = useState(current === "all" ? "" : current);
  const [files, setFiles] = useState<File[]>([]);
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const add = (list: FileList | null) => list && setFiles([...files, ...Array.from(list).filter((f) => ["image/jpeg", "image/png", "image/webp"].includes(f.type))]);
  return (
    <section className="card">
      <h3>Add a screenshot</h3>
      <div className={`drop ${over ? "over" : ""}`} role="button" tabIndex={0} onClick={() => ref.current?.click()} onKeyDown={(e) => e.key === "Enter" && ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        onPaste={(e) => add(e.clipboardData.files)}>
        {files.length ? `${files.length} image${files.length > 1 ? "s" : ""} ready` : "Drop, paste or click to choose screenshots"}
        <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => add(e.target.files)} />
      </div>
      <label>What do you like about it?<textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. the huge thin headline over the photo, and how the price sits in a small corner tag" /></label>
      <label>For<select value={brand} onChange={(e) => setBrand(e.target.value)}><option value="">All businesses</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <button className="primary" style={{ justifySelf: "start" }} disabled={!!busy || !files.length}
        onClick={() => run("up", async () => {
          for (const f of files) {
            const path = await uploadFile(f, "inspiration");
            await runJob("/api/inspiration", "POST", { path, note, brand_id: brand || null });
          }
          setFiles([]); setNote("");
        })}>
        {busy === "up" ? "Analysing…" : "Save and analyse"}
      </button>
    </section>
  );
}

function WatchList({ brands, current, watch, busy, run }: { brands: Brands; current: string; watch: Watch[]; busy: string | null; run: (l: string, f: () => Promise<unknown>) => Promise<void> }) {
  const [u, setU] = useState("");
  const [brand, setBrand] = useState(current === "all" ? brands[0]?.id ?? "" : current);
  const byBrand = brands.filter((b) => current === "all" || b.id === current);
  return (
    <section className="card">
      <h3>Watch list</h3>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Instagram business or creator accounts. Every Monday the standout posts (high engagement for that account) are pulled in and summarised. Personal accounts can&apos;t be read.</p>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input value={u} onChange={(e) => setU(e.target.value)} placeholder="@username" aria-label="Instagram username" />
        <select value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="For business" style={{ width: "auto" }}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name.replace(/ (Mountain Guides|Snowboarding)$/, "")}</option>)}</select>
        <button disabled={!!busy || !u.trim()} onClick={() => run("watch", async () => { await api("/api/watch", "POST", { brand_id: brand, username: u }); setU(""); })}>Add</button>
      </div>
      {byBrand.map((b) => {
        const list = watch.filter((w) => w.brand_id === b.id);
        if (!list.length) return null;
        return (
          <div key={b.id} className={`b-${b.id}`} style={{ display: "grid", gap: 4 }}>
            <div className="row"><span className="dot b" /><b>{b.name}</b><span style={{ flex: 1 }} />
              <button disabled={!!busy} onClick={() => run(`sync-${b.id}`, () => runJob("/api/watch/sync", "POST", { brand_id: b.id }, 15 * 60_000))}>{busy === `sync-${b.id}` ? "Pulling posts…" : "Sync now"}</button>
            </div>
            {list.map((w) => (
              <div key={w.id} className="row" style={{ fontSize: 14 }}>
                <a href={`https://instagram.com/${w.username}`} target="_blank" rel="noreferrer">@{w.username}</a>
                {w.followers != null && <span className="muted">{w.followers.toLocaleString()} followers</span>}
                {w.last_error && <span className="flag" title={w.last_error}>● can&apos;t read</span>}
                <span style={{ flex: 1 }} />
                <button className="danger" style={{ padding: "2px 10px" }} disabled={!!busy} onClick={() => run(`rm${w.id}`, () => api(`/api/watch/${w.id}`, "DELETE"))}>Remove</button>
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}

function InspoCard({ c, brands, name, busy, run, requestTemplate }: {
  c: Card; brands: Brands; name: (id: string | null) => string; busy: string | null;
  run: (l: string, f: () => Promise<unknown>) => Promise<void>;
  requestTemplate: (t: { title: string; description: string }, brand: string | null, ids: string[]) => Promise<void>;
}) {
  const [note, setNote] = useState(c.note ?? "");
  const a = c.analysis;
  const e = c.engagement;
  return (
    <article className={`card inspo ${c.brand_id ? `b-${c.brand_id}` : ""}`}>
      {c.url && <a href={c.permalink ?? c.url} target="_blank" rel="noreferrer"><img src={c.url} alt="" /></a>}
      <span className="k">
        {c.source === "instagram" ? `@${c.account}` : "Screenshot"} · {name(c.brand_id)}
        {e?.score ? ` · ${e.score.toFixed(1)}× usual` : ""}{e?.likes != null ? ` · ${e.likes} likes` : ""}
      </span>
      <label>What you like<textarea rows={2} value={note} onChange={(ev) => setNote(ev.target.value)} onBlur={() => note !== (c.note ?? "") && run(`n${c.id}`, () => api(`/api/inspiration/${c.id}`, "PATCH", { note }))} /></label>
      {a ? (
        <>
          <p style={{ margin: 0 }}><b>{a.summary}</b></p>
          <ul className="traits">{a.traits.map((t, i) => <li key={i}><span className="k">{t.area}</span> {t.observation} <span className="muted">→ {t.how_to_apply}</span></li>)}</ul>
          {a.rule_ideas.map((r) => (
            <div key={r} className="row" style={{ gap: 6, alignItems: "flex-start" }}>
              <span style={{ flex: 1, fontSize: 14 }}>{r}</span>
              <button style={{ padding: "2px 10px" }} disabled={!!busy} onClick={() => run(`r${c.id}${r}`, () => api(`/api/inspiration/${c.id}/rule`, "POST", { rule: r, brand_id: c.brand_id }))}>
                Add to {c.brand_id ? "rules" : "all brands' rules"}
              </button>
            </div>
          ))}
          {a.closest_template && <span className="muted" style={{ fontSize: 13 }}>Closest existing template: {a.closest_template}</span>}
          {a.template_idea && (
            <div className="sugg">
              <span className="k">Needs a new template</span><b>{a.template_idea.title}</b><span className="muted" style={{ fontSize: 13 }}>{a.template_idea.description}</span>
              <button style={{ justifySelf: "start" }} disabled={!!busy} onClick={() => requestTemplate(a.template_idea!, c.brand_id, [c.id])}>Request this template</button>
            </div>
          )}
        </>
      ) : <span className="muted">Not analysed yet.</span>}
      <div className="row">
        <button disabled={!!busy} onClick={() => run(`an${c.id}`, () => runJob(`/api/inspiration/${c.id}/analyze`, "POST"))}>{busy === `an${c.id}` ? "Analysing…" : a ? "Re-analyse with my note" : "Analyse"}</button>
        <select aria-label="Business" value={c.brand_id ?? ""} onChange={(ev) => run(`b${c.id}`, () => api(`/api/inspiration/${c.id}`, "PATCH", { brand_id: ev.target.value || null }))} style={{ width: "auto" }}>
          <option value="">All businesses</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {c.status !== "kept" && <button className="ok" disabled={!!busy} onClick={() => run(`k${c.id}`, () => api(`/api/inspiration/${c.id}`, "PATCH", { status: "kept" }))}>Keep</button>}
        {c.status !== "archived"
          ? <button className="danger" disabled={!!busy} onClick={() => run(`x${c.id}`, () => api(`/api/inspiration/${c.id}`, "PATCH", { status: "archived" }))}>Archive</button>
          : <button disabled={!!busy} onClick={() => run(`u${c.id}`, () => api(`/api/inspiration/${c.id}`, "PATCH", { status: "kept" }))}>Restore</button>}
      </div>
    </article>
  );
}
