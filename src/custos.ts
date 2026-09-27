// custos: check what an agent claims against what it actually did.
// Claim splitting: RAGAS src/ragas/metrics/_faithfulness.py ("no pronouns", self-contained statements).
// Verdicts: DeepEval deepeval/metrics/faithfulness/templates/generate_verdicts.txt (yes/no/borderline, one per claim),
// mapped to CONFIRMED / CONTRADICTED / UNPROVEN, plus a citation that we check ourselves (the grounding guard).
import { spawn } from "node:child_process";
import { fail } from "./errors.ts";
import { CLAUDE, claudeEnv } from "./learn.ts";
import { type Recording, type Verdict, loadRecording, saveVerdicts, stamp } from "./store.ts";

export async function claudeJson<T>(prompt: string, schema: object, model = process.env.PILOT_JUDGE_MODEL ?? "sonnet"): Promise<T> {
  const proc = spawn(CLAUDE, ["-p", "--output-format", "json", "--json-schema", JSON.stringify(schema), "--tools", "", "--disable-slash-commands", "--model", model],
    { env: claudeEnv(), stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  proc.stdout.on("data", (d) => (stdout += d));
  proc.stderr.on("data", (d) => (stderr += d));
  proc.stdin.end(prompt);
  await new Promise((r) => proc.on("close", r));
  let d: any;
  try { d = JSON.parse(stdout); } catch { throw fail("AI_REQUEST_FAILED", `judge returned no JSON: ${(stderr || stdout).slice(0, 300)}`); }
  if (d.is_error || !d.structured_output) throw fail("AI_REQUEST_FAILED", `judge failed: ${String(d.result).slice(0, 300)}`);
  return d.structured_output as T;
}

function compact(resp: string, cap: number) {
  // drop bookkeeping keys, and put each object's scalar fields (counts like nbHits, facets) before its big arrays,
  // so truncation eats the tail of a hits list, not the totals the agent quotes
  const strip = (o: any): any => {
    if (Array.isArray(o)) return o.map(strip);
    if (!o || typeof o !== "object") return o;
    const kept = Object.entries(o).filter(([k]) => !/^(_|tracking|clickTracking|thumbnail)/.test(k));
    const weight = (v: unknown) => (v && typeof v === "object" ? (Array.isArray(v) ? 2 : 1) : 0);
    return Object.fromEntries(kept.sort((a, b) => weight(a[1]) - weight(b[1])).map(([k, v]) => [k, strip(v)]));
  };
  try { return JSON.stringify(strip(JSON.parse(resp))).slice(0, cap); } catch { return resp.slice(0, cap); }
}

/** Numbered index of the recording; the end request (what the agent saw) gets the biggest share of the budget. */
export function evidence(rec: Recording, budget = 90000) {
  const shown = new Map<number, string>();
  rec.requests.forEach((r) => r.resp && shown.set(r.i, compact(r.resp, r.i === rec.end ? 40000 : 4000)));
  const size = () => [...shown.values()].reduce((a, s) => a + s.length, 0);
  while (size() > budget && shown.size > 1) {
    const k = [...shown.keys()].filter((k) => k !== rec.end).sort((a, b) => shown.get(a)!.length - shown.get(b)!.length)[0];
    shown.delete(k);
  }
  const lines = rec.requests.flatMap((r) => [
    `[${r.i}] ${r.method} ${r.url.slice(0, 160)} -> ${r.status}${r.i === rec.end ? " (the results the agent saw)" : ""}`,
    ...(shown.has(r.i) ? [`    ${shown.get(r.i)}`] : []),
  ]);
  return { text: lines.join("\n"), shown };
}

const SPLIT = `Break the AI agent's output below into atomic, self-contained factual claims about what the agent did or what the website returned.
Break each sentence into one or more fully understandable statements. Use no pronouns: replace "it/they/this" with the concrete site, title, field or value, so each claim stands alone.
Keep each claim's full context (which result, which value); don't cherry-pick. Take the text at face value, add no prior knowledge, ignore whether the claims are true. Skip pleasantries and relative dates ("4 months ago").

AI output:
`;
const JUDGE = (ev: string, claims: string[]) => `You are custos. You are given CLAIMS an AI browser agent made and EVIDENCE: a numbered list of every HTTP request recorded while the agent worked ([0], [1], ...), with trimmed JSON responses.
Return exactly ONE verdict per claim, in order; the number of verdicts MUST equal the number of claims.
- CONFIRMED: an evidence entry directly supports the claim. A faithful paraphrase counts, and so does a label the page displays that comes from a recorded field (e.g. a tag shown on the page that comes from a subcategory field); cite that field.
- CONTRADICTED: an evidence entry materially conflicts with the claim: a different number, count, name, title or entity. Wording, casing and field-naming differences are not contradictions.
- UNPROVEN: no entry supports or refutes the claim, or the claim is vague. Actions the agent says it took (emailing, booking, buying) need a request that did them; absence of evidence is UNPROVEN, not CONTRADICTED.
Never use prior knowledge.
request_index is the entry you relied on (null if UNPROVEN). quote is a SHORT verbatim substring copied character-for-character from that entry (e.g. "points":2445), null if UNPROVEN. reason is one short sentence; for CONTRADICTED give the recorded value.

EVIDENCE:
${ev}

CLAIMS:
${JSON.stringify(claims, null, 1)}`;

const VERDICTS = { type: "object", required: ["verdicts"], properties: { verdicts: { type: "array", items: { type: "object",
  required: ["claim", "verdict", "request_index", "quote", "reason"], properties: {
    claim: { type: "string" }, verdict: { enum: ["CONFIRMED", "CONTRADICTED", "UNPROVEN"] },
    request_index: { type: ["integer", "null"] }, quote: { type: ["string", "null"] }, reason: { type: "string" } } } } } };

/** Grounding guard: CONFIRMED / CONTRADICTED stands only if the quote really is in the cited request. */
export function ground(v: Verdict, rec: Recording, shown: Map<number, string>): Verdict {
  if (v.verdict === "UNPROVEN") return v;
  const i = v.request_index, q = (v.quote ?? "").trim();
  const r = typeof i === "number" ? rec.requests[i] : undefined;
  const ok = !!r && q.length >= 2 && ((shown.get(r.i) ?? "").includes(q) || r.resp.includes(q) || r.url.includes(q));
  return ok ? { ...v, grounded: true } : { ...v, verdict: "UNPROVEN", grounded: false, reason: `downgraded: the judge cited [${i}] ${JSON.stringify(q.slice(0, 40))}, which is not in that request` };
}

export async function splitClaims(text: string): Promise<string[]> {
  return (await claudeJson<{ claims: string[] }>(SPLIT + text, { type: "object", required: ["claims"], properties: { claims: { type: "array", items: { type: "string" } } } })).claims;
}

export function rules(claims: string[], rec: Recording): Verdict[] {
  // offline fallback: quoted strings and numbers must appear in a recorded response
  const ev = rec.requests.map((r) => r.resp).join("\n");
  return claims.map((c) => {
    const nums = (c.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replaceAll(",", ""));
    const quoted = [...c.matchAll(/['"“]([^'"”]+)['"”]/g)].map((m) => m[1]);
    const hit = rec.requests.find((r) => r.resp && [...quoted, ...nums].every((x) => new RegExp(`(?<!\\d)${x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\d)`).test(r.resp)));
    if ((quoted.length || nums.length) && hit) return { claim: c, verdict: "CONFIRMED", request_index: hit.i, quote: [...quoted, ...nums][0], reason: "found in a recorded response" };
    const miss = nums.find((n) => !new RegExp(`(?<!\\d)${n.replaceAll(".", "\\.")}(?!\\d)`).test(ev)); // digit-bounded, like the CONFIRMED check
    if (miss) return { claim: c, verdict: "CONTRADICTED", request_index: rec.end, quote: null, reason: `no recorded response contains ${miss}` };
    return { claim: c, verdict: "UNPROVEN", request_index: null, quote: null, reason: "nothing in the recording supports or refutes this" };
  });
}

export async function custos(name: string, claims: string[] | "summary", opts: { rules?: boolean } = {}) {
  const rec = loadRecording(name);
  const from = claims === "summary" ? "summary" : "claims";
  if (claims === "summary" && !rec.summary?.trim()) throw fail("INVALID_ARGUMENT", `the ${name} recording has no agent summary; pass claims instead`, name);
  const list = claims === "summary" ? await splitClaims(rec.summary) : claims;
  if (!Array.isArray(list) || !list.length) throw fail("INVALID_ARGUMENT", "no claims to check");
  let verdicts: Verdict[];
  if (opts.rules) verdicts = rules(list, rec);
  else {
    const { text, shown } = evidence(rec);
    const out = (await claudeJson<{ verdicts: Verdict[] }>(JUDGE(text, list), VERDICTS)).verdicts;
    verdicts = list.map((c, k) => out[k] ? ground({ ...out[k], claim: c }, rec, shown)
      : { claim: c, verdict: "UNPROVEN", request_index: null, quote: null, reason: "the judge returned no verdict" });
  }
  const result = { name, judged_at: stamp(), claims_from: from, judge: opts.rules ? "rules" : "llm", requests: rec.requests.length, verdicts };
  saveVerdicts(name, result);
  return result;
}
