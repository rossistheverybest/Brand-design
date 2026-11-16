import { db, getBrand, listBrands, log } from "@/lib/db";
import { route } from "@/lib/http";

/** Add a rule idea from an inspiration straight to a brand's rules (or all brands). */
export const POST = route<{ id: string }>(async (req, { id }, user) => {
  const { rule, brand_id } = await req.json();
  const text = String(rule ?? "").trim();
  if (!text) throw new Error("Empty rule");
  const ids = brand_id ? [brand_id] : (await listBrands()).map((b) => b.id);
  for (const b of ids) {
    const brand = await getBrand(b);
    if (brand.kit.rules.includes(text)) continue;
    const { data: row } = await db().from("brands").select("kit").eq("id", b).single();
    await db().from("brands").update({ kit: { ...(row?.kit ?? {}), rules: [...brand.kit.rules, text] }, updated_at: new Date().toISOString() }).eq("id", b);
  }
  await db().from("inspirations").update({ status: "kept" }).eq("id", id);
  await log("rule_from_inspiration", { rule: text, brands: ids, inspiration: id }, {}, user);
});
