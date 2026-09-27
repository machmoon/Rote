import { test } from "node:test";
import assert from "node:assert/strict";
import { ground, evidence, rules } from "../src/custos.ts";
import type { Recording, Verdict } from "../src/store.ts";
import { fixture } from "./helpers.ts";

const rec = (): Recording => JSON.parse(fixture("recording.json"));
const v = (x: Partial<Verdict>): Verdict => ({ claim: "c", verdict: "CONFIRMED", request_index: 2, quote: '"points":2845', reason: "r", ...x });

test("ground: a real quote from the cited request stands", () => {
  const r = rec(), { shown } = evidence(r);
  const g = ground(v({}), r, shown);
  assert.equal(g.verdict, "CONFIRMED"); assert.equal(g.grounded, true);
  assert.equal(ground(v({ verdict: "CONTRADICTED", quote: "Claude Code is generally available" }), r, shown).verdict, "CONTRADICTED");
  assert.equal(ground(v({ quote: "q=claude%20code" }), r, shown).grounded, true, "a quote from the URL counts");
});

test("ground: fabricated quote, wrong request, bad index, empty quote → UNPROVEN", () => {
  const r = rec(), { shown } = evidence(r);
  const cases: Partial<Verdict>[] = [
    { quote: '"points":9999' },                 // fabricated
    { request_index: 1 },                       // quote is real but not in [1]
    { request_index: 99 }, { request_index: -1 }, { request_index: null },
    { quote: "" }, { quote: "   " }, { quote: null }, { quote: "2" },
  ];
  for (const c of cases) {
    const g = ground(v(c), r, shown);
    assert.equal(g.verdict, "UNPROVEN", JSON.stringify(c)); assert.equal(g.grounded, false);
    assert.match(g.reason, /^downgraded/);
  }
});

test("ground: UNPROVEN passes through untouched", () => {
  const r = rec(), u = v({ verdict: "UNPROVEN", request_index: null, quote: null });
  assert.deepEqual(ground(u, r, evidence(r).shown), u);
});

test("evidence: numbered index, end request marked, requests without JSON listed but not shown", () => {
  const { text, shown } = evidence(rec());
  assert.match(text, /^\[0\] GET https:\/\/hn.algolia.com\/ -> 200$/m);
  assert.match(text, /\[2\] POST .* -> 200 \(the results the agent saw\)/);
  assert.deepEqual([...shown.keys()], [1, 2]);
  assert.ok(!shown.get(2)!.includes("_highlightResult"), "underscore keys stripped");
});

test("evidence: over budget, small side requests go first and the end request is always kept", () => {
  const r = rec();
  const big = JSON.stringify({ hits: Array.from({ length: 400 }, (_, k) => ({ title: `noise ${k}`, objectID: k })) });
  r.requests.push({ i: 3, at_ms: 1, method: "GET", url: "https://x/big", status: 200, body: "", resp: big });
  r.requests.push({ i: 4, at_ms: 2, method: "GET", url: "https://x/small", status: 200, body: "", resp: '{"a":1}' });
  const all = evidence(r, 1e9).shown;
  assert.equal(all.get(3)!.length, 4000, "side requests capped at 4000 chars");
  const { shown } = evidence(r, all.get(2)!.length + all.get(3)!.length);
  assert.ok(shown.has(2) && shown.has(3) && !shown.has(4) && !shown.has(1));
  const tiny = evidence(r, 10).shown;
  assert.deepEqual([...tiny.keys()], [2], "even an impossible budget keeps the end request");
});

test("evidence: end request with no JSON body doesn't loop forever", () => {
  const r = rec(); r.end = 0;
  const { shown } = evidence(r, 10);
  assert.equal(shown.size, 1);
});

test("rules: numbers and quoted strings must appear in a recorded response", () => {
  const out = rules([
    "It has 2845 points",
    'The top story is "Claude Code is generally available"',
    "It has 2,845 points",
    "It has 9999 points",
    "I emailed the results to the team",
    "There were 284 comments",          // 284 is a prefix of 2845: must not match
  ], rec());
  assert.deepEqual(out.map((x) => x.verdict), ["CONFIRMED", "CONFIRMED", "CONFIRMED", "CONTRADICTED", "UNPROVEN", "CONTRADICTED"]);
  assert.equal(out[0].request_index, 2);
  assert.equal(out[3].request_index, rec().end);
  assert.equal(out[4].request_index, null);
});

test("rules: zero claims → zero verdicts; regex metacharacters in quotes are safe", () => {
  assert.deepEqual(rules([], rec()), []);
  assert.equal(rules(['the title "a(b" [x'], rec())[0].verdict, "UNPROVEN");
});
