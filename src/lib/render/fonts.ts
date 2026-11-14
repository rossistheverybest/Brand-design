import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BrandKit } from "../brand";

// Satori needs raw font files (ttf/otf/woff, not woff2). Fonts come from
// @fontsource packages so rendering never depends on a network fetch.
// To add a brand font: `npm i @fontsource/<family>` and add it here.
const REGISTRY: Record<string, { pkg: string; slug: string }> = {
  "Barlow Condensed": { pkg: "@fontsource/barlow-condensed", slug: "barlow-condensed" },
  "Source Sans 3": { pkg: "@fontsource/source-sans-3", slug: "source-sans-3" },
};

type SatoriFont = { name: string; data: Buffer; weight: 400 | 600 | 700 | 800; style: "normal" };
const cache = new Map<string, Buffer>();

async function load(family: string, weight: number): Promise<Buffer> {
  const entry = REGISTRY[family] ?? REGISTRY["Source Sans 3"];
  const key = `${entry.slug}-${weight}`;
  if (!cache.has(key)) {
    const file = path.join(process.cwd(), "node_modules", entry.pkg, "files", `${entry.slug}-latin-${weight}-normal.woff`);
    cache.set(key, await readFile(file));
  }
  return cache.get(key)!;
}

export async function fontsFor(kit: BrandKit): Promise<SatoriFont[]> {
  const d = kit.fonts.display, b = kit.fonts.body;
  return [
    { name: "Display", data: await load(d.family, d.weight), weight: 800, style: "normal" },
    { name: "Body", data: await load(b.family, 400), weight: 400, style: "normal" },
    { name: "Body", data: await load(b.family, 600), weight: 600, style: "normal" },
  ];
}

export const FONT_FAMILIES = Object.keys(REGISTRY);
