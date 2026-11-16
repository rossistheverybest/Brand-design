import { requireUser } from "@/lib/auth";
import { db, listBrands, signedUrl } from "@/lib/db";
import { Suggestions } from "@/components/Suggestions";
import { BrandEditor } from "@/components/BrandEditor";
import { FONT_FAMILIES } from "@/lib/render/fonts";

export const dynamic = "force-dynamic";

export default async function Brands() {
  await requireUser();
  const brands = await listBrands();
  const [{ data: pending }, { data: fb }] = await Promise.all([
    db().from("rule_suggestions").select("id, brand_id, rule, evidence").eq("status", "pending").order("created_at"),
    db().from("feedback").select("brand_id, kind"),
  ]);
  const stats = (id: string) => {
    const rows = (fb ?? []).filter((f) => f.brand_id === id);
    return { approved_unchanged: rows.filter((r) => r.kind === "approved_unchanged").length, approved_edited: rows.filter((r) => r.kind === "approved_edited").length, rejected: rows.filter((r) => r.kind === "rejected").length };
  };
  const withLogos = await Promise.all(brands.map(async (b) => ({
    ...b, logoUrl: b.kit.logo.light ? await signedUrl(b.kit.logo.light, 600).catch(() => null) : null,
  })));
  return (
    <main className="wrap">
      <h1>Brand kits</h1>
      <p className="muted" style={{ maxWidth: "62ch", margin: 0 }}>
        Everything that keeps creatives consistent: colours, fonts, logo, voice and hard rules. Changes apply to the next generate or re-render.
      </p>
      {withLogos.map((b) => (
        <div key={b.id} style={{ display: "grid", gap: 10 }}>
          <BrandEditor brand={b} fonts={FONT_FAMILIES} />
          <Suggestions brandId={b.id} brandName={b.name} pending={(pending ?? []).filter((p) => p.brand_id === b.id)} stats={stats(b.id)} />
        </div>
      ))}
    </main>
  );
}
