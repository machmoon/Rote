// Pilot as an MCP server (stdio), so every agent on the team can call the APIs one agent learned.
// Shape follows the official SDK example node_modules/@modelcontextprotocol/sdk/dist/esm/examples/server/mcpServerOutputSchema.js
// (McpServer + registerTool + zod input shapes + StdioServerTransport) and the idea from Cqctxs/Pilot src/mcp/server.ts
// (reimplemented, that repo has no licence): results carry structuredContent, errors come back as isError results with
// the PilotError code instead of throwing, and nothing writes to stdout because stdout belongs to JSON-RPC.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { custos } from "./custos.ts";
import { toPilotError } from "./errors.ts";
import { ask } from "./gbrain.ts";
import { call, swarm } from "./replay.ts";
import { status } from "./share.ts";
import { calls, loadApi, names } from "./store.ts";

type ToolResult = { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

const ok = (text: string, structuredContent: Record<string, unknown>): ToolResult => ({ content: [{ type: "text", text }], structuredContent });
const failure = (e: unknown): ToolResult => {
  const err = toPilotError(e);
  return { content: [{ type: "text", text: `${err.code}: ${err.message}` }], structuredContent: { error: err.toJSON() }, isError: true };
};
const guard = <A>(fn: (a: A) => Promise<ToolResult> | ToolResult) => async (a: A) => { try { return await fn(a); } catch (e) { return failure(e); } };

export function buildServer(): McpServer {
  const server = new McpServer({ name: "pilot", version: "0.1.0" }, {
    instructions: "Pilot replays website search APIs that an agent already learned: about a second per call, no browser, no model. " +
      "Call pilot_list first to see which sites exist, then pilot_call (one query) or pilot_swarm (many); pilot_ask lets GBrain pick the site. " +
      "pilot_custos checks claims about a site against the recording of what the learning agent actually saw.",
  });

  server.registerTool("pilot_list", {
    title: "List learned site APIs",
    description: "The website search APIs Pilot has learned, with the site, how long the agent took to learn it, whether replay is verified, and custos proof status. Call this first.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, guard(() => {
    const apis = names().map((n) => {
      const a = loadApi(n), s = status(n);
      return { name: n, site: a.site, about: a.about ?? "", learned_query: a.learned_query, browser_seconds: a.browser_seconds,
        verified: a.verified?.ok ?? false, calls: calls(n).length, custos: { claims: s.claims, confirmed: s.confirmed, proven: s.proven } };
    });
    if (!apis.length) return ok("No learned APIs yet. Learn one with: pilot learn <name> <url> \"<query>\"", { apis });
    return ok(apis.map((a) => `${a.name} — ${a.site}${a.about ? ` (${a.about.split(" — ")[0]})` : ""}; learned in ${a.browser_seconds} s; ${a.verified ? "verified" : "unverified"}; custos ${a.custos.confirmed}/${a.custos.claims}`).join("\n"), { apis });
  }));

  server.registerTool("pilot_call", {
    title: "Search a learned site",
    description: "Replay a learned site's search request with a new query and return the top results and the latency. No browser, no model.",
    inputSchema: { name: z.string().describe("learned API name from pilot_list, e.g. hn"), query: z.string().min(1).describe("search query") },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, guard(async ({ name, query }: { name: string; query: string }) => {
    const r = await call(name, query);
    const api = loadApi(name), ms = Math.round(r.ms);
    const text = `${name}(${JSON.stringify(query)}) in ${ms} ms (the agent took ${api.browser_seconds} s)` + (r.total != null ? `, ${r.total} total hits` : "") + ":\n" +
      (r.results.length ? r.results.map((x, i) => `${i + 1}. ${x.title}${x.detail ? ` (${x.detail})` : ""}`).join("\n") : "no results");
    return ok(text, { name, query, ms, total: r.total ?? null, browser_seconds: api.browser_seconds, results: r.results });
  }));

  server.registerTool("pilot_ask", {
    title: "Ask in plain words; GBrain picks the site",
    description: "Ask a question in plain words. GBrain (the team's shared brain of learned APIs and custos proofs) picks which learned site answers it, then Pilot replays that site's search. Use when you don't know which learned API to use.",
    inputSchema: { question: z.string().min(1), query: z.string().optional().describe("exact search term; default: the question minus filler and site words") },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, guard(async ({ question, query }: { question: string; query?: string }) => {
    const r = await ask(question, { query });
    const ms = Math.round(r.result.ms);
    const text = `GBrain routed to ${r.route.hit.slug} (score ${r.route.hit.score.toFixed(2)}, custos ${r.confirmed} claims confirmed) → ${r.result.name}(${JSON.stringify(r.result.query)}) in ${ms} ms:\n` +
      (r.result.results.length ? r.result.results.map((x, i) => `${i + 1}. ${x.title}${x.detail ? ` (${x.detail})` : ""}`).join("\n") : "no results");
    return ok(text, { question, routed_to: r.route.name, gbrain_slug: r.route.hit.slug, gbrain_score: r.route.hit.score, route_ms: Math.round(r.route_ms),
      alternatives: r.route.hits.slice(1).map((h) => h.slug), query: r.result.query, ms, custos_confirmed: r.confirmed, proven: r.proven, results: r.result.results });
  }));

  server.registerTool("pilot_swarm", {
    title: "Run many searches at once",
    description: "Run many queries against one learned site in parallel; returns the top result of each and the wall time.",
    inputSchema: { name: z.string(), queries: z.array(z.string().min(1)).min(1).max(100) },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, guard(async ({ name, queries }: { name: string; queries: string[] }) => {
    const s = await swarm(name, queries);
    const text = `${queries.length} searches on ${name} in ${(s.wall_ms / 1000).toFixed(2)} s (agent: ~${s.browser_seconds} s each)\n` +
      s.runs.map((r) => `- ${r.query}: ${r.ok ? `${r.top || "no results"} (${Math.round(r.ms)} ms)` : `ERROR ${r.top}`}`).join("\n");
    return ok(text, { name, wall_ms: Math.round(s.wall_ms), browser_seconds: s.browser_seconds, runs: s.runs.map((r) => ({ ...r, ms: Math.round(r.ms) })) });
  }));

  server.registerTool("pilot_custos", {
    title: "Check claims against the recording",
    description: "LLM judge (with a grounding guard) that rates each claim about a learned site CONFIRMED, CONTRADICTED or UNPROVEN, citing the recorded request and a verbatim quote from it. Takes ~30-60 s.",
    inputSchema: { name: z.string(), claims: z.array(z.string().min(1)).min(1).max(30) },
    annotations: { readOnlyHint: false },
  }, guard(async ({ name, claims }: { name: string; claims: string[] }) => {
    const r = await custos(name, claims);
    const text = r.verdicts.map((v) => `${v.verdict}: ${v.claim}\n  ${v.verdict !== "UNPROVEN" ? `[${v.request_index}] ${JSON.stringify(v.quote)} ` : ""}${v.reason}`).join("\n");
    return ok(text, { name, judge: r.judge, requests: r.requests, verdicts: r.verdicts });
  }));

  return server;
}

export async function serveMcp() {
  await buildServer().connect(new StdioServerTransport());
}
