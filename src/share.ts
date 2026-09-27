// Where learned APIs go so the rest of the team (and their agents) can use them.
import { copyFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { items } from "./replay.ts";
import { APIS, ROOT, type Api, hasRecording, loadApi, loadRecording, loadVerdicts, names, saveApi, writePage } from "./store.ts";

export async function about(url: string) {
  // the site's own <title> and description, so keyword search finds the page by what the site calls itself
  try {
    const h = await (await fetch(url, { headers: { "user-agent": "Mozilla/5.0", "accept-language": "en-US" }, signal: AbortSignal.timeout(8000) })).text();
    const t = h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    const d = h.match(/<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]+content=["']([^"']*)/i)?.[1]?.trim();
    return [t, d].filter(Boolean).join(" — ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  } catch { return ""; }
}

export function status(name: string) {
  const v = loadVerdicts(name)?.verdicts ?? [];
  const n = (k: string) => v.filter((x) => x.verdict === k).length;
  return { claims: v.length, confirmed: n("CONFIRMED"), contradicted: n("CONTRADICTED"), unproven: n("UNPROVEN"), proven: v.length > 0 && n("CONFIRMED") === v.length };
}

/** GBrain page: garrytan/gbrain src/core/markdown.ts reads title/type/tags frontmatter; keyword search reads the body. */
export async function page(name: string) {
  const api = loadApi(name);
  if (api.about === undefined) { api.about = await about(api.site); saveApi(api); }
  const host = api.site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  const ex = hasRecording(name) ? items(JSON.parse(loadRecording(name).requests[loadRecording(name).end].resp || "null")) : [];
  const s = status(name);
  const st = s.claims ? `custos: ${s.confirmed}/${s.claims} of the agent's claims confirmed against the recording` : "not yet checked by custos";
  const md = `---
title: ${name} search API (${host})
type: learned-api
tags: [learned-api, search, ${name}]
site: ${api.site}
method: ${api.method}
learned: ${api.learned_at}
driver: ${api.driver}
---

# ${name} search API (${host})

${api.about || host}

Search ${host} by keyword without a browser. Learned by ${api.driver === "claude" ? "a Claude Code agent" : "a scripted browser"} in one run (${api.browser_seconds} s, ${api.requests_seen} requests); a call takes about a second. ${api.verified?.ok ? `Replay verified ${api.verified.checked_at}: a different query returns different results.` : ""} Status: ${st}.

## Call

\`\`\`sh
pilot call ${name} "<query>"
\`\`\`

Underlying request: \`${api.method} ${api.url.split("?")[0]}\` with the query templated as \`{query}\`.

## Example response

\`pilot call ${name} "${api.learned_query}"\` returned:

${ex.map((r) => `- ${r.title}${r.detail ? ` (${r.detail})` : ""}`).join("\n")}
`;
  writePage(name, md);
  return join(APIS, `${name}.md`);
}

/** QM deployment-layer tool: yc-software/qm src/deployment/deployment-layer.ts ToolDescriptor. Files sit flat beside
 *  tool.json and install to /usr/local/bin/pilot and /usr/local/lib/pilot/. Recordings stay home; call needs <name>.json. */
export function qm(out = join(ROOT, "qm", "sandbox", "tools", "pilot")) {
  mkdirSync(out, { recursive: true });
  const ns = names();
  writeFileSync(join(out, "pilot"), '#!/bin/sh\nexec node /usr/local/lib/pilot/call.mjs "$@"\n');
  writeFileSync(join(out, "call.mjs"), CALL_MJS);
  const files = [{ from: "pilot", to: "/usr/local/bin/pilot", mode: "0755" }, { from: "call.mjs", to: "/usr/local/lib/pilot/call.mjs", mode: "0644" }];
  for (const n of ns) { copyFileSync(join(APIS, `${n}.json`), join(out, `${n}.json`)); files.push({ from: `${n}.json`, to: `/usr/local/lib/pilot/apis/${n}.json`, mode: "0644" }); }
  const sites = ns.map((n) => `${n} (${(loadApi(n).about || loadApi(n).site).split(" — ")[0]})`).join(", ");
  writeFileSync(join(out, "tool.json"), JSON.stringify({
    id: "pilot", label: "Pilot learned site APIs", advertise: "pilot",
    hints: [
      `Pilot calls website search APIs that a teammate's agent already learned, in about a second, with no browser. Sites: ${sites}.`,
      "When someone writes `@pilot <site> <question>` or asks you to search one of those sites, run `pilot call <site> \"<question>\"` and post its output (the top 5 results) as your answer. Don't open a browser for these sites.",
      "`pilot list` shows the learned sites. Pilot is read-only: it only replays search requests.",
    ],
    egress: [...new Set(ns.map((n) => new URL(loadApi(n).url).host))].sort(),
    install: { binary: "pilot", files },
  }, null, 2));
  return { out, sites: ns.length };
}

// Self-contained replay for the QM sandbox (node is in its image): no deps, no recordings, plain text out.
const CALL_MJS = `import { existsSync, readFileSync, readdirSync } from "node:fs";
const dir = "/usr/local/lib/pilot/apis", [cmd, name, ...q] = process.argv.slice(2);
const form = (t) => t.replaceAll("={query:raw}", "={query:url}"), fill = (t, s, json) => form(t).replaceAll("{query:url}", () => encodeURIComponent(s)).replaceAll("{query:raw}", () => json ? JSON.stringify(s).slice(1, -1) : s);
if (cmd === "list" || !cmd) { for (const f of readdirSync(dir)) { const a = JSON.parse(readFileSync(dir + "/" + f)); console.log(a.name.padEnd(10), a.about || a.site); } process.exit(0); }
if (cmd !== "call" || !name) { console.log('usage: pilot call <site> "<question>" | pilot list'); process.exit(1); }
if (!/^[\\w-]+$/.test(name) || !existsSync(dir + "/" + name + ".json")) { console.log("No learned site called " + JSON.stringify(name) + ". Try: pilot list"); process.exit(1); }
const a = JSON.parse(readFileSync(dir + "/" + name + ".json", "utf8")), query = q.join(" "), t = Date.now();
const r = await fetch(fill(a.url, query), { method: a.method, headers: a.headers, body: a.body ? fill(a.body, query, true) : undefined });
if (!r.ok) { console.log(name + " answered HTTP " + r.status + "; the saved request may be stale."); process.exit(1); }
const data = await r.json(), out = [], seen = new Set();
const text = (v) => typeof v === "string" ? v : v && typeof v === "object" ? (v.simpleText ?? (v.runs ?? []).map((x) => x.text ?? "").join("")) : "";
const walk = (o) => { if (out.length >= 5 || !o || typeof o !== "object") return; if (Array.isArray(o)) return o.forEach(walk);
  const ti = text(o.title) || text(o.name); if (ti && ["videoId","objectID","id","slug","url"].some((k) => k in o) && ti.length > 2 && !seen.has(ti)) { seen.add(ti); out.push(ti.trim() + (o.points != null ? " (" + o.points + " points)" : o.one_liner ? " — " + o.one_liner : "")); }
  Object.values(o).forEach(walk); };
walk(data);
console.log(name + "(" + JSON.stringify(query) + ") in " + (Date.now() - t) + " ms, learned by " + a.driver + " in " + a.browser_seconds + " s:");
out.forEach((x, i) => console.log((i + 1) + ". " + x));
`;

/** Verified-only fine-tuning data. River (riverai-org/river-skills skills/river-client-training) builds datums in code with
 *  get_renderer(model).build_training_example(messages); this JSONL of {"messages": [...]} is what that script feeds it. */
export function river(out = join(ROOT, "verified.jsonl")) {
  const kept: string[] = [], skipped: string[] = [];
  const lines: string[] = [];
  for (const n of names()) {
    if (!hasRecording(n)) continue;
    const rec = loadRecording(n), s = status(n), v = loadVerdicts(n);
    if (!rec.summary || v?.claims_from !== "summary") continue;
    if (!s.proven) { skipped.push(`${n} (${s.claims - s.confirmed} of ${s.claims} claims not confirmed)`); continue; }
    lines.push(JSON.stringify({ messages: [{ role: "user", content: `Search ${rec.site} for "${rec.query}" and summarize the top results.` }, { role: "assistant", content: rec.summary }], source: n, custos: `${s.confirmed}/${s.claims} confirmed` }));
    kept.push(n);
  }
  writeFileSync(out, lines.join("\n") + (lines.length ? "\n" : ""));
  return { out, kept, skipped };
}
