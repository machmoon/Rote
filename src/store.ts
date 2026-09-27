// Everything Pilot knows lives as plain files in apis/: <name>.json (the API), <name>.recording.json (the proof),
// <name>.custos.json (the verdicts), <name>.md (the GBrain page). Plain files so teammates, GBrain and QM can share them.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fail } from "./errors.ts";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const APIS = process.env.PILOT_APIS ?? join(ROOT, "apis");

export interface Api {
  name: string;
  site: string;
  method: string;
  url: string;          // {query:url} / {query:raw} placeholders
  body: string;         // {query:raw} placeholder, JSON-escaped on fill
  headers: Record<string, string>;
  learned_query: string;
  driver: "claude" | "typer" | "manual";
  browser_seconds: number;
  requests_seen: number;
  learned_at: string;
  about?: string;
  verified?: Verification;
}

export interface Verification {
  ok: boolean;
  checked_at: string;
  learned_query_results: number;
  probe_query: string;
  probe_results: number;
  differs: boolean;
  problems: string[];
}

export interface RecordedRequest {
  i: number;
  at_ms: number;        // ms since the run started, for replay
  method: string;
  url: string;
  status: number;
  body: string;         // request body
  resp: string;         // JSON response text ("" if not JSON)
}

export interface AgentStep {
  at_ms: number;
  tool: string;
  arg: string;
}

export interface Recording {
  name: string;
  site: string;
  query: string;
  driver: string;
  started_at: string;
  duration_ms: number;
  end: number;          // index of the request that carried the answer
  requests: RecordedRequest[];
  agent: AgentStep[];   // the driver's tool calls, timestamped
  summary: string;      // what the agent said it found
}

export interface Verdict {
  claim: string;
  verdict: "CONFIRMED" | "CONTRADICTED" | "UNPROVEN";
  request_index: number | null;
  quote: string | null;
  reason: string;
  grounded?: boolean;
}

const p = (name: string, ext: string) => join(APIS, `${name}${ext}`);
const readJson = <T>(f: string): T => JSON.parse(readFileSync(f, "utf8"));

export function names(): string[] {
  if (!existsSync(APIS)) return [];
  return readdirSync(APIS).filter((f) => /^[a-z0-9_-]+\.json$/i.test(f)).map((f) => f.slice(0, -5)).sort();
}
export function loadApi(name: string): Api {
  if (typeof name !== "string" || !/^[\w-]+$/.test(name) || !existsSync(p(name, ".json"))) throw fail("UNKNOWN_PILOT", `No learned API called "${name}". Try: pilot list`, name);
  return readJson<Api>(p(name, ".json"));
}
export const saveApi = (a: Api) => (mkdirSync(APIS, { recursive: true }), writeFileSync(p(a.name, ".json"), JSON.stringify(a, null, 1)));
export const hasRecording = (name: string) => existsSync(p(name, ".recording.json"));
export const loadRecording = (name: string) => {
  if (typeof name !== "string" || !/^[\w-]+$/.test(name) || !hasRecording(name)) throw fail("UNKNOWN_PILOT", `No recording for "${name}". Try: pilot list`, name);
  return readJson<Recording>(p(name, ".recording.json"));
};
export const saveRecording = (r: Recording) => writeFileSync(p(r.name, ".recording.json"), JSON.stringify(r));
// <name>.custos.json = verdicts on the agent's own summary (the proof that counts);
// <name>.claims.json = ad-hoc claims someone asked about, kept apart so they never overwrite the proof.
type Verdicts = { judged_at: string; claims_from: string; verdicts: Verdict[] };
const vfile = (name: string, from: string) => p(name, from === "summary" ? ".custos.json" : ".claims.json");
export const loadVerdicts = (name: string, from = "summary"): Verdicts | null => existsSync(vfile(name, from)) ? readJson(vfile(name, from)) : null;
export const saveVerdicts = (name: string, v: Verdicts) => writeFileSync(vfile(name, v.claims_from), JSON.stringify(v, null, 1));
export const writePage = (name: string, md: string) => writeFileSync(p(name, ".md"), md);

export function logCall(name: string, ms: number) {
  try { appendFileSync(p(name, ".calls.log"), `${Date.now()} ${ms.toFixed(1)}\n`); } catch { /* read-only install (QM sandbox) */ }
}
export function calls(name: string): number[] {
  try { return readFileSync(p(name, ".calls.log"), "utf8").trim().split("\n").filter(Boolean).map((l) => Number(l.split(" ")[1])); }
  catch { return []; }
}
export const stamp = () => new Date().toLocaleString("sv-SE", { hour12: false }).slice(0, 16);
