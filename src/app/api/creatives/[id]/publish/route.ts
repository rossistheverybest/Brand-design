import { route } from "@/lib/http";
import { publishCreative } from "@/lib/publishing";

export const maxDuration = 300;

/** Publish now (organic) or create the paused ad. */
export const POST = route<{ id: string }>(async (_req, { id }, user) => publishCreative(id, user));
