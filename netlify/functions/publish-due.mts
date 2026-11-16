// Netlify scheduled function: every 15 minutes, queue publish jobs for
// approved posts whose time has come, and hand each to the background worker.
import { dispatch, enqueueDue } from "../../src/lib/jobs";

export default async () => {
  const ids = await enqueueDue();
  for (const id of ids) await dispatch(id, () => { throw new Error("JOB_RUNNER must be 'netlify' on Netlify"); });
  return new Response(JSON.stringify({ queued: ids.length }), { headers: { "content-type": "application/json" } });
};

export const config = { schedule: "*/15 * * * *" };
