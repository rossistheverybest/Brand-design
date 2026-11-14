import { requireUser } from "@/lib/auth";
import { listBrands, signedUrl } from "@/lib/db";
import { BrandEditor } from "@/components/BrandEditor";
import { FONT_FAMILIES } from "@/lib/render/fonts";

export const dynamic = "force-dynamic";

export default async function Brands() {
  await requireUser();
  const brands = await listBrands();
  const withLogos = await Promise.all(brands.map(async (b) => ({
    ...b, logoUrl: b.kit.logo.light ? await signedUrl(b.kit.logo.light, 600).catch(() => null) : null,
  })));
  return (
    <main className="wrap">
      <h1>Brand kits</h1>
      <p className="muted" style={{ maxWidth: "62ch", margin: 0 }}>
        Everything that keeps creatives consistent: colours, fonts, logo, voice and hard rules. Changes apply to the next generate or re-render.
      </p>
      {withLogos.map((b) => <BrandEditor key={b.id} brand={b} fonts={FONT_FAMILIES} />)}
    </main>
  );
}
