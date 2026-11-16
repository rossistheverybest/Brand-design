import { readFile } from "node:fs/promises";
import path from "node:path";

// Bundled files (fonts, logos) live next to the app locally and next to the
// function code on serverless hosts. Try each root in turn.
const ROOTS = [...new Set([process.cwd(), process.env.LAMBDA_TASK_ROOT, process.env.APP_ROOT].filter(Boolean) as string[])];

export async function readAppFile(rel: string): Promise<Buffer> {
  let last: unknown;
  for (const root of ROOTS) {
    try { return await readFile(path.join(root, rel)); } catch (e) { last = e; }
  }
  throw last;
}
