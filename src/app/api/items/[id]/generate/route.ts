import { generateForItem } from "@/lib/generate";
import { route } from "@/lib/http";

export const maxDuration = 300;

export const POST = route<{ id: string }>(async (req, { id }, user) => {
  const { direction } = await req.json().catch(() => ({}));
  const plan = await generateForItem(id, user, direction);
  return { review_notes: plan.review_notes };
});
