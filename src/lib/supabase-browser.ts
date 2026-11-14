"use client";
import { createBrowserClient } from "@supabase/ssr";

export const browserClient = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);

/** Upload a file straight to Storage through a signed upload URL from our API. */
export async function uploadFile(file: File, prefix: "uploads" | "brand-assets"): Promise<string> {
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
