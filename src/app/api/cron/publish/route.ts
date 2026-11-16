import { after, NextResponse } from "next/server";
import { dispatch, enqueueDue } from "@/lib/jobs";

// For hosts with HTTP cron (e.g. Vercel). On Netlify, netlify/functions/publish-due.mts does this.
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const ids = await enqueueDue();
  for (const id of ids) await dispatch(id, (fn) => after(fn));
  return NextResponse.json({ queued: ids.length });
}
