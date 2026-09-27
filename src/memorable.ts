// Memorable: every learned API becomes a Memorable procedure, so the next agent recalls "how to search this site"
// instead of re-deriving it. Trace shape is Memorable's generic harness input, read from memorable-cli@0.5.30
// dist/cli.js (`memorable ingest`): {session_id, task_description, harness, tool_calls: [{name, input, result?}]}.
// Memorable refuses a trace with no write/execute step ("the session only read and searched", reason
// no_decisive_steps), so the trace carries the two decisive things learn really did: write apis/<name>.json, run verify.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fail } from "./errors.ts";
import { status } from "./share.ts";
import { ROOT, hasRecording, loadApi, loadRecording, names } from "./store.ts";

export const TRACES = process.env.PILOT_MEMORABLE_DIR ?? join(ROOT, "memorable");

/** Same bar as the rest of Pilot: the replay probe passed and custos contradicted nothing the agent said. */
export function gate(name: string) {
  const api = loadApi(name), s = status(name);
  if (!api.verified?.ok) return `replay verify has not passed`;
  if (!hasRecording(name)) return `no recording of the learn run`;
  if (s.claims === 0) return `custos has not judged this run`;
  if (s.contradicted > 0) return `custos contradicted ${s.contradicted} of ${s.claims} claims`;
  return null;
}

export function trace(name: string) {
  const api = loadApi(name), rec = loadRecording(name), carrier = rec.requests[rec.end];
  const bare = (u: string) => u.split("?")[0];   // query strings can carry site keys; the procedure only needs the endpoint
  return {
    session_id: `pilot-${name}-${rec.started_at}`,
    task_description: `search ${api.site} for "${api.learned_query}" and turn the result request into a reusable API`,
    harness: "pilot",
    started_at: rec.started_at,
    tool_calls: [
      { name: "browser_navigate", input: { url: api.site }, result: { ok: true } },
      ...rec.agent.map((s) => ({ name: `browser_${s.tool.replace(/^browser_/, "")}`, input: s.arg ? { element: s.arg } : {}, result: { ok: true } })),
      { name: "capture_request", input: { url: bare(carrier.url), method: carrier.method }, result: { ok: true, status: carrier.status } },
      { name: "Write", input: { file_path: `apis/${name}.json` }, result: { ok: true } },
      { name: "Bash", input: { command: `pilot verify ${name}` }, result: { ok: api.verified!.ok, probe_query: api.verified!.probe_query } },
      { name: "Bash", input: { command: `pilot call ${name} "<query>"` }, result: { ok: true } },
    ],
  };
}

const cli = (args: string[]) => spawnSync("npx", ["-y", "memorable-cli@latest", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** Memorable is linked when `memorable status` reports a login, or the harness env pair is set (as the CLI itself reads it). */
export function linked() {
  if (process.env.MEMORABLE_API_URL && process.env.MEMORABLE_API_KEY) return true;
  const r = cli(["status"]);
  return r.status === 0 && !/not configured|not logged in|memorable login|fails closed/i.test(r.stdout + r.stderr);
}

export function exportTraces(only: string[] = [], send = false) {
  const unknown = only.filter((n) => !names().includes(n));
  if (unknown.length) throw fail("UNKNOWN_PILOT", `No learned API called "${unknown[0]}". Try: pilot list`);
  mkdirSync(TRACES, { recursive: true });
  const kept: { name: string; file: string; sent?: string }[] = [], skipped: string[] = [];
  const canSend = send && linked();
  for (const n of only.length ? only : names()) {
    const why = gate(n);
    if (why) { skipped.push(`${n} (${why})`); continue; }
    const file = join(TRACES, `${n}.trace.json`);
    writeFileSync(file, JSON.stringify(trace(n), null, 1));
    const row: (typeof kept)[number] = { name: n, file };
    if (canSend) {
      const r = cli(["ingest", file]);
      row.sent = r.status === 0 ? (r.stdout.trim().split("\n").pop() ?? "stored") : `ingest failed: ${(r.stderr || r.stdout).trim().split("\n").pop()}`;
    }
    kept.push(row);
  }
  return { dir: TRACES, kept, skipped, sendRequested: send, linked: send ? canSend : undefined };
}

export function recall(task: string) {
  if (!linked()) throw fail("SOURCE_UNAVAILABLE", "Memorable is not linked on this machine. Run: npx memorable-cli login && npx memorable-cli enable");
  const r = cli(["recall", task]);
  return (r.stdout || r.stderr).trim();
}

