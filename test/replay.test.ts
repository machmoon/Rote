import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { fill, fillBody, items, total, rawCall } from "../src/replay.ts";
import { PilotError } from "../src/errors.ts";
import { site, api, fixture } from "./helpers.ts";

test("fill: {query:url} is percent-encoded, {query:raw} is verbatim", () => {
  assert.equal(fill("https://s/?q={query:url}", "a b&c=d/é"), "https://s/?q=a%20b%26c%3Dd%2F%C3%A9");
  assert.equal(fill("x={query:raw}", "a b&c"), "x=a b&c");
  assert.equal(fill("{query:url}|{query:url}", "x y"), "x%20y|x%20y");
});

test("fill: $-patterns in the query are not expanded (String.replace gotcha)", () => {
  assert.equal(fill("q={query:raw}", "a$&b $1 $$ $'"), "q=a$&b $1 $$ $'");
  assert.equal(fill("q={query:url}", "$&"), "q=%24%26");
});

test("fill: body gets the JSON-escaped query, so quotes/backslashes/newlines stay valid JSON", () => {
  const body = '{"query":"{query:raw}","page":0}';
  for (const q of ['say "hi"', "back\\slash", "line\nbreak", "日本語 🚀", "", "a & b"]) {
    const filled = fill(body, JSON.stringify(q).slice(1, -1));
    assert.equal(JSON.parse(filled).query, q, `round-trip ${JSON.stringify(q)}`);
  }
});

test("fillBody: {query:raw} after '=' (Algolia params / form value) is URL-encoded, so '&' can't split params", () => {
  const yc = '{"requests":[{"indexName":"X","params":"hitsPerPage=10&query={query:raw}&tagFilters="}]}';
  const p = new URLSearchParams(JSON.parse(fillBody(yc, 'ai & robotics "q" 100%')).requests[0].params);
  assert.equal(p.get("query"), 'ai & robotics "q" 100%');
  assert.equal(p.get("tagFilters"), "");
  assert.equal(JSON.parse(fillBody('{"q":"{query:url}"}', 'say "hi"')).q, "say%20%22hi%22", "url form uses the plain query, not the JSON-escaped one");
  assert.equal(JSON.parse(fillBody('{"q":"{query:raw}"}', 'say "hi" $&')).q, 'say "hi" $&');
});

test("items: Algolia-shaped response → titles + points, dedup, short titles dropped", () => {
  const r = items(JSON.parse(fixture("algolia.json")));
  assert.deepEqual(r.map((x) => x.title), ["Claude Code is generally available", "Show HN: GBrain, a second brain for agents", "Ask HN: What are you using Claude Code for?"]);
  assert.equal(r[0].detail, "2845 points");
  assert.equal(r[2].detail, "0 points");
  assert.equal(total(JSON.parse(fixture("algolia.json"))), 1234);
  assert.equal(total({ results: [{ nbHits: 7 }] }), 7);
  assert.equal(total({}), undefined);
});

test("items: YouTube-shaped response → runs/simpleText titles, view counts, id-less nodes skipped", () => {
  const d = JSON.parse(fixture("youtube.json"));
  const r = items(d);
  assert.deepEqual(r, [
    { title: "Claude Code in 100 seconds", detail: "1,204,332 views" },
    { title: "Building agents with MCP", detail: "88K views" },
  ]);
  assert.equal(total(d), "98000");
});

test("items: n cap and junk input", () => {
  assert.equal(items(JSON.parse(fixture("algolia.json")), 1).length, 1);
  assert.deepEqual(items(null), []);
  assert.deepEqual(items("str"), []);
  assert.deepEqual(items([[[]]]), []);
});

let s: Awaited<ReturnType<typeof site>>;
before(async () => { s = await site(); });
after(async () => { await s.close(); });

const code = async (path: string) => {
  try { await rawCall(api(s.base + path), "q"); return "OK"; }
  catch (e) { assert.ok(e instanceof PilotError, String(e)); return (e as PilotError).code; }
};

test("rawCall: HTTP status → error taxonomy", async () => {
  assert.equal(await code("/429"), "RATE_LIMITED");
  assert.equal(await code("/403"), "BLOCKED");
  assert.equal(await code("/401"), "BLOCKED");
  assert.equal(await code("/500"), "PILOT_BROKEN");
  assert.equal(await code("/nope"), "PILOT_BROKEN");
  assert.equal(await code("/text"), "INVALID_SOURCE_RESPONSE");
  assert.equal(await code("/empty"), "INVALID_SOURCE_RESPONSE");
});

test("rawCall: raw gzip body (no content-encoding) is gunzipped; plain JSON parses", async () => {
  const g = await rawCall(api(s.base + "/gzip"), "q");
  assert.equal(items(g.data)[0].title, "gzipped hit");
  const j = await rawCall(api(s.base + "/json"), "q");
  assert.equal(total(j.data), 1234);
  assert.ok(j.ms >= 0);
});

test("rawCall: unreachable host → SOURCE_UNAVAILABLE, errors carry the pilot name", async () => {
  await assert.rejects(rawCall(api("http://127.0.0.1:1/x"), "q"), (e: PilotError) => e.code === "SOURCE_UNAVAILABLE" && e.pilot === "fx");
});

test("rawCall: url query encoded, POST body JSON-escaped end to end", async () => {
  await rawCall(api(s.base + "/real?q={query:url}"), 'a&b "c" é');
  assert.equal(new URL(s.seen.at(-1)!.url, "http://x").searchParams.get("q"), 'a&b "c" é');
  const r = await rawCall(api(s.base + "/body", { method: "POST", body: '{"query":"{query:raw}"}', headers: { "content-type": "application/json" } }), 'say "hi" \\ 🚀');
  assert.equal(items(r.data)[0].title, 'body:say "hi" \\ 🚀');
  assert.equal(s.seen.at(-1)!.method, "POST");
});

test("rawCall: a raw placeholder in a URL query value is encoded, path placeholders untouched", async () => {
  await rawCall(api(s.base + "/real?q={query:raw}&x=1"), "a&b=c #1");
  const u = new URL(s.seen.at(-1)!.url, "http://x");
  assert.equal(u.searchParams.get("q"), "a&b=c #1"); assert.equal(u.searchParams.get("x"), "1");
});
