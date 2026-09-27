#!/usr/bin/env node
// Pilot CLI. Help grouping follows Cqctxs/Pilot src/cli/main.ts (core / look / share).
import { readFileSync } from "node:fs";
import { custos } from "./custos.ts";
import { toPilotError } from "./errors.ts";
import { learn } from "./learn.ts";
import { call, swarm } from "./replay.ts";
import { qm, river, status } from "./share.ts";
import { ask, page } from "./gbrain.ts";
import { calls, loadApi, names, saveApi } from "./store.ts";
import { verify } from "./validate.ts";

const tty = process.stdout.isTTY;
const c = (code: string) => (s: string | number) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const amber = c("38;5;214"), green = c("32"), red = c("31"), grey = c("37"), bold = c("1"), dim = c("2");

const HELP = `${bold("pilot")}  learn a website once with a real agent, prove what it did, call it forever

${dim("CORE")}
  pilot learn <name> <url> "<query>" [--typer]   a Claude Code agent searches the site while Pilot records; saves apis/<name>.json
  pilot call <name> "<query>"                    replay the learned request with a new query (no browser, no model)
  pilot swarm <name> <file|q1 q2 ...>            many queries at once
  pilot ask "<question>" [--query "<q>"]         GBrain picks the learned API that answers it, Pilot calls it
${dim("PROVE")}
  pilot custos <name> "<claim>" ... | --summary  CONFIRMED / CONTRADICTED / UNPROVEN, each citing a recorded request [--rules offline]
  pilot verify <name>                            replay with the learned query and a probe; results must exist and differ
  pilot repair <name>                            if verify fails (site changed), the agent re-learns the site
${dim("LOOK")}
  pilot list                                     learned APIs, proof status, calls, time saved
  pilot console [--port 4321]                    the live console (race, recordings, custos)
${dim("SHARE")}
  pilot pages                                    write every API + custos verdicts into GBrain (learn/custos do it too)
  pilot mcp                                      MCP server (stdio): pilot_list/call/ask/swarm/custos for any agent
  pilot qm [dir]                                 export a QM tool so @pilot answers in Slack
  pilot river [out.jsonl]                        fine-tuning data from runs custos fully confirmed
  pilot memorable [names...] [--send] | recall "<task>"   Memorable procedure traces from verified runs (ingest with --send)`;

const verdictLine = (v: any) => {
  const col = v.verdict === "CONFIRMED" ? green : v.verdict === "CONTRADICTED" ? red : grey;
  const cite = v.verdict !== "UNPROVEN" ? `[${v.request_index}] ${JSON.stringify(v.quote)}  ` : "";
  return `  ${col(bold(v.verdict.padEnd(13)))}${v.claim}\n  ${" ".repeat(13)}${dim(cite + v.reason)}`;
};

async function main(a: string[]) {
  const [cmd, ...rest] = a;
  const flags = new Set(rest.filter((x) => x.startsWith("--")));
  const args = rest.filter((x) => !x.startsWith("--"));
  const USAGE: Record<string, [number, string]> = {   // [required positional args, usage]
    learn: [3, 'pilot learn <name> <url> "<query>" [--typer]'], call: [2, 'pilot call <name> "<query>"'],
    swarm: [2, "pilot swarm <name> <file|q1 q2 ...>"], ask: [1, 'pilot ask "<question>"'], verify: [1, "pilot verify <name>"],
    repair: [1, "pilot repair <name>"], custos: [1, 'pilot custos <name> "<claim>" ... | --summary'],
  };
  if (cmd && USAGE[cmd]) {
    const [need, usage] = USAGE[cmd];
    const missing = args.length < need || args.slice(0, need).some((x) => !x.trim())
      || (cmd === "custos" && args.length < 2 && !flags.has("--summary"));
    if (missing) { console.error(`usage: ${usage}`); process.exit(1); }
  }
  switch (cmd) {
    case "learn": {
      const [name, url, query] = args;
      const { api, rec } = await learn(name, url, query, { driver: flags.has("--typer") ? "typer" : "claude" }, (e) => {
        if (e.type === "status") console.log(amber("● ") + e.text);
        if (e.type === "agent") console.log(dim(`  ${(e.step.at_ms / 1000).toFixed(1).padStart(5)}s → ${e.step.tool} ${e.step.arg}`));
      });
      console.log(`\n${bold(`Learned ${name}`)}  ${dim(`${rec.requests.length} requests in ${api.browser_seconds} s · request [${rec.end}] carried the answer`)}`);
      console.log(`  ${amber(`${api.method} ${api.url.slice(0, 110)}`)}`);
      const v = await verify(api); api.verified = v; saveApi(api);
      console.log(v.ok ? green(`  ✓ verified: "${api.learned_query}" → ${v.learned_query_results} results, "${v.probe_query}" → ${v.probe_results} different results`) : red(`  ✗ ${v.problems.join("; ")}`));
      if (rec.summary) console.log(`\n${bold("Agent summary")} ${dim(`(check it: pilot custos ${name} --summary)`)}\n${rec.summary}`);
      await page(name);
      break;
    }
    case "call": {
      const r = await call(args[0], args.slice(1).join(" "));
      const api = loadApi(args[0]);
      console.log(`${bold(r.name)}(${amber(JSON.stringify(r.query))})  ${green(`${Math.round(r.ms)} ms`)}  ${dim(`vs ${api.browser_seconds} s for the agent · ${Math.round(api.browser_seconds * 1000 / r.ms)}× faster`)}`);
      r.results.forEach((x) => console.log(`  • ${x.title.slice(0, 90)}  ${dim(x.detail)}`));
      break;
    }
    case "swarm": {
      const qs = args.length === 2 && !args[1].includes(" ") && /\.txt$/.test(args[1]) ? readFileSync(args[1], "utf8").split("\n").map((s) => s.trim()).filter(Boolean) : args.slice(1);
      const s = await swarm(args[0], qs);
      s.runs.forEach((r) => console.log(`  ${amber(r.query.slice(0, 22).padEnd(22))} ${String(Math.round(r.ms)).padStart(5)} ms  ${(r.ok ? r.top : red(r.top)).slice(0, 70)}`));
      console.log(`\n${bold(`${qs.length} searches in ${(s.wall_ms / 1000).toFixed(2)} s`)}  ${dim(`vs ~${(s.browser_seconds * qs.length / 60).toFixed(1)} min for the agent (${s.browser_seconds} s each)`)}`);
      break;
    }
    case "custos": {
      const name = args[0];
      console.log(dim(`custos: ${flags.has("--summary") ? "splitting the agent's summary into claims, then " : ""}judging against the recording…`));
      const r = await custos(name, flags.has("--summary") ? "summary" : args.slice(1), { rules: flags.has("--rules") });
      r.verdicts.forEach((v) => console.log(verdictLine(v)));
      const n = (k: string) => r.verdicts.filter((v) => v.verdict === k).length, s = { confirmed: n("CONFIRMED"), contradicted: n("CONTRADICTED"), unproven: n("UNPROVEN") };
      console.log(`\n  ${green(`${s.confirmed} confirmed`)} · ${red(`${s.contradicted} contradicted`)} · ${grey(`${s.unproven} unproven`)}  ${dim(`against ${r.requests} recorded requests`)}`);
      await page(name);
      break;
    }
    case "repair": {
      // Cqctxs/Pilot src/cli/repair.ts idea: reproduce the failure first; a working API is not "repaired"
      const api = loadApi(args[0]);
      const v = await verify(api);
      if (v.ok) { console.log(green(`✓ ${args[0]} still works ("${api.learned_query}" → ${v.learned_query_results} results); nothing to repair`)); break; }
      console.log(red(`✗ ${args[0]} is broken: ${v.problems.join("; ")}`) + `\n${amber("● ")}sending the agent back to ${api.site} to re-learn "${api.learned_query}"…`);
      await main(["learn", api.name, api.site, api.learned_query, ...(api.driver === "typer" ? ["--typer"] : [])]);
      console.log(dim(`then prove the new run: pilot custos ${api.name} --summary`));
      break;
    }
    case "verify": {
      const api = loadApi(args[0]); const v = await verify(api); api.verified = v; saveApi(api);
      console.log(v.ok ? green(`✓ ${args[0]} verified`) : red(`✗ ${v.problems.join("; ")}`), dim(JSON.stringify(v)));
      break;
    }
    case "list": {
      for (const n of names()) {
        const a = loadApi(n), cs = calls(n), s = status(n);
        const saved = cs.reduce((t, ms) => t + a.browser_seconds - ms / 1000, 0);
        const proof = s.claims ? (s.proven ? green("proven") : `${s.confirmed}/${s.claims} confirmed`) : dim("unchecked");
        console.log(`  ${bold(n.padEnd(8))} ${a.site.replace(/^https?:\/\//, "").padEnd(34)} ${dim(a.driver.padEnd(6))} ${String(cs.length).padStart(4)} calls  ${green(`${(saved / 60).toFixed(1)} min saved`)}  ${proof}`);
      }
      break;
    }
    case "ask": {
      const qi = rest.indexOf("--query"), q = qi >= 0 ? rest[qi + 1] : undefined;
      const r = await ask(args.filter((x) => x !== q).join(" "), { query: q });
      console.log(`${bold("GBrain")} ${dim(`searched team memory in ${Math.round(r.route_ms)} ms:`)}`);
      r.route.hits.slice(0, 3).forEach((h, k) => console.log(`  ${k ? " " : green("→")} ${(k ? dim : bold)(h.slug.padEnd(22))} ${dim(`score ${h.score.toFixed(2)}`)}`));
      console.log(`${bold("Pilot")} ${bold(r.result.name)}(${amber(JSON.stringify(r.result.query))})  ${green(`${Math.round(r.result.ms)} ms`)}  ${dim(`no browser · custos ${r.confirmed} confirmed`)}`);
      r.result.results.forEach((x) => console.log(`  • ${x.title.slice(0, 90)}  ${dim(x.detail)}`));
      break;
    }
    case "mcp": { const { serveMcp } = await import("./mcp.ts"); await serveMcp(); break; }
    case "pages": for (const n of names()) console.log(await page(n)); break;
    case "qm": { const r = qm(args[0]); console.log(`QM tool written to ${r.out} (${r.sites} sites). Copy it to <your-qm-deployment>/sandbox/tools/pilot/ and run \`qm up\`.`); break; }
    case "river": { const r = river(args[0]); console.log(`${r.kept.length} verified run(s) → ${r.out}${r.skipped.length ? dim(`\nleft out: ${r.skipped.join("; ")}`) : ""}`); break; }
    case "memorable": {
      const m = await import("./memorable.ts");
      if (args[0] === "recall") { if (!args[1]?.trim()) { console.error('usage: pilot memorable recall "<task>"'); process.exit(1); } console.log(m.recall(args[1])); break; }
      const r = m.exportTraces(args, flags.has("--send"));
      for (const k of r.kept) console.log(`  ${green("✓")} ${k.name.padEnd(8)} ${dim(k.file)}${k.sent ? `  ${k.sent}` : ""}`);
      if (r.skipped.length) console.log(dim(`  left out: ${r.skipped.join("; ")}`));
      console.log(r.linked === false
        ? amber(`  not sent: Memorable isn't linked here. Run \`npx memorable-cli login && npx memorable-cli enable\`, then \`pilot memorable --send\`.`)
        : r.sendRequested ? "" : dim(`  ${r.kept.length} trace(s) ready. \`pilot memorable --send\` ingests them into Memorable.`));
      break;
    }
    case "console": { const { serve } = await import("./server.ts"); serve(Number(args[0] ?? rest[rest.indexOf("--port") + 1]) || 4321); break; }
    case undefined: case "help": case "--help": case "-h": console.log(HELP); break;
    default: console.error(red(`unknown command "${cmd}"`) + "\n\n" + HELP); process.exit(1);
  }
}

main(process.argv.slice(2)).catch((e) => {
  const err = toPilotError(e);
  console.error(red(`${err.code}: ${err.message}`));
  process.exit(1);
});
