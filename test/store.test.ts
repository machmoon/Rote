import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpApis, api, fixture } from "./helpers.ts";

// APIS is read at import time, so point it at a throwaway dir before loading store.
const dir = tmpApis({
  "hn.json": api("https://x/?q={query:url}", { name: "hn" }),
  "yt.json": api("https://y/?q={query:url}", { name: "yt" }),
  "hn.recording.json": fixture("recording.json"),
  "hn.custos.json": { verdicts: [] },
  "hn.md": "# page", "hn.calls.log": "1 12.5\n2 7.5\n",
  "package-lock.json": "{}", ".hidden.json": "{}", "notes.txt": "x", "a.b.json": "{}",
});
process.env.PILOT_APIS = dir;
const store = await import("../src/store.ts");

test("names: only <name>.json, never recordings/verdicts/pages/logs", () => {
  assert.deepEqual(store.names(), ["hn", "package-lock", "yt"]);
});

test("loadApi: unknown name → UNKNOWN_PILOT", () => {
  assert.equal(store.loadApi("hn").name, "hn");
  assert.throws(() => store.loadApi("nope"), (e: any) => e.code === "UNKNOWN_PILOT");
});

test("calls: parses the log; missing log → []", () => {
  assert.deepEqual(store.calls("hn"), [12.5, 7.5]);
  assert.deepEqual(store.calls("yt"), []);
  store.logCall("yt", 3.26);
  assert.deepEqual(store.calls("yt"), [3.3], "logged to 0.1 ms");
});
