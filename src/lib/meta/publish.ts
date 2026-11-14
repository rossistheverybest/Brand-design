import "server-only";
import { graph, pageToken, MetaError } from "./graph";

// Organic publishing. Image URLs must be publicly fetchable for a few minutes
// (we pass signed Supabase Storage URLs). Instagram accepts JPEG only.

export type OrganicKind = "feed" | "story";

/** Instagram: create container(s), wait until processed, publish. */
export async function publishInstagram(igUserId: string, imageUrls: string[], caption: string, kind: OrganicKind) {
  let creationId: string;
  if (kind === "story") {
    // One story per image.
    const ids: string[] = [];
    for (const url of imageUrls) {
      const c = await graph<{ id: string }>(`${igUserId}/media`, { image_url: url, media_type: "STORIES" });
      await waitForContainer(c.id);
      ids.push((await graph<{ id: string }>(`${igUserId}/media_publish`, { creation_id: c.id })).id);
    }
    return { instagram_media_ids: ids };
  }
  if (imageUrls.length === 1) {
    creationId = (await graph<{ id: string }>(`${igUserId}/media`, { image_url: imageUrls[0], caption })).id;
  } else {
    const children: string[] = [];
    for (const url of imageUrls) {
      children.push((await graph<{ id: string }>(`${igUserId}/media`, { image_url: url, is_carousel_item: true })).id);
    }
    await Promise.all(children.map(waitForContainer));
    creationId = (await graph<{ id: string }>(`${igUserId}/media`, { media_type: "CAROUSEL", children: children.join(","), caption })).id;
  }
  await waitForContainer(creationId);
  const published = await graph<{ id: string }>(`${igUserId}/media_publish`, { creation_id: creationId });
  return { instagram_media_ids: [published.id] };
}

async function waitForContainer(id: string) {
  for (let i = 0; i < 20; i++) {
    const s = await graph<{ status_code: string }>(id, { fields: "status_code" }, "GET");
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new MetaError(`Instagram could not process the image (${s.status_code})`, s);
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new MetaError("Instagram is still processing the image; try publishing again in a minute.", { id });
}

/** Facebook Page: single photo, multi-photo post, or photo stories. */
export async function publishFacebook(pageId: string, imageUrls: string[], message: string, kind: OrganicKind) {
  const token = await pageToken(pageId);
  if (kind === "story") {
    const ids: string[] = [];
    for (const url of imageUrls) {
      const photo = await graph<{ id: string }>(`${pageId}/photos`, { url, published: false }, "POST", token);
      ids.push((await graph<{ post_id: string }>(`${pageId}/photo_stories`, { photo_id: photo.id }, "POST", token)).post_id);
    }
    return { facebook_post_ids: ids };
  }
  if (imageUrls.length === 1) {
    const r = await graph<{ post_id?: string; id: string }>(`${pageId}/photos`, { url: imageUrls[0], message }, "POST", token);
    return { facebook_post_ids: [r.post_id ?? r.id] };
  }
  const media: { media_fbid: string }[] = [];
  for (const url of imageUrls) {
    media.push({ media_fbid: (await graph<{ id: string }>(`${pageId}/photos`, { url, published: false }, "POST", token)).id });
  }
  const r = await graph<{ id: string }>(`${pageId}/feed`, { message, attached_media: media }, "POST", token);
  return { facebook_post_ids: [r.id] };
}
