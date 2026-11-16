import { route } from "@/lib/http";
import { startJob } from "@/lib/jobs-trigger";

export const POST = route(async (req, _p, user) => {
  const { brand_id } = await req.json();
  return startJob("sync_inspiration", { brandId: brand_id }, user);
});
