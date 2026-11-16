import { route } from "@/lib/http";
import { startJob } from "@/lib/jobs-trigger";

export const POST = route<{ id: string }>(async (req, { id }, user) => {
  const { direction } = await req.json().catch(() => ({}));
  return startJob("generate", { itemId: id, direction: direction || null }, user);
});
