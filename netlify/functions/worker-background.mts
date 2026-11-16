// Netlify background function (the "-background" suffix gives it a long time
// limit and makes Netlify answer 202 immediately). Runs one queued job.
import { runJob } from "../../src/lib/jobs";

export default async (req: Request) => {
  if (req.headers.get("authorization") !== `Bearer ${process.env.JOB_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = (await req.json()) as { id: string };
  await runJob(id);
  return new Response("ok");
};
