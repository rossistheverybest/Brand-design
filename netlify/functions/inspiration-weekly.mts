// Netlify scheduled function: Monday mornings (~7-8am Pacific), pull standout
// posts from each brand's watch list and write the weekly report.
import { dispatch, enqueueInspirationSyncs } from "../../src/lib/jobs";

export default async () => {
  const ids = await enqueueInspirationSyncs();
  for (const id of ids) await dispatch(id, () => { throw new Error("JOB_RUNNER must be 'netlify' on Netlify"); });
  return new Response(JSON.stringify({ queued: ids.length }), { headers: { "content-type": "application/json" } });
};

export const config = { schedule: "15 15 * * 1" };
