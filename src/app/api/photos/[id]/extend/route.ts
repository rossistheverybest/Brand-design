import { route } from "@/lib/http";
import { startJob } from "@/lib/jobs-trigger";
import { removeStoryVariant } from "@/lib/touchup";

/** AI-extend a wide photo to 9:16 for stories. */
export const POST = route<{ id: string }>(async (_req, { id }, user) => startJob("extend_photo", { photoId: id }, user));

/** Go back to cropping the original for stories. */
export const DELETE = route<{ id: string }>(async (_req, { id }) => removeStoryVariant(id));
