import { requireUser } from "@/lib/auth";
import { listBrands } from "@/lib/db";
import { ItemForm } from "@/components/ItemForm";

export default async function NewItem({ searchParams }: { searchParams: Promise<{ date?: string; brand?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const brands = await listBrands();
  return (
    <main className="wrap" style={{ maxWidth: 640 }}>
      <h1>New calendar item</h1>
      <div className="card"><ItemForm item={{ date: sp.date ?? "", brand_id: sp.brand ?? "" }} brands={brands.map((b) => ({ id: b.id, name: b.name }))} /></div>
    </main>
  );
}
