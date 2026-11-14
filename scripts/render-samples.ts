// Renders every layout x aspect for each brand into ./samples using a photo
// you pass in (or a generated placeholder). No Supabase or API keys needed.
//   npm run render:samples -- path/to/photo.jpg
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { DEFAULT_KITS } from "../src/lib/brand";
import { renderJpeg } from "../src/lib/render";
import { LAYOUTS, type LayoutId } from "../src/lib/render/templates";
import type { Aspect } from "../src/lib/formats";

async function placeholder() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1600">
    <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fa6c9"/><stop offset="1" stop-color="#dfe9f2"/></linearGradient></defs>
    <rect width="2400" height="1600" fill="url(#s)"/>
    <polygon points="0,1600 700,500 1100,950 1500,300 2400,1300 2400,1600" fill="#f7f9fb"/>
    <polygon points="700,500 820,700 1500,300 1380,520" fill="#c9d6e2"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

async function main() {
  const photo = process.argv[2] ? await readFile(process.argv[2]) : await placeholder();
  await mkdir("samples", { recursive: true });
  const overlay = { eyebrow: "Trip feature · April 2027", headline: "The Haute Route", body: "Chamonix to Zermatt in six days, hut to hut.", cta: "Book now" };
  for (const [id, { name, kit }] of Object.entries(DEFAULT_KITS)) {
    for (const layout of Object.keys(LAYOUTS) as LayoutId[]) {
      for (const aspect of ["4:5", "9:16"] as Aspect[]) {
        const logo = await readFile(`assets/logos/${id}-white.png`).catch(() => undefined);
        const jpg = await renderJpeg({ kit, brandName: name, logo, aspect, layout, overlay, photo, credit: "@photographer", slide: layout === "band" ? { index: 1, count: 5 } : undefined });
        const file = `samples/${id}-${layout}-${aspect.replace(":", "x")}.jpg`;
        await writeFile(file, jpg);
        console.log(file);
      }
    }
  }
}
main();
