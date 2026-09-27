// Prove the saved request really carries the query before anyone relies on it.
// Idea from Cqctxs/Pilot src/compiler/validate.ts (judge + per-key query probe): replay with the learned query,
// then with a different one; results must be non-empty and must change. Identical output = the query is hardcoded.
import { rawCall, items } from "./replay.ts";
import { type Api, type Verification, stamp } from "./store.ts";

const PROBES = ["python", "robotics", "coffee", "startup"];

export async function verify(api: Api): Promise<Verification> {
  const problems: string[] = [];
  const a = await rawCall(api, api.learned_query);
  const ra = items(a.data, 30);
  const probe = PROBES.find((p) => !api.learned_query.toLowerCase().includes(p))!;
  const b = await rawCall(api, probe);
  const rb = items(b.data, 30);
  if (!ra.length) problems.push(`replaying "${api.learned_query}" returned no results`);
  if (!rb.length) problems.push(`probe query "${probe}" returned no results`);
  const differs = JSON.stringify(ra.map((r) => r.title)) !== JSON.stringify(rb.map((r) => r.title));
  if (ra.length && rb.length && !differs) problems.push(`"${api.learned_query}" and "${probe}" returned identical results: the query isn't reaching the site`);
  return { ok: problems.length === 0, checked_at: stamp(), learned_query_results: ra.length, probe_query: probe, probe_results: rb.length, differs, problems };
}
