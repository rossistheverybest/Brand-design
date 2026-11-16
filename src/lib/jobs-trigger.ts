import "server-only";
import { after } from "next/server";
import { dispatch, enqueue, type JobType } from "./jobs";

/** Queue a job and start it. Returns the job id for the browser to poll. */
export async function startJob(type: JobType, payload: Record<string, unknown>, actor: string) {
  const id = await enqueue(type, payload, actor);
  await dispatch(id, (fn) => after(fn));
  return { job: id };
}
