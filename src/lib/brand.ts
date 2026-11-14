// Brand kit: everything that makes a creative look and sound like the brand.
// Stored in brands.kit; the defaults below seed the three brands and are the
// fallback when a field is missing.

export type FontRole = "display" | "body";

export interface BrandKit {
  colors: {
    primary: string;      // CTA pills, band backgrounds
    accent: string;       // eyebrow text, rules
    ink: string;          // text on light
    paper: string;        // light background / text on dark
    overlay: string;      // gradient colour behind text on photos
  };
  fonts: Record<FontRole, { family: string; weight: number }>;
  /** Storage paths in the 'media' bucket (PNG with transparency).
   *  light = white/light logo for photos and brand-colour backgrounds (used by the templates);
   *  dark = dark logo, kept for future light layouts. */
  logo: { light?: string; dark?: string };
  /** Display text transform for headlines. */
  headlineCase: "upper" | "none";
  voice: string;          // how the brand writes
  rules: string[];        // hard rules Claude must follow
  hashtags: string[];
  /** Default handle for "link in bio" and story CTAs. */
  handle: string;
  website: string;
  defaultCta: MetaCta;
  /** Local time (HH:MM) items publish when no publish_at is set. */
  defaultPublishTime: string;
  timezone: string;
}

export interface BrandMeta {
  pageId?: string;
  igUserId?: string;
  adAccountId?: string;   // without the act_ prefix
  defaultAdSetId?: string;
}

export interface Brand {
  id: string;
  name: string;
  kit: BrandKit;
  meta: BrandMeta;
}

// Meta call_to_action types the generator may pick from.
export const META_CTAS = [
  "LEARN_MORE",
  "BOOK_TRAVEL",
  "SIGN_UP",
  "SHOP_NOW",
  "CONTACT_US",
  "GET_OFFER",
  "SUBSCRIBE",
] as const;
export type MetaCta = (typeof META_CTAS)[number];

const shared = {
  fonts: {
    display: { family: "Barlow Condensed", weight: 800 },
    body: { family: "Source Sans 3", weight: 400 },
  },
  headlineCase: "upper" as const,
  defaultPublishTime: "08:30",
  timezone: "America/Vancouver",
  logo: {},
};

// All three brands use a black-and-white palette; the logo, voice and rules are
// what tell them apart. Logos live in assets/logos (white + black versions).
export const DEFAULT_KITS: Record<string, { name: string; kit: BrandKit }> = {
  altus: {
    name: "Altus Mountain Guides",
    kit: {
      ...shared,
      colors: { primary: "#111111", accent: "#ffffff", ink: "#111111", paper: "#ffffff", overlay: "#000000" },
      voice:
        "Certified IFMGA/ACMG mountain guides. Calm, expert, warm. Plain words, short sentences, specific details (routes, huts, dates). Safety-first without fear. No hype, no exclamation stacks, at most one emoji.",
      rules: [
        "Every post is approved by Ross before it goes out.",
        "Black Friday and other discount offers go to email and the MTN Club only, never the public feed or ads.",
        "Use real prices and dates only when they are in the brief; never invent them.",
        "Credit the photographer when a credit is given.",
      ],
      hashtags: ["#altusmountainguides", "#skitouring", "#backcountryskiing", "#seatosky"],
      handle: "@altusmountainguides",
      website: "https://altusmountainguides.com",
      defaultCta: "BOOK_TRAVEL",
    },
  },
  corvus: {
    name: "Corvus Snowboarding",
    kit: {
      ...shared,
      colors: { primary: "#111111", accent: "#ffffff", ink: "#111111", paper: "#ffffff", overlay: "#000000" },
      voice:
        "Splitboard specialists, by snowboarders for snowboarders. Lower-case friendly headline phrasing is fine (e.g. 'your crew. your dates.'). Direct, a little playful, technical when it matters.",
      rules: [
        "Every post is approved by Ross before it goes out.",
        "Riders shown must be on splitboards or snowboards, never skis. Flag any photo where that is unclear.",
        "Use real prices and dates only when they are in the brief; never invent them.",
        "Credit the photographer when a credit is given.",
      ],
      hashtags: ["#corvussnowboarding", "#splitboarding", "#splitboard", "#backcountrysnowboarding"],
      handle: "@corvussnowboarding",
      website: "https://corvussnowboarding.com",
      defaultCta: "BOOK_TRAVEL",
    },
  },
  winterstoke: {
    name: "Winterstoke",
    kit: {
      ...shared,
      colors: { primary: "#111111", accent: "#ffffff", ink: "#111111", paper: "#ffffff", overlay: "#000000" },
      voice:
        "Community backcountry festival in Squamish. Energetic, welcoming, local. Event details first: what, where, when, price.",
      rules: [
        "Every post is approved by Ross before it goes out.",
        "Always include venue, date and time for event posts when they are in the brief.",
        "Credit the photographer when a credit is given.",
      ],
      hashtags: ["#winterstoke", "#squamish", "#backcountry"],
      handle: "@winterstoke",
      website: "",
      defaultCta: "LEARN_MORE",
    },
  },
};

export function withDefaults(id: string, kit: Partial<BrandKit> | null | undefined): BrandKit {
  const base = DEFAULT_KITS[id]?.kit ?? DEFAULT_KITS.altus.kit;
  return {
    ...base,
    ...(kit ?? {}),
    colors: { ...base.colors, ...(kit?.colors ?? {}) },
    fonts: { ...base.fonts, ...(kit?.fonts ?? {}) },
    logo: { ...base.logo, ...(kit?.logo ?? {}) },
  };
}
