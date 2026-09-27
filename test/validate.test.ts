import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { verify } from "../src/validate.ts";
import { site, api } from "./helpers.ts";

let s: Awaited<ReturnType<typeof site>>;
before(async () => { s = await site(); });
after(async () => { await s.close(); });

test("verify: a hardcoded-query endpoint fails with the 'identical results' problem", async () => {
  const v = await verify(api(s.base + "/hard?q=whatever") as any);
  assert.equal(v.ok, false);
  assert.equal(v.differs, false);
  assert.match(v.problems.join(), /identical results: the query isn't reaching the site/);
});

test("verify: a real endpoint passes, probe differs from learned query", async () => {
  const v = await verify(api(s.base + "/real?q={query:url}") as any);
  assert.equal(v.ok, true, v.problems.join());
  assert.equal(v.probe_query, "python");
  assert.equal(v.learned_query_results, 3); assert.equal(v.probe_results, 3);
  assert.ok(v.differs);
});

test("verify: probe skips words already in the learned query", async () => {
  const v = await verify(api(s.base + "/real?q={query:url}", { learned_query: "python robotics" }) as any);
  assert.equal(v.probe_query, "coffee");
});

test("verify: empty results are reported, not passed", async () => {
  const v = await verify(api(s.base + "/real?q={query:url}", { learned_query: "" }) as any);
  assert.equal(v.ok, false);
  assert.match(v.problems.join(), /returned no results/);
});
