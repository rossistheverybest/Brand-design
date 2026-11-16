"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, runJob } from "@/lib/supabase-browser";

interface Suggestion { id: number; rule: string; evidence: string | null }

export function Suggestions({ brandId, brandName, pending, stats }: {
  brandId: string; brandName: string; pending: Suggestion[];
  stats: { approved_unchanged: number; approved_edited: number; rejected: number };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [edits, setEdits] = useState<Record<number, string>>({});
  const total = stats.approved_unchanged + stats.approved_edited + stats.rejected;

  async function go(label: string, fn: () => Promise<unknown>) {
    setBusy(label); setMsg("");
    try { const r = await fn(); if (r && typeof r === "object" && "note" in r) setMsg(String((r as { note: string }).note)); router.refresh(); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <fieldset>
      <legend>Learning</legend>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        {total ? `${total} reviews so far: ${stats.approved_unchanged} approved as-is, ${stats.approved_edited} approved after edits, ${stats.rejected} rejected. New drafts already use these.` : "No reviews yet. Approving, editing and rejecting drafts teaches the generator."}
      </p>
      {pending.map((s) => (
        <div key={s.id} className="sugg">
          <span className="k">Suggested rule</span>
          <input value={edits[s.id] ?? s.rule} onChange={(e) => setEdits({ ...edits, [s.id]: e.target.value })} aria-label="Rule text" />
          {s.evidence && <span className="muted" style={{ fontSize: 13 }}>Why: {s.evidence}</span>}
          <div className="row">
            <button className="ok" disabled={!!busy} onClick={() => go(`a${s.id}`, () => api(`/api/suggestions/${s.id}`, "PATCH", { decision: "accepted", rule: edits[s.id] ?? s.rule }))}>Add to rules</button>
            <button disabled={!!busy} onClick={() => go(`d${s.id}`, () => api(`/api/suggestions/${s.id}`, "PATCH", { decision: "dismissed" }))}>Dismiss</button>
          </div>
        </div>
      ))}
      <div className="row">
        <button disabled={!!busy || total < 3} onClick={() => go("learn", () => runJob(`/api/brands/${brandId}/learn`, "POST"))}>
          {busy === "learn" ? "Reading your reviews…" : `Suggest rules for ${brandName}`}
        </button>
        {msg && <span className="muted">{msg}</span>}
      </div>
    </fieldset>
  );
}
