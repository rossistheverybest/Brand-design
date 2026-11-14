"use client";
import { useRouter, useSearchParams } from "next/navigation";

export function BrandFilter({ brands, active }: { brands: { id: string; name: string }[]; active: string[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  function toggle(id: string) {
    const next = active.includes(id) ? active.filter((x) => x !== id) : [...active, id];
    const q = new URLSearchParams(sp);
    if (next.length === brands.length || !next.length) q.delete("brands"); else q.set("brands", next.join(","));
    router.push(`/?${q}`);
  }
  return (
    <div className="row" role="group" aria-label="Show brands">
      {brands.map((b) => (
        <button key={b.id} className={`chip b-${b.id}`} aria-pressed={active.includes(b.id)} onClick={() => toggle(b.id)}>
          <span className="dot b" />{b.name}
        </button>
      ))}
    </div>
  );
}
