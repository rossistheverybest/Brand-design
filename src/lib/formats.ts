// Meta placement specs. Sizes follow Meta's recommended upload sizes.

export type Aspect = "4:5" | "1:1" | "9:16";

export const SIZES: Record<Aspect, { width: number; height: number }> = {
  "4:5": { width: 1080, height: 1350 },  // IG/FB feed (tallest the feed shows)
  "1:1": { width: 1080, height: 1080 },
  "9:16": { width: 1080, height: 1920 }, // Stories and Reels
};

/**
 * Story safe zones: Meta overlays the profile bar at the top and the reply /
 * CTA bar at the bottom. Keep text and logos out of these bands.
 */
export const STORY_SAFE = { top: 250, bottom: 340 };

/** Copy limits. Meta truncates beyond these in most placements. */
export const LIMITS = {
  igCaption: 2200,
  primaryText: 125,  // shown before "...more" in feed ads
  headline: 40,
  description: 30,
  overlayHeadline: 48,
  overlayBody: 140,
  carouselMaxSlides: 10,
};

export type Placement = "feed" | "story" | "ad";

/** What to make for a calendar item, based on its kind/format. */
export function placementsFor(kind: string, format: string): Placement[] {
  if (kind === "ad") return ["ad"];
  if (format === "reel") return []; // video: not made here (yet)
  if (kind === "story" || format === "story") return ["story"];
  if (kind === "post") return ["feed", "story"]; // every feed post gets a matching story frame
  if (kind === "event") return ["feed", "story"];
  return [];
}
