// The live console: node:http + one static page + JSON/SSE endpoints. No framework, so it starts instantly at the venue.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { custos } from "./custos.ts";
import { fail, toPilotError } from "./errors.ts";
import { learn } from "./learn.ts";
import { call, swarm } from "./replay.ts";
import { status } from "./share.ts";
import { ask, page } from "./gbrain.ts";
import { ROOT, calls, hasRecording, loadApi, loadRecording, loadVerdicts, names, saveApi } from "./store.ts";
import { verify } from "./validate.ts";

const json = (res: ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};
const readBody = async (req: IncomingMessage) => {
  let s = ""; for await (const c of req) s += c;
  try { return s ? JSON.parse(s) : {}; } catch { throw fail("INVALID_ARGUMENT", "request body is not JSON"); }
};

function state() {
  return names().map((n) => {
    const a = loadApi(n), cs = calls(n), rec = hasRecording(n) ? loadRecording(n) : null;
    return {
      name: n, site: a.site, about: a.about ?? "", method: a.method, url: a.url, driver: a.driver, learned_query: a.learned_query,
      browser_seconds: a.browser_seconds, requests_seen: a.requests_seen, learned_at: a.learned_at, verified: a.verified ?? null,
      calls: cs.length, avg_call_ms: cs.length ? cs.slice(-50).reduce((x, y) => x + y, 0) / Math.min(cs.length, 50) : null,
      saved_s: cs.reduce((t, ms) => t + a.browser_seconds - ms / 1000, 0), proof: status(n),
      agent_steps: rec?.agent.length ?? 0, has_summary: !!rec?.summary,
    };
  });
}

function recordingView(n: string) {
  const r = loadRecording(n);
  // bodies trimmed for the browser; the full recording stays on disk for custos
  return { ...r, requests: r.requests.map((q) => ({ ...q, body: q.body.slice(0, 400), resp: q.i === r.end ? q.resp.slice(0, 60000) : q.resp.slice(0, 1500) })) };
}

export function serve(port = 4321) {
  const html = () => readFileSync(join(ROOT, "web", "index.html"), "utf8");
  createServer(async (req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    try {
      if (u.pathname === "/" || u.pathname === "/index.html") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(html()); }
      if (u.pathname === "/api/state") return json(res, 200, { apis: state() });
      const m = u.pathname.match(/^\/api\/(recording|verdicts)\/([\w-]+)$/);
      if (m) return json(res, 200, m[1] === "recording" ? recordingView(m[2]) : { summary: loadVerdicts(m[2], "summary"), claims: loadVerdicts(m[2], "claims") });
      if (u.pathname === "/api/call" && req.method === "POST") {
        const b = await readBody(req); const r = await call(b.name, b.query);
        return json(res, 200, { ...r, data: undefined, browser_seconds: loadApi(b.name).browser_seconds });
      }
      if (u.pathname === "/api/ask" && req.method === "POST") {   // GBrain picks the learned API, Pilot answers
        const b = await readBody(req);
        if (!b.question) throw fail("INVALID_ARGUMENT", "question is required");
        const r = await ask(b.question);
        return json(res, 200, { ...r, result: { ...r.result, data: undefined } });
      }
      if (u.pathname === "/api/swarm" && req.method === "POST") { const b = await readBody(req); return json(res, 200, await swarm(b.name, b.queries)); }
      if (u.pathname === "/api/custos" && req.method === "POST") {
        const b = await readBody(req); const r = await custos(b.name, b.summary ? "summary" : b.claims, { rules: !!b.rules });
        await page(b.name); return json(res, 200, r);
      }
      if (u.pathname === "/api/learn") {           // Server-Sent Events: the live run
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        const send = (e: object) => res.write(`data: ${JSON.stringify(e)}\n\n`);
        try {
          const { api } = await learn(u.searchParams.get("name")!, u.searchParams.get("url")!, u.searchParams.get("query")!,
            { driver: u.searchParams.get("driver") === "typer" ? "typer" : "claude" }, send);
          const v = await verify(api); api.verified = v; saveApi(api); await page(api.name);
          send({ type: "verified", verification: v });
        } catch (e) { send({ type: "error", error: toPilotError(e).toJSON() }); }
        send({ type: "done" });
        return res.end();
      }
      json(res, 404, { error: "not found" });
    } catch (e) {
      const err = toPilotError(e);
      json(res, err.code === "UNKNOWN_PILOT" || err.code === "INVALID_ARGUMENT" ? 400 : 502, { error: err.toJSON() });
    }
  }).listen(port, () => console.log(`Pilot console on http://localhost:${port}`));
}
