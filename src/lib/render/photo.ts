import sharp from "sharp";

export interface FocalPoint {
  x: number; // 0..1 from left
  y: number; // 0..1 from top
}

/**
 * Crop a photo to exactly width x height around a focal point (from Claude's
 * photo check). Without one, sharp's attention strategy picks the busiest region.
 * Returns a JPEG data URI for the template.
 */
export async function cropToBox(
  input: Buffer,
  width: number,
  height: number,
  focal?: FocalPoint | null,
): Promise<string> {
  const img = sharp(input, { failOn: "none" }).rotate(); // honour EXIF orientation
  let out: Buffer;
  if (!focal) {
    out = await img
      .resize(width, height, { fit: "cover", position: sharp.strategy.attention })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
  } else {
    const meta = await sharp(await img.toBuffer()).metadata();
    const sw = meta.width!, sh = meta.height!;
    const target = width / height;
    let cw = sw, ch = Math.round(sw / target);
    if (ch > sh) { ch = sh; cw = Math.round(sh * target); }
    const left = clamp(Math.round(focal.x * sw - cw / 2), 0, sw - cw);
    const top = clamp(Math.round(focal.y * sh - ch / 2), 0, sh - ch);
    out = await sharp(input, { failOn: "none" })
      .rotate()
      .extract({ left, top, width: cw, height: ch })
      .resize(width, height)
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
  }
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}

/** Small JPEG for sending to Claude (keeps tokens and latency down). */
export async function previewForModel(input: Buffer): Promise<{ data: string; width: number; height: number }> {
  const rotated = sharp(input, { failOn: "none" }).rotate();
  const meta = await rotated.metadata();
  const buf = await rotated
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  const w = meta.orientation && meta.orientation >= 5 ? meta.height! : meta.width!;
  const h = meta.orientation && meta.orientation >= 5 ? meta.width! : meta.height!;
  return { data: buf.toString("base64"), width: w, height: h };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
