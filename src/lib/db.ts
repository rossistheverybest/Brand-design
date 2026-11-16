import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { withDefaults, type Brand } from "./brand";

let admin: SupabaseClient | null = null;

/** Server-side client with the secret key. Only call after requireUser(). */
export function db(): SupabaseClient {
  if (!admin) {
    admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

export const BUCKET = "media";

export async function getBrand(id: string): Promise<Brand> {
  const { data, error } = await db().from("brands").select("*").eq("id", id).single();
  if (error) throw error;
  return { id: data.id, name: data.name, kit: withDefaults(data.id, data.kit), meta: data.meta ?? {} };
}

export async function listBrands(): Promise<Brand[]> {
  const { data, error } = await db().from("brands").select("*").order("name");
  if (error) throw error;
  return data.map((b) => ({ id: b.id, name: b.name, kit: withDefaults(b.id, b.kit), meta: b.meta ?? {} }));
}

export async function download(path: string): Promise<Buffer> {
  const { data, error } = await db().storage.from(BUCKET).download(path);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

export async function upload(path: string, body: Buffer, contentType = "image/jpeg") {
  const { error } = await db().storage.from(BUCKET).upload(path, body, { contentType, upsert: true });
  if (error) throw error;
}

/** Signed URL for previews and for Meta to fetch images (Meta downloads them right away). */
export async function signedUrl(path: string, seconds = 3600): Promise<string> {
  const { data, error } = await db().storage.from(BUCKET).createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function log(action: string, detail: Record<string, unknown>, ids: { item_id?: string; creative_id?: string }, actor?: string) {
  await db().from("activity").insert({ action, detail, actor, ...ids });
}

/** Sign many paths in one request (calendar thumbnails). */
export async function signedUrls(paths: string[], seconds = 600): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return out;
  const { data, error } = await db().storage.from(BUCKET).createSignedUrls(unique, seconds);
  if (error) throw error;
  for (const r of data ?? []) if (r.path && r.signedUrl) out.set(r.path, r.signedUrl);
  return out;
}
