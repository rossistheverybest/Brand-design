/* Brand templates rendered with Satori (flexbox subset of CSS, every <div>
 * with more than one child needs display:flex). Each layout works at 4:5,
 * 1:1 and 9:16; at 9:16 text and logos stay inside the story safe zone. */
import type { ReactNode } from "react";
import type { BrandKit } from "../brand";
import { SIZES, STORY_SAFE, type Aspect } from "../formats";

export const LAYOUTS = {
  overlay: "Full-bleed photo, gradient, eyebrow + big headline + CTA pill",
  band: "Photo on top, solid brand band below with headline and body (good for info slides)",
  minimal: "Full-bleed photo, small logo only (inspiration posts)",
  endcard: "Solid brand colour, headline + CTA + logo (last carousel slide, no photo)",
} as const;
export type LayoutId = keyof typeof LAYOUTS;

export interface Overlay {
  eyebrow?: string;   // e.g. "TRIP FEATURE" / "APR 3–9 · 2027"
  headline?: string;
  body?: string;
  cta?: string;       // e.g. "Book now" / "Link in bio"
}

export interface TemplateInput {
  kit: BrandKit;
  brandName: string;
  aspect: Aspect;
  layout: LayoutId;
  overlay: Overlay;
  photo?: string;     // data URI already cropped to the photo box
  logo?: string;      // data URI
  credit?: string;
  slide?: { index: number; count: number };
}

/** Size of the photo box a layout needs (so the photo is cropped exactly once). */
export function photoBox(layout: LayoutId, aspect: Aspect) {
  const { width, height } = SIZES[aspect];
  if (layout === "band") return { width, height: Math.round(height * (aspect === "9:16" ? 0.58 : 0.62)) };
  if (layout === "endcard") return null;
  return { width, height };
}

export function Template(p: TemplateInput) {
  const { width, height } = SIZES[p.aspect];
  const story = p.aspect === "9:16";
  const pad = 72;
  const safeTop = story ? STORY_SAFE.top : pad;
  const safeBottom = story ? STORY_SAFE.bottom : pad;
  const c = p.kit.colors;
  const head = (s?: string) => (s && p.kit.headlineCase === "upper" ? s.toUpperCase() : s);

  const logo = (onDark: boolean, size = 54): ReactNode =>
    p.logo ? (
      <img src={p.logo} height={size} style={{ height: size, objectFit: "contain" }} />
    ) : (
      <div style={{ fontFamily: "Display", fontSize: size * 0.72, letterSpacing: 2, color: onDark ? c.paper : c.ink, textTransform: "uppercase" }}>
        {p.brandName}
      </div>
    );

  // On the end card the background is already the primary colour, so invert the pill.
  const pillBg = p.layout === "endcard" ? c.paper : undefined;
  const ctaPill = (onDark: boolean) =>
    p.overlay.cta ? (
      <div style={{ display: "flex", alignSelf: "flex-start", marginTop: 28, padding: "16px 30px", borderRadius: 999, background: pillBg ?? (onDark ? c.primary : c.ink), color: pillBg ? c.primary : c.paper, fontFamily: "Body", fontWeight: 600, fontSize: 32 }}>
        {p.overlay.cta}
      </div>
    ) : null;

  const counter = p.slide && p.slide.count > 1 ? (
    <div style={{ position: "absolute", top: safeTop, right: pad, fontFamily: "Body", fontWeight: 600, fontSize: 26, color: c.paper, background: "rgba(0,0,0,.35)", padding: "6px 14px", borderRadius: 999 }}>
      {`${p.slide.index + 1}/${p.slide.count}`}
    </div>
  ) : null;

  const bandPhotoH = p.layout === "band" ? photoBox("band", p.aspect)!.height : 0;
  const credit = p.credit ? (
    <div style={{ position: "absolute", right: 24, ...(bandPhotoH ? { top: bandPhotoH - 44 } : { bottom: story ? safeBottom - 40 : 20 }), fontFamily: "Body", fontSize: 20, color: "rgba(255,255,255,.75)" }}>
      {`Photo: ${p.credit}`}
    </div>
  ) : null;

  const textBlock = (onDark: boolean, size: number) => (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {p.overlay.eyebrow ? (
        <div style={{ fontFamily: "Body", fontWeight: 600, fontSize: 28, letterSpacing: 4, textTransform: "uppercase", color: onDark ? c.accent : c.primary, marginBottom: 14 }}>
          {p.overlay.eyebrow}
        </div>
      ) : null}
      {p.overlay.headline ? (
        <div style={{ fontFamily: "Display", fontSize: size, lineHeight: 0.92, color: onDark ? c.paper : c.ink }}>
          {head(p.overlay.headline)}
        </div>
      ) : null}
      {p.overlay.body ? (
        <div style={{ fontFamily: "Body", fontSize: 34, lineHeight: 1.3, marginTop: 18, color: onDark ? c.paper : c.ink, opacity: 0.92 }}>
          {p.overlay.body}
        </div>
      ) : null}
      {ctaPill(onDark)}
    </div>
  );

  const headSize = fitHeadline(p.overlay.headline ?? "", story ? 128 : 112);

  if (p.layout === "endcard") {
    return (
      <div style={{ width, height, display: "flex", flexDirection: "column", justifyContent: "space-between", background: c.primary, padding: `${safeTop}px ${pad}px ${safeBottom}px` }}>
        {logo(true, 64)}
        {textBlock(true, headSize)}
        <div style={{ fontFamily: "Body", fontWeight: 600, fontSize: 28, color: c.paper, opacity: 0.85 }}>{p.kit.website.replace(/^https?:\/\//, "") || p.kit.handle}</div>
      </div>
    );
  }

  if (p.layout === "band") {
    const box = photoBox("band", p.aspect)!;
    return (
      <div style={{ width, height, display: "flex", flexDirection: "column", background: c.paper, position: "relative" }}>
        <div style={{ display: "flex", width, height: box.height, position: "relative" }}>
          {p.photo ? <img src={p.photo} width={box.width} height={box.height} /> : null}
          <div style={{ position: "absolute", top: safeTop, left: pad, display: "flex" }}>{logo(true, 48)}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flexGrow: 1, padding: `40px ${pad}px ${story ? safeBottom : pad}px`, borderTop: `10px solid ${c.primary}` }}>
          {textBlock(false, Math.min(headSize, 92))}
        </div>
        {counter}
        {credit}
      </div>
    );
  }

  // overlay + minimal: full-bleed photo
  return (
    <div style={{ width, height, display: "flex", position: "relative", background: c.overlay }}>
      {p.photo ? <img src={p.photo} width={width} height={height} style={{ position: "absolute", top: 0, left: 0 }} /> : null}
      {p.layout === "overlay" ? (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: height * 0.62, backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0), ${hexA(c.overlay, 0.88)})` }} />
      ) : null}
      <div style={{ position: "absolute", top: safeTop, left: pad, display: "flex" }}>{logo(true, p.layout === "minimal" ? 46 : 54)}</div>
      {p.layout === "overlay" ? (
        <div style={{ position: "absolute", left: pad, right: pad, bottom: safeBottom, display: "flex" }}>{textBlock(true, headSize)}</div>
      ) : null}
      {counter}
      {credit}
    </div>
  );
}

/** Shrink long headlines so they fit in ~3 lines. */
function fitHeadline(text: string, max: number) {
  const n = text.length;
  if (n <= 18) return max;
  if (n <= 28) return Math.round(max * 0.85);
  if (n <= 40) return Math.round(max * 0.72);
  return Math.round(max * 0.6);
}

function hexA(hex: string, a: number) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
