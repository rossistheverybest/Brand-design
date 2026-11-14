import { NextResponse } from "next/server";
import { publishDue } from "@/lib/publishing";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return NextResponse.json({ results: await publishDue() });
}
