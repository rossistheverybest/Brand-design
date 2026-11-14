import "server-only";
import { graph } from "./graph";

export interface AdInput {
  adAccountId: string;  // without act_
  adSetId: string;
  pageId: string;
  igUserId?: string;
  name: string;
  feedJpg: Buffer;      // 4:5 for Facebook/Instagram feeds
  storyJpg: Buffer;     // 9:16 for Stories and Reels
  primaryText: string;
  headline: string;
  description: string;
  cta: string;
  link: string;
}

/**
 * Upload both images, build one creative that shows the 4:5 image in feeds
 * and the 9:16 image in Stories/Reels (placement asset customization), and
 * add it to an existing ad set as a PAUSED ad. Nothing spends money until
 * someone turns the ad on in Ads Manager.
 */
export async function createPausedAd(a: AdInput) {
  const act = `act_${a.adAccountId.replace(/^act_/, "")}`;
  const [feedHash, storyHash] = await Promise.all([uploadImage(act, a.feedJpg, "feed.jpg"), uploadImage(act, a.storyJpg, "story.jpg")]);

  const creative = await graph<{ id: string }>(`${act}/adcreatives`, {
    name: `${a.name} · creative`,
    object_story_spec: { page_id: a.pageId, ...(a.igUserId ? { instagram_user_id: a.igUserId } : {}) },
    asset_feed_spec: {
      images: [
        { hash: feedHash, adlabels: [{ name: "feed_img" }] },
        { hash: storyHash, adlabels: [{ name: "story_img" }] },
      ],
      bodies: [{ text: a.primaryText }],
      titles: [{ text: a.headline }],
      descriptions: [{ text: a.description }],
      link_urls: [{ website_url: a.link }],
      call_to_action_types: [a.cta],
      ad_formats: ["SINGLE_IMAGE"],
      asset_customization_rules: [
        {
          customization_spec: {
            publisher_platforms: ["facebook", "instagram"],
            facebook_positions: ["feed", "marketplace", "search"],
            instagram_positions: ["stream", "explore", "profile_feed"],
          },
          image_label: { name: "feed_img" },
        },
        {
          customization_spec: {
            publisher_platforms: ["facebook", "instagram"],
            facebook_positions: ["story", "facebook_reels"],
            instagram_positions: ["story", "reels"],
          },
          image_label: { name: "story_img" },
        },
      ],
    },
  });

  const ad = await graph<{ id: string }>(`${act}/ads`, {
    name: a.name,
    adset_id: a.adSetId,
    creative: { creative_id: creative.id },
    status: "PAUSED",
  });
  return { ad_id: ad.id, creative_id: creative.id, image_hashes: [feedHash, storyHash] };
}

async function uploadImage(act: string, jpg: Buffer, filename: string) {
  const r = await graph<{ images: Record<string, { hash: string }> }>(`${act}/adimages`, { bytes: jpg.toString("base64"), name: filename });
  return Object.values(r.images)[0].hash;
}
