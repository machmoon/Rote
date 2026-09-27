// learn: one browser run, recorded. The request whose URL or body carries the typed query and answers with JSON
// is the "end request" (Integuru, integuru/graph_builder.py); the query in it becomes {query} (mitmproxy2swagger templating).
// Driver "claude": Claude Code drives the same Chrome through Playwright MCP --cdp-endpoint, which reuses the browser's
// default context (playwright-core src/tools/mcp/program.ts contexts()[0]); we record that context over CDP.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { gunzipSync } from "node:zlib";
import { chromium, type BrowserContext, type Response } from "playwright";
import { fail } from "./errors.ts";
import { type Api, type AgentStep, type RecordedRequest, type Recording, saveApi, saveRecording, stamp } from "./store.ts";

export type LearnEvent =
  | { type: "status"; text: string }
  | { type: "request"; req: Omit<RecordedRequest, "resp" | "body"> & { json: boolean } }
  | { type: "agent"; step: AgentStep }
  | { type: "summary"; text: string }
  | { type: "learned"; api: Api; end: number; requests: number };

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const MCP = "@playwright/mcp@0.0.82";
const CDP_PORT = 9333;
const DROP = new Set(["content-length", "accept-encoding", "cookie", "content-encoding", "host", "connection"]);

const forms = (q: string) => [q, encodeURIComponent(q), encodeURIComponent(q).replaceAll("%20", "+"), q.replaceAll(" ", "%20"), JSON.stringify(q).slice(1, -1)];

export function claudeEnv() {
  // a nested headless Claude Code must not think it's inside this session
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("CLAUDE_CODE_") && k !== "CLAUDECODE")) as NodeJS.ProcessEnv;
}
export const CLAUDE = join(homedir(), ".local/bin/claude");

function recorder(ctx: BrowserContext, t0: number, reqs: (RecordedRequest & { headers: Record<string, string> })[], emit: (e: LearnEvent) => void) {
  ctx.on("response", async (r: Response) => {
    const rq = r.request();
    if (!["xhr", "fetch", "document"].includes(rq.resourceType())) return;
    const at_ms = Math.round(performance.now() - t0);
    let body = "", resp = "";
    try {
      const pb = rq.postDataBuffer();
      if (pb) body = (pb[0] === 0x1f && pb[1] === 0x8b ? gunzipSync(pb) : pb).toString("utf8");
      if ((r.headers()["content-type"] ?? "").includes("json")) resp = await r.text();
    } catch { return; }
    const req = { i: reqs.length, at_ms, method: rq.method(), url: rq.url(), status: r.status(), body, resp, headers: await rq.allHeaders().catch(() => rq.headers()) };
    reqs.push(req);
    emit({ type: "request", req: { i: req.i, at_ms, method: req.method, url: req.url, status: req.status, json: !!resp } });
  });
}

async function driveClaude(url: string, query: string, ctx: BrowserContext, t0: number, dir: string, emit: (e: LearnEvent) => void) {
  const cfg = join(dir, "mcp.json");
  writeFileSync(cfg, JSON.stringify({ mcpServers: { playwright: { command: "npx", args: ["-y", MCP, "--cdp-endpoint", `http://127.0.0.1:${CDP_PORT}`] } } }));
  const task = `A Chrome tab is already open on ${url}. Use it (don't open a new site). Search that site for "${query}" using its own search box, `
    + `wait for the results, then read them. Finish with a short summary of the top results: titles and any numbers shown (points, counts). `
    + `Only report what you saw on the page.`;
  emit({ type: "status", text: `Claude Code is driving the browser: ${task}` });
  const agent: AgentStep[] = [];
  let summary = "";
  const proc = spawn(CLAUDE, ["-p", task, "--mcp-config", cfg, "--strict-mcp-config", "--allowedTools", "mcp__playwright",
    "--tools", "", "--disable-slash-commands", "--model", process.env.PILOT_MODEL ?? "sonnet", "--output-format", "stream-json", "--verbose"],
    { env: claudeEnv(), cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
  for await (const line of createInterface({ input: proc.stdout })) {
    let ev: any;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === "assistant") {
      for (const c of ev.message?.content ?? []) {
        if (c.type !== "tool_use") continue;
        const arg = String(Object.entries(c.input ?? {}).find(([k]) => ["text", "url", "element", "key"].includes(k))?.[1] ?? "");
        const step = { at_ms: Math.round(performance.now() - t0), tool: c.name.replace("mcp__playwright__", ""), arg: arg.slice(0, 80) };
        agent.push(step);
        emit({ type: "agent", step });
      }
    } else if (ev.type === "result") {
      summary = ev.result ?? "";
      if (ev.is_error) throw fail("AI_REQUEST_FAILED", `the agent failed: ${summary.slice(0, 200)}`);
    }
  }
  await ctx.pages()[0]?.waitForTimeout(1200);
  return { agent, summary };
}

export async function learn(name: string, url: string, query: string, opts: { driver?: "claude" | "typer" } = {}, emit: (e: LearnEvent) => void = () => {}) {
  const driver = opts.driver ?? "claude";
  const reqs: (RecordedRequest & { headers: Record<string, string> })[] = [];
  let agent: AgentStep[] = [], summary = "";
  const t0 = performance.now();
  const started_at = new Date().toISOString();
  const dir = mkdtempSync(join(tmpdir(), "pilot-"));
  emit({ type: "status", text: `Opening Chrome on ${url}` });
  if (driver === "claude") {
    const chrome = spawn(CHROME, [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${dir}`, "--no-first-run", "--no-default-browser-check",
      "--window-size=1280,860", "about:blank"], { stdio: "ignore" });
    try {
      let browser;
      for (let i = 0; i < 60 && !browser; i++) {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`).catch(() => new Promise<undefined>((r) => setTimeout(r, 200)));
      }
      if (!browser) throw fail("INTERNAL_ERROR", "Chrome did not open a debugging port");
      const ctx = browser.contexts()[0];
      recorder(ctx, t0, reqs, emit);
      await (ctx.pages()[0] ?? (await ctx.newPage())).goto(url, { waitUntil: "domcontentloaded" });
      ({ agent, summary } = await driveClaude(url, query, ctx, t0, dir, emit));
      await browser.close();
    } finally {
      chrome.kill();
      rmSync(dir, { recursive: true, force: true });
    }
  } else {
    const browser = await chromium.launch({ channel: "chrome", headless: false, args: ["--window-size=1280,860"] });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, locale: "en-US" });
    recorder(ctx, t0, reqs, emit);
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const box = page.locator("input[type=search]:visible, input[name*=search i]:visible, input[placeholder*=search i]:visible, input[type=text]:visible").first();
    const step = (tool: string, arg: string) => { const s = { at_ms: Math.round(performance.now() - t0), tool, arg }; agent.push(s); emit({ type: "agent", step: s }); };
    step("browser_click", "search box"); await box.click();
    step("browser_type", query); await box.pressSequentially(query, { delay: 70 });
    step("browser_press_key", "Enter"); await page.keyboard.press("Enter");
    await page.waitForTimeout(4000);
    await browser.close();
  }
  const duration_ms = Math.round(performance.now() - t0);

  // the end request: carries the typed query, answers with JSON. Among the last few such, the biggest.
  const hits = reqs.filter((r) => r.resp && forms(query).some((f) => r.url.includes(f) || r.body.includes(f)));
  if (!hits.length) throw fail("NO_ANSWER_REQUEST", `No JSON request carried "${query}". This site renders results on the server; Pilot can't learn it yet.`, name);
  const end = hits.slice(-3).reduce((a, b) => (b.resp.length > a.resp.length ? b : a));
  let urlT = end.url;
  for (const f of [...new Set(forms(query))].sort((a, b) => b.length - a.length)) {
    if (urlT.includes(f)) urlT = urlT.replaceAll(f, f !== query && /%|\+/.test(f) ? "{query:url}" : "{query:raw}");
  }
  let bodyT = end.body;
  for (const f of [JSON.stringify(query).slice(1, -1), query]) bodyT = bodyT.replaceAll(f, "{query:raw}");
  const api: Api = {
    name, site: url, method: end.method, url: urlT, body: bodyT,
    headers: Object.fromEntries(Object.entries(end.headers).filter(([k]) => !k.startsWith(":") && !DROP.has(k.toLowerCase()))),
    learned_query: query, driver, browser_seconds: Math.round(duration_ms / 100) / 10, requests_seen: reqs.length, learned_at: stamp(),
  };
  saveApi(api);
  const rec: Recording = { name, site: url, query, driver, started_at, duration_ms, end: end.i,
    requests: reqs.map(({ headers, ...r }) => r), agent, summary };
  saveRecording(rec);
  if (summary) emit({ type: "summary", text: summary });
  emit({ type: "learned", api, end: end.i, requests: reqs.length });
  return { api, rec };
}
