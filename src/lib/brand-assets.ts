import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { download } from "./db";
import type { Brand } from "./brand";
export type { Brand } from "./brand";

/** White logo for photos and dark backgrounds: an uploaded one wins, else the one in assets/logos. */
export async function brandLogo(brand: Brand): Promise<Buffer | undefined> {
  if (brand.kit.logo.light) {
    const up = await download(brand.kit.logo.light).catch(() => undefined);
    if (up) return up;
  }
  return readFile(path.join(process.cwd(), "assets", "logos", `${brand.id}-white.png`)).catch(() => undefined);
}
