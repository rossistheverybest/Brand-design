import satori from "satori";
import sharp from "sharp";
import { Resvg } from "@resvg/resvg-js";
import { createElement } from "react";
import type { BrandKit } from "../brand";
import { SIZES, type Aspect } from "../formats";
import { fontsFor } from "./fonts";
import { cropToBox, type FocalPoint } from "./photo";
import { Template, photoBox, type LayoutId, type Overlay } from "./templates";

export interface RenderRequest {
  kit: BrandKit;
  brandName: string;
  aspect: Aspect;
  layout: LayoutId;
  overlay: Overlay;
  photo?: Buffer;
  focal?: FocalPoint | null;
  logo?: Buffer;
  credit?: string;
  slide?: { index: number; count: number };
}

/** Render one slide / frame. Instagram publishing only accepts JPEG, so that is the output. */
export async function renderJpeg(r: RenderRequest): Promise<Buffer> {
  const { width, height } = SIZES[r.aspect];
  const box = photoBox(r.layout, r.aspect);
  const photo = r.photo && box ? await cropToBox(r.photo, box.width, box.height, r.focal) : undefined;
  const logo = r.logo ? `data:image/png;base64,${r.logo.toString("base64")}` : undefined;
  const lm = r.logo ? await sharp(r.logo).metadata() : undefined;
  const logoAspect = lm?.width && lm.height ? lm.width / lm.height : undefined;

  const svg = await satori(
    createElement(Template, {
      kit: r.kit, brandName: r.brandName, aspect: r.aspect, layout: r.layout,
      overlay: r.overlay, photo, logo, logoAspect, credit: r.credit, slide: r.slide,
    }),
    { width, height, fonts: await fontsFor(r.kit) },
  );
  const png = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
  return sharp(png).jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer();
}
