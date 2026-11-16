import { route } from "@/lib/http";
import { startJob } from "@/lib/jobs-trigger";

export const POST = route<{ id: string }>(async (_req, { id }, user) => startJob("learn", { brandId: id }, user));
