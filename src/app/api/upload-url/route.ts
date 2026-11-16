import { randomUUID } from "node:crypto";
import { BUCKET, db } from "@/lib/db";
import { route } from "@/lib/http";

/** Browser uploads go straight to Storage (no function body-size limit). */
export const POST = route(async (req) => {
  const { filename, prefix } = await req.json();
  if (!["uploads", "brand-assets", "inspiration"].includes(prefix)) throw new Error("Bad prefix");
  const ext = String(filename ?? "").split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${prefix}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
  const { data, error } = await db().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw error;
  return { path, token: data.token };
});
