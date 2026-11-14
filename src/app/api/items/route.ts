import { db, getBrand, log } from "@/lib/db";
import { route } from "@/lib/http";
import { zonedTime } from "@/lib/publishing";

export const POST = route(async (req, _p, user) => {
  const body = await pick(await req.json());
  const { data, error } = await db().from("calendar_items").insert({ ...body, source: "manual" }).select("id").single();
  if (error) throw error;
  await log("created", {}, { item_id: data.id }, user);
  return data;
});

const FIELDS = ["brand_id", "date", "publish_at", "kind", "format", "pillar", "title", "brief", "link_url", "channels", "ad_set_id", "flag", "status"];

/** Whitelist fields; blank -> null; a local "YYYY-MM-DDTHH:MM" publish time is read in the brand's time zone. */
export async function pick(body: Record<string, unknown>, existingBrandId?: string) {
  const out = Object.fromEntries(Object.entries(body).filter(([k]) => FIELDS.includes(k)).map(([k, v]) => [k, v === "" ? null : v]));
  const local = typeof out.publish_at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(out.publish_at) ? out.publish_at : null;
  if (local) {
    const brand = await getBrand(String(out.brand_id ?? existingBrandId));
    const [d, t] = local.split("T");
    out.publish_at = zonedTime(d, t, brand.kit.timezone).toISOString();
  }
  return out;
}
