// The real bin/pilot and console, run as child processes against a throwaway apis/ dir and a local fake site.
// No network, no LLM, no GBrain (GBRAIN_BIN=false), never `learn`.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { site, api, tmpApis, fixture, FIX } from "./helpers.ts";

const BIN = join(import.meta.dirname, "..", "bin", "pilot");
let s: Awaited<ReturnType<typeof site>>, dir: string, env: NodeJS.ProcessEnv;

before(async () => {
  s = await site();
  const rec = JSON.parse(fixture("recording.json"));
  dir = tmpApis({
    "fx.json": api(s.base + "/real?q={query:url}", { about: "Fixture site" }),
    "fx.recording.json": rec,
    "hard.json": api(s.base + "/hard?q=x", { name: "hard", about: "Hardcoded" }),
    "sum.json": api(s.base + "/real?q={query:url}", { name: "sum", about: "Has summary" }),
    "sum.recording.json": { ...rec, name: "sum", summary: "The top story has 2845 points." },
    "fx.claims.json": { verdicts: [] },
  });
  env = { ...process.env, PILOT_APIS: dir, GBRAIN_BIN: "/usr/bin/false", PILOT_GBRAIN_HOME: mkdtempSync(join(tmpdir(), "pilot-gb-")), NO_COLOR: "1" };
});
after(async () => { await s.close(); });

const pilot = (...args: string[]) => new Promise<{ code: number; out: string; err: string }>((res) =>
  execFile(BIN, args, { env, timeout: 30000 }, (e, out, err) => res({ code: e ? (e as any).code ?? 1 : 0, out, err })));

test("list shows every learned API, never recordings/claims files", async () => {
  const r = await pilot("list");
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.out.trim().split("\n").map((l) => l.trim().split(/\s+/)[0]), ["fx", "hard", "sum"]);
});

test("call: results, timing, and tricky queries (quotes, unicode, &, $&, empty)", async () => {
  const r = await pilot("call", "fx", "gbrain");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /fx\("gbrain"\)\s+\d+ ms/);
  assert.match(r.out, /• gbrain result 1/);
  for (const q of ['say "hi"', "日本語 🚀", "a & b=c", "$& $$", "100%"]) {
    const t = await pilot("call", "fx", q);
    assert.equal(t.code, 0, t.err);
    assert.ok(t.out.includes(`• ${q} result 1`), `${q}: ${t.out}`);
  }
  const e = await pilot("call", "fx", "");
  assert.equal(e.code, 1, "an empty query is a usage error, not a counted call");
  assert.match(e.err, /usage: pilot call/);
});

test("call: unknown / missing / path-like names are UNKNOWN_PILOT, exit 1", async () => {
  const usage = await pilot("call");
  assert.equal(usage.code, 1); assert.match(usage.err, /usage: pilot call/);
  const unknown = await pilot("frobnicate");
  assert.equal(unknown.code, 1); assert.match(unknown.err, /unknown command "frobnicate"/);
  for (const args of [["call", "nope", "x"], ["call", "../x", "q"], ["verify", "nope"], ["custos", "nope", "claim"]]) {
    const r = await pilot(...args);
    assert.equal(r.code, 1, args.join(" "));
    assert.match(r.err, /UNKNOWN_PILOT/, args.join(" "));
  }
});

test("swarm: one query, a file of 50, and none", async () => {
  const one = await pilot("swarm", "fx", "solo");
  assert.equal(one.code, 0, one.err);
  assert.match(one.out, /1 searches in/);
  const fifty = await pilot("swarm", "fx", join(FIX, "fifty.txt"));
  assert.equal(fifty.code, 0, fifty.err);
  assert.match(fifty.out, /50 searches in/);
  assert.equal(fifty.out.split("\n").filter((l) => / ms  /.test(l)).length, 50);
  const none = await pilot("swarm", "fx");
  assert.equal(none.code, 1); assert.match(none.err, /usage: pilot swarm/);
});

test("custos --rules: verdicts printed and tallied from this run; no claims / no summary are INVALID_ARGUMENT", async () => {
  const r = await pilot("custos", "fx", "--rules", "It has 2845 points", "It has 9999 points", "I emailed the results to the team");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /CONFIRMED\s+It has 2845 points/);
  assert.match(r.out, /CONTRADICTED\s+It has 9999 points/);
  assert.match(r.out, /UNPROVEN\s+I emailed/);
  assert.match(r.out, /1 confirmed · 1 contradicted · 1 unproven/);
  assert.equal(JSON.parse(readFileSync(join(dir, "fx.claims.json"), "utf8")).verdicts.length, 3, "ad-hoc claims go to .claims.json");
  const none = await pilot("custos", "fx", "--rules");
  assert.equal(none.code, 1); assert.match(none.err, /usage: pilot custos/);
  const nosum = await pilot("custos", "fx", "--summary");
  assert.equal(nosum.code, 1); assert.match(nosum.err, /INVALID_ARGUMENT: .*no agent summary/);
});

test("verify: real endpoint passes, hardcoded one fails with 'identical results'", async () => {
  const ok = await pilot("verify", "fx");
  assert.equal(ok.code, 0, ok.err); assert.match(ok.out, /✓ fx verified/);
  assert.equal(JSON.parse(readFileSync(join(dir, "fx.json"), "utf8")).verified.ok, true);
  const bad = await pilot("verify", "hard");
  assert.match(bad.out, /identical results/);
});

test("qm: tool.json lists every API; call.mjs runs standalone", async () => {
  const out = mkdtempSync(join(tmpdir(), "pilot-qm-"));
  const r = await pilot("qm", out);
  assert.equal(r.code, 0, r.err);
  const tool = JSON.parse(readFileSync(join(out, "tool.json"), "utf8"));
  assert.equal(tool.id, "pilot"); assert.equal(tool.install.binary, "pilot");
  assert.deepEqual(tool.install.files.map((f: any) => f.to).sort(), ["/usr/local/bin/pilot", "/usr/local/lib/pilot/apis/fx.json", "/usr/local/lib/pilot/apis/hard.json", "/usr/local/lib/pilot/apis/sum.json", "/usr/local/lib/pilot/call.mjs"]);
  for (const f of tool.install.files) assert.ok(existsSync(join(out, f.from)), f.from);
  assert.deepEqual(tool.egress, ["127.0.0.1:" + new URL(s.base).port]);
  const mjs = join(out, "call-local.mjs");
  writeFileSync(mjs, readFileSync(join(out, "call.mjs"), "utf8").replace("/usr/local/lib/pilot/apis", dir));
  const run = (...a: string[]) => new Promise<{ code: number; out: string }>((res) => execFile("node", [mjs, ...a], (e, o) => res({ code: e ? 1 : 0, out: o })));
  const c = await run("call", "fx", "a & b");
  assert.equal(c.code, 0); assert.match(c.out, /1\. a & b result 1/);
  const u = await run("call", "nope", "q");
  assert.equal(u.code, 1); assert.match(u.out, /No learned site called "nope"/);
});

test("river: only runs whose summary custos fully confirmed", async () => {
  const out = join(dir, "v.jsonl");
  writeFileSync(join(dir, "sum.custos.json"), JSON.stringify({ judged_at: "x", claims_from: "summary", verdicts: [{ claim: "c", verdict: "CONFIRMED", request_index: 2, quote: "2845", reason: "r" }] }));
  const r = await pilot("river", out);
  assert.equal(r.code, 0, r.err);
  const lines = readFileSync(out, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => l.source), ["sum"]);
  assert.equal(lines[0].messages[1].content, "The top story has 2845 points.");
});

test("console: every endpoint except /api/learn", async () => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const srv: ChildProcess = spawn("node", [join(import.meta.dirname, "..", "src", "cli.ts"), "console", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  try {
    await new Promise<void>((res, rej) => { srv.stdout!.on("data", (d) => String(d).includes("console on") && res()); srv.on("exit", () => rej(new Error("console exited"))); });
    const base = `http://127.0.0.1:${port}`;
    const get = async (p: string) => { const r = await fetch(base + p); return { status: r.status, body: await r.text() }; };
    const post = async (p: string, b: unknown) => { const r = await fetch(base + p, { method: "POST", body: typeof b === "string" ? b : JSON.stringify(b) }); return { status: r.status, body: JSON.parse(await r.text()) }; };

    const home = await get("/");
    assert.equal(home.status, 200); assert.match(home.body, /<html|<!doctype/i);
    const st = JSON.parse((await get("/api/state")).body);
    assert.deepEqual(st.apis.map((a: any) => a.name), ["fx", "hard", "sum"]);
    const rec = JSON.parse((await get("/api/recording/fx")).body);
    assert.equal(rec.end, 2); assert.equal(rec.requests.length, 3);
    assert.equal((await get("/api/recording/nope")).status, 400, "unknown recording is a caller error");
    assert.equal((await get("/api/verdicts/fx")).status, 200);
    assert.equal((await get("/api/nothing")).status, 404);

    const c = await post("/api/call", { name: "fx", query: "é & \"q\"" });
    assert.equal(c.status, 200); assert.equal(c.body.results[0].title, 'é & "q" result 1'); assert.equal(c.body.data, undefined);
    assert.equal((await post("/api/call", { name: "nope", query: "x" })).status, 400);
    assert.equal((await post("/api/call", { name: "../fx", query: "x" })).status, 400);
    assert.equal((await post("/api/call", { name: "fx" })).status, 400, "missing query");
    const sw = await post("/api/swarm", { name: "fx", queries: ["a", "b", "c"] });
    assert.equal(sw.status, 200); assert.equal(sw.body.runs.length, 3); assert.ok(sw.body.runs.every((r: any) => r.ok));
    assert.equal((await post("/api/swarm", { name: "fx", queries: [] })).status, 400);
    const cu = await post("/api/custos", { name: "fx", claims: ["It has 2845 points"], rules: true });
    assert.equal(cu.status, 200); assert.equal(cu.body.verdicts[0].verdict, "CONFIRMED");
    assert.equal((await post("/api/custos", { name: "fx", rules: true })).status, 400, "no claims");
    assert.equal((await post("/api/custos", { name: "fx", claims: [], rules: true })).status, 400, "0 claims");
    assert.equal((await post("/api/call", "{not json")).status, 400, "malformed JSON body");
  } finally { srv.kill(); }
});
