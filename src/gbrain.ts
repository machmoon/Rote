// GBrain is Pilot's shared memory: every learned API and every custos verdict is written into the brain as a page, and
// `pilot ask` asks the brain which learned API answers a question, then calls it (no browser, no model).
// Verbs come from garrytan/gbrain itself (~/Desktop/Coding/gbrain-src, v0.59): `put <slug>` reads markdown on stdin
// (src/core/operations.ts put_page), `link <from> <to> --link-type T` (link_add), and `query <q> --no-expand --json`
// (hybrid keyword+vector RRF, src/commands/query) returns [{slug, title, type, score, chunk_text}]. `search` with AND-ed
// tsvector terms misses natural questions ("what is hacker news saying about gbrain"), so routing uses `query`.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fail } from "./errors.ts";
import { type CallResult, call } from "./replay.ts";
import { page as writePage, status } from "./share.ts";
import { APIS, loadApi, loadVerdicts, names } from "./store.ts";

const BUN_BIN = join(homedir(), ".bun", "bin");
export const GBRAIN = process.env.GBRAIN_BIN ?? (existsSync(join(BUN_BIN, "gbrain")) ? join(BUN_BIN, "gbrain") : "gbrain");
// Pilot's own brain unless told otherwise. Pat's ~/.gbrain refuses writes after a volume remount changed its device id
// (gbrain src/core/persistence/physical-root-record.ts: recovery_required; fixing it is an operator-only writer transfer).
export const BRAIN_HOME = process.env.PILOT_GBRAIN_HOME ?? process.env.GBRAIN_HOME ?? join(homedir(), ".gbrain-pilot");
export const slugFor = (name: string) => `learned-apis/${name}`;
export const proofSlug = (name: string) => `proofs/${name}`;

export function gbrain(args: string[], stdin?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(GBRAIN, args, { env: { ...process.env, GBRAIN_HOME: BRAIN_HOME, PATH: `${BUN_BIN}:${process.env.PATH}` }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("error", (e) => resolve({ code: 127, stdout, stderr: e.message }));
    p.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    p.stdin.end(stdin ?? "");
  });
}

const errText = (r: { stdout: string; stderr: string }) => (r.stderr.match(/Error \[[^\]]+\]:[^\n]*/)?.[0] ?? (r.stderr || r.stdout).trim().split("\n").pop() ?? "").slice(0, 240);

function proofPage(name: string): string | null {
  const v = loadVerdicts(name);
  if (!v?.verdicts.length) return null;
  const s = status(name), api = loadApi(name);
  return `---
title: custos verdicts for ${name} (${api.site})
type: custos-proof
tags: [custos, proof, ${name}]
api: ${slugFor(name)}
judged: ${v.judged_at}
confirmed: ${s.confirmed}
claims: ${s.claims}
proven: ${s.proven}
---

# custos verdicts for ${name}

Checked ${v.judged_at}: ${s.confirmed} of ${s.claims} claims CONFIRMED, ${s.contradicted} CONTRADICTED, ${s.unproven} UNPROVEN, each against the recording of the HTTP requests the learning agent made. See [[${slugFor(name)}]].

${v.verdicts.map((x) => `- **${x.verdict}** ${x.claim}${x.verdict !== "UNPROVEN" ? ` — request [${x.request_index}] quoted \`${x.quote}\`` : ""}. ${x.reason}`).join("\n")}
`;
}

/** Write the API page and its custos verdicts into GBrain and link them. --force: Pilot regenerates these pages from apis/,
 *  so it owns every revision. Never throws: Pilot works without GBrain. */
export async function remember(name: string): Promise<{ ok: boolean; slugs: string[]; error?: string }> {
  const file = join(APIS, `${name}.md`);
  const md = readFileSync(existsSync(file) ? file : await writePage(name), "utf8");
  const put = await gbrain(["put", slugFor(name), "--force"], md);
  if (put.code !== 0) return { ok: false, slugs: [], error: errText(put) };
  const slugs = [slugFor(name)];
  const proof = proofPage(name);
  if (proof) {
    const pp = await gbrain(["put", proofSlug(name), "--force"], proof);
    if (pp.code !== 0) return { ok: false, slugs, error: errText(pp) };
    await gbrain(["link", proofSlug(name), slugFor(name), "--link-type", "discusses", "--link-source", "pilot"]); // a type gbrain-base-v2 declares
    slugs.push(proofSlug(name));
  }
  return { ok: true, slugs };
}

/** share.page, then into GBrain. cli.ts imports this as `page` so learn / custos / pages all land in the brain. */
export async function page(name: string): Promise<string> {
  const path = await writePage(name);
  const r = await remember(name);
  process.stderr.write(r.ok ? `  gbrain: ${r.slugs.join(", ")} written to ${BRAIN_HOME}\n` : `  gbrain: not written (${r.error})\n`);
  return path;
}

interface Hit { slug: string; title: string; type: string; score: number; chunk_text?: string }

export async function route(question: string): Promise<{ name: string; hit: Hit; hits: Hit[] }> {
  const r = await gbrain(["query", question, "--no-expand", "--json", "--limit", "10"]);
  if (r.code !== 0) throw fail("SOURCE_UNAVAILABLE", `gbrain query failed: ${errText(r)}`);
  let rows: Hit[];
  try { rows = JSON.parse(r.stdout.slice(r.stdout.indexOf("["))); } catch { throw fail("INVALID_SOURCE_RESPONSE", `gbrain query returned no JSON: ${r.stdout.slice(0, 200)}`); }
  const known = new Set(names());
  const hits = rows.filter((h) => h.slug.startsWith("learned-apis/") && known.has(h.slug.slice(13)));
  if (!hits.length) throw fail("UNKNOWN_PILOT", `GBrain knows no learned API for "${question}". Learned: ${[...known].join(", ") || "none"}. Try: pilot learn <name> <url> "<query>"`);
  return { name: hits[0].slug.slice(13), hit: hits[0], hits };
}

// Filler (question words, verbs of asking) and generic result nouns: none of them is ever what the user is searching for.
const STOP = new Set(("a an and any are about at be best by can could do does doing for from find get give has have how i in is it " +
  "latest list look looking me most my new newest of on or please popular recent say saying says search searching show some tell that the " +
  "their them there these this to top up what whats which who why with would you " +
  "post posts story stories article articles result results item items thread threads link links discussion discussions " +
  "company companies startup startups video videos page pages site sites website websites directory api apis").split(" "));

const norm = (w: string) => w.toLowerCase().replace(/[\u2019']s$/, "").replace(/[^a-z0-9+#.-]/g, "").replace(/^[.-]+|[.-]+$/g, "");

/** Pure core of searchTerm: keep the content words that are neither filler nor words naming the site itself. */
export function termFrom(question: string, siteText: string): string {
  const site = new Set(siteText.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1));
  const words = question.split(/\s+/).map((w) => [w, norm(w)] as const).filter(([, k]) => k);
  const kept = words.filter(([, k]) => !STOP.has(k) && !site.has(k)).map(([w]) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu, ""));
  if (kept.length) return kept.join(" ");
  const last = [...words].reverse().find(([, k]) => !STOP.has(k)) ?? words.at(-1);
  return last ? last[1] : question.trim();
}

/** Turn a question into the search term for the routed API, using the site's name, host and description as site words. */
export function searchTerm(question: string, name: string): string {
  const a = loadApi(name);
  return termFrom(question, `${name} ${a.site} ${a.about ?? ""}`);
}

export async function ask(question: string, opts: { query?: string } = {}): Promise<{ route: Awaited<ReturnType<typeof route>>; route_ms: number; result: CallResult; proven: boolean; confirmed: string }> {
  const t = performance.now();
  const rt = await route(question);
  const route_ms = performance.now() - t;
  const result = await call(rt.name, opts.query ?? searchTerm(question, rt.name));
  const s = status(rt.name);
  return { route: rt, route_ms, result, proven: s.proven, confirmed: `${s.confirmed}/${s.claims}` };
}
