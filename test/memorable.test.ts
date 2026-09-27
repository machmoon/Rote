// Memorable export: only APIs that passed replay verify and custos (≥1 claim, 0 contradicted) become traces.
// The --send path is not tested: linked() and ingest both spawn `npx memorable-cli`, which is slow and needs network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tmpApis, api } from "./helpers.ts";

const verified = (ok: boolean) => ({
  ok, checked_at: "2026-09-27 12:05", learned_query_results: 3, probe_query: "rust", probe_results: 3, differs: ok, problems: ok ? [] : ["identical results"],
});
const rec = (name: string) => ({
  name, site: "https://example.com/", query: "claude code", driver: "claude", started_at: "2026-09-27T21:16:24.494Z", duration_ms: 30000, end: 1,
  agent: [{ at_ms: 1000, tool: "browser_type", arg: "search box" }, { at_ms: 2000, tool: "press_key", arg: "" }],
  summary: "found three results",
  requests: [
    { i: 0, at_ms: 900, method: "GET", url: "https://example.com/", status: 200, body: "", resp: "" },
    { i: 1, at_ms: 5000, method: "GET", url: "https://api.example.com/search?q=claude+code&key=SECRET", status: 200, body: "", resp: "{\"hits\":[]}" },
  ],
});
const verdicts = (...vs: string[]) => ({
  judged_at: "2026-09-27 12:06", claims_from: "summary",
  verdicts: vs.map((v, i) => ({ claim: `claim ${i}`, verdict: v, request_index: 1, quote: null, reason: "r" })),
});
const set = (name: string, ok: boolean, vs: object | null) => ({
  [`${name}.json`]: api("https://api.example.com/search?q={query:url}", { name, verified: verified(ok) }),
  [`${name}.recording.json`]: rec(name),
  ...(vs ? { [`${name}.custos.json`]: vs } : {}),
});

// APIS and TRACES are read at import time, so set both env vars before loading the module.
const dir = tmpApis({
  ...set("good", true, verdicts("CONFIRMED", "UNPROVEN")),
  ...set("unverified", false, verdicts("CONFIRMED")),
  ...set("unjudged", true, verdicts()),
  ...set("nocustos", true, null),
  ...set("contra", true, verdicts("CONFIRMED", "CONTRADICTED", "CONFIRMED")),
  "norec.json": api("https://x/?q={query:url}", { name: "norec", verified: verified(true) }),
  "norec.custos.json": verdicts("CONFIRMED"),
});
const out = mkdtempSync(join(tmpdir(), "pilot-memorable-"));
process.env.PILOT_APIS = dir;
process.env.PILOT_MEMORABLE_DIR = out;
delete process.env.MEMORABLE_API_URL;
delete process.env.MEMORABLE_API_KEY;
const m = await import("../src/memorable.ts");

test("gate: passes only when verified, recorded, judged and not contradicted", () => {
  assert.equal(m.gate("good"), null);
  assert.equal(m.gate("unverified"), "replay verify has not passed");
  assert.equal(m.gate("norec"), "no recording of the learn run");
  assert.equal(m.gate("unjudged"), "custos has not judged this run");
  assert.equal(m.gate("nocustos"), "custos has not judged this run");
  assert.equal(m.gate("contra"), "custos contradicted 1 of 3 claims");
});

test("trace: Memorable ingest shape, query string stripped, decisive Write and verify steps", () => {
  const t = m.trace("good");
  assert.equal(t.session_id, "pilot-good-2026-09-27T21:16:24.494Z");
  assert.equal(t.harness, "pilot");
  assert.equal(t.started_at, "2026-09-27T21:16:24.494Z");
  assert.match(t.task_description, /https:\/\/example\.com\/.*"claude code"/);
  for (const c of t.tool_calls) assert.deepEqual(Object.keys(c).sort(), ["input", "name", "result"]);
  assert.deepEqual(t.tool_calls.map((c) => c.name), ["browser_navigate", "browser_type", "browser_press_key", "capture_request", "Write", "Bash", "Bash"]);
  assert.deepEqual(t.tool_calls[1].input, { element: "search box" });
  assert.deepEqual(t.tool_calls[2].input, {}, "empty arg → no element");
  const cap = t.tool_calls.find((c) => c.name === "capture_request")!;
  assert.deepEqual(cap.input, { url: "https://api.example.com/search", method: "GET" });
  assert.ok(!(cap.input as { url: string }).url.includes("?"));
  assert.ok(!JSON.stringify(t).includes("SECRET"), "site key in the query string never leaks into the trace");
  assert.ok(t.tool_calls.some((c) => c.name === "Write" && (c.input as { file_path?: string }).file_path === "apis/good.json"));
  const v = t.tool_calls.find((c) => c.name === "Bash" && (c.input as { command?: string }).command === "pilot verify good");
  assert.ok(v, "has a Bash pilot verify step");
  assert.deepEqual(v.result, { ok: true, probe_query: "rust" });
});

test("exportTraces: writes the passing API, skips the rest with reasons, never sends", () => {
  const r = m.exportTraces();
  assert.equal(r.dir, out);
  assert.deepEqual(r.kept, [{ name: "good", file: join(out, "good.trace.json") }]);
  assert.deepEqual(r.skipped.sort(), [
    "contra (custos contradicted 1 of 3 claims)",
    "nocustos (custos has not judged this run)",
    "norec (no recording of the learn run)",
    "unjudged (custos has not judged this run)",
    "unverified (replay verify has not passed)",
  ]);
  assert.equal(r.sendRequested, false);
  assert.equal(r.linked, undefined);
  assert.deepEqual(readdirSync(out), ["good.trace.json"]);
  const written = JSON.parse(readFileSync(join(out, "good.trace.json"), "utf8"));
  assert.deepEqual(written, m.trace("good"));
  assert.equal(written.tool_calls.find((c: { name: string }) => c.name === "capture_request").input.url, "https://api.example.com/search");
});

test("exportTraces: `only` restricts the set", () => {
  const r = m.exportTraces(["unverified", "contra"]);
  assert.deepEqual(r.kept, []);
  assert.deepEqual(r.skipped, ["unverified (replay verify has not passed)", "contra (custos contradicted 1 of 3 claims)"]);
});

test("exportTraces: unknown name → UNKNOWN_PILOT", () => {
  assert.throws(() => m.exportTraces(["good", "nope"]), (e: any) => e.code === "UNKNOWN_PILOT" && /"nope"/.test(e.message));
});
