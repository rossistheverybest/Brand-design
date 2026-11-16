"use client";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./public-config";
import { createBrowserClient } from "@supabase/ssr";

export const browserClient = () =>
  createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

/** Upload a file straight to Storage through a signed upload URL from our API. */
export async function uploadFile(file: File, prefix: "uploads" | "brand-assets" | "inspiration"): Promise<string> {
  const res = await fetch("/api/upload-url", { method: "POST", body: JSON.stringify({ filename: file.name, prefix }) });
  const { path, token, error } = await res.json();
  if (error) throw new Error(error);
  const { error: upErr } = await browserClient().storage.from("media").uploadToSignedUrl(path, token, file, { contentType: file.type });
  if (upErr) throw upErr;
  return path;
}

export async function api<T = unknown>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

/** Call an endpoint that may start a background job, then wait for the job to finish. */
export async function runJob<T = unknown>(url: string, method: string, body?: unknown, timeoutMs = 6 * 60_000): Promise<T> {
  const r = await api<{ job?: string } & T>(url, method, body);
  if (!r || !r.job) return r as T;
  const started = Date.now();
  for (;;) {
    await new Promise((res) => setTimeout(res, 2000));
    const j = await api<{ status: string; result: T; error: string | null }>(`/api/jobs/${r.job}`, "GET");
    if (j.status === "done") return j.result;
    if (j.status === "failed") throw new Error(j.error ?? "Job failed");
    if (Date.now() - started > timeoutMs) throw new Error("Still working. Refresh the page in a minute to see the result.");
  }
}
