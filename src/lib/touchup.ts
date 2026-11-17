// AI photo touch-up: extend a photo that is too wide for a 9:16 story by
// generating sky/snow above and below it (OpenAI image edit with a mask).
// The real photo is pasted back over the middle at full resolution, so only
// the added bands are AI-made. The result is stored as the photo's story
// variant and marked as AI-edited; the original is never changed.
import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { db, download, getBrand, log, upload } from "./db";

const MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
const W = 1024, H = 1536;           // closest portrait size the image model supports (2:3)
const OUT_W = 1080, OUT_H = 1920;   // story size

const PROMPT =
  "Extend this outdoor mountain photograph upward and downward so it fills a tall frame. " +
  "Continue the existing sky, snow, terrain and lighting seamlessly and photorealistically. " +
  "Do not add people, animals, skiers, text, logos, buildings or new objects. Keep it natural and understated.";

export async function extendForStory(photoId: string, actor: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Photo touch-ups need an OpenAI API key (OPENAI_API_KEY in Netlify).");
  if (key.startsWith("sk-or-")) {
    throw new Error("OPENAI_API_KEY is an OpenRouter key. Image editing needs a key from platform.openai.com (OpenRouter has no image-edit endpoint).");
  }
  const sb = db();
  const { data: photo } = await sb.from("photos").select("*").eq("id", photoId).single();
  if (!photo) throw new Error("Photo not found");
  if (photo.brand_id && (await getBrand(photo.brand_id)).kit.allowAiImages === false) {
    throw new Error("This business doesn't allow AI-edited images. Use a taller photo for stories instead.");
  }
  const original = await sharp(await download(photo.storage_path), { failOn: "none" }).rotate().toBuffer();
  const meta = await sharp(original).metadata();
  const ratio = meta.width! / meta.height!;
  if (ratio <= OUT_W / OUT_H + 0.02) throw new Error("This photo is already tall enough for a story; no touch-up needed.");

  // Photo scaled to the canvas width, centred vertically; transparent above and below = area to fill.
  const ph = Math.round(W / ratio);
  const top = Math.round((H - ph) / 2);
  const placed = await sharp(original).resize(W, ph).png().toBuffer();
  const canvas = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: placed, top, left: 0 }]).png().toBuffer();

  // Always talk to OpenAI directly: an OPENAI_BASE_URL pointing at another
  // gateway (e.g. OpenRouter) has no /images/edits endpoint.
  const openai = new OpenAI({ apiKey: key, baseURL: "https://api.openai.com/v1" });
  const res = await openai.images.edit({
    model: MODEL,
    // Keep the upload small (some gateways cap request bodies at ~4.5 MB):
    // WebP keeps transparency at a fraction of PNG's size, and the mask is a
    // flat two-tone PNG.
    image: await toFile(await sharp(canvas).webp({ quality: 90, alphaQuality: 100 }).toBuffer(), "photo.webp", { type: "image/webp" }),
    mask: await toFile(await maskFor(top, ph), "mask.png", { type: "image/png" }), // transparent pixels = fill these
    prompt: PROMPT,
    size: `${W}x${H}`,
    n: 1,
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("The image service returned no image.");

  // Scale the AI canvas to story size, then lay the real photo back over the middle at full quality.
  const outPh = Math.round(OUT_W / ratio);
  const outTop = Math.round((OUT_H - outPh) / 2);
  const realBand = await sharp(original).resize(OUT_W, outPh).toBuffer();
  const story = await sharp(Buffer.from(b64, "base64"))
    .resize(OUT_W, OUT_H, { fit: "fill" })
    .composite([{ input: realBand, top: outTop, left: 0 }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  const path = photo.storage_path.replace(/^uploads\//, "uploads/story-variants/").replace(/\.\w+$/, `-${Date.now()}.jpg`);
  await upload(path, story);
  await sb.from("photos").update({ story_variant_path: path, story_variant_ai: true }).eq("id", photoId);
  await log("photo_extended_ai", { photoId, model: MODEL }, { item_id: photo.item_id }, actor);
  return { story_variant_path: path };
}

/** Opaque where the real photo sits, transparent where the model should paint. */
async function maskFor(top: number, ph: number) {
  const band = await sharp({ create: { width: W, height: ph, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: band, top, left: 0 }]).png({ compressionLevel: 9 }).toBuffer();
}

export async function removeStoryVariant(photoId: string) {
  await db().from("photos").update({ story_variant_path: null, story_variant_ai: false }).eq("id", photoId);
}
