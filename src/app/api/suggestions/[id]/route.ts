import { db, getBrand, log } from "@/lib/db";
import { route } from "@/lib/http";

/** Accept (adds the rule to the brand kit) or dismiss a suggested rule. */
export const PATCH = route<{ id: string }>(async (req, { id }, user) => {
  const { decision, rule } = await req.json();
  if (!["accepted", "dismissed"].includes(decision)) throw new Error("Bad decision");
  const sb = db();
  const { data: s } = await sb.from("rule_suggestions").select("*").eq("id", id).single();
  if (!s || s.status !== "pending") throw new Error("Already decided");
  const text = String(rule || s.rule).trim();
  if (decision === "accepted") {
    const brand = await getBrand(s.brand_id);
    const { data: row } = await sb.from("brands").select("kit").eq("id", s.brand_id).single();
    await sb.from("brands").update({ kit: { ...(row?.kit ?? {}), rules: [...brand.kit.rules, text] }, updated_at: new Date().toISOString() }).eq("id", s.brand_id);
  }
  await sb.from("rule_suggestions").update({ status: decision, rule: text, decided_at: new Date().toISOString() }).eq("id", id);
  await log(`rule_${decision}`, { rule: text, brand: s.brand_id }, {}, user);
});
