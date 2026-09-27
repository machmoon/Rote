# Pilot: submission answers (ready to paste)

Every number comes from `apis/` or a command in the README. Remaining blanks: demo video URL and Superset page URL.

## Project name

Pilot

## Tagline (≤ 60 chars)

Learn it once. Prove it. Call it forever.

## Short description (≤ 280 chars)

A Claude Code agent searches a site once while Pilot records it. Pilot turns the request that carried the answer into an API, custos checks the agent's claims against the recording, and GBrain stores both so any agent on the team can call the site without a browser.

## Long description

Browser agents redo the same slow work every session, their reports can't be checked, and what they learn disappears when the session ends.

Pilot keeps that work. A headless Claude Code agent drives Chrome through Playwright MCP over CDP while Pilot records every request. Pilot finds the one JSON request that carried the typed query and saves it as an API with `{query}` as the parameter. A probe query then has to return different results, or verification fails.

custos splits the agent's summary into claims and has an LLM judge rule on each one against the recording: CONFIRMED, CONTRADICTED or UNPROVEN, citing a recorded request and a quote. A grounding guard downgrades any verdict whose quote is not actually in the cited request.

GBrain is the team memory. Each site gets a `learned-apis/<name>` page and a `proofs/<name>` page. `pilot ask "<question>"` queries GBrain, picks the learned API and calls it. An MCP server exposes the same to any agent, and a QM tool export extends QM with `@pilot`.

Measured today: three sites learned by the real agent (hn 35.0 s / 11 requests, yc 32.3 s / 17, devto 66.8 s / 19), all passing verify. A replayed call is one HTTP request: median about 1 s on venue wifi (best 172 ms, slower when the wifi is), against 32–67 s for the agent. 50 queries in a swarm took 1.1–4.3 s. custos on the agents' own summaries: hn 31 confirmed / 0 contradicted / 6 unproven, yc 56 / 1 / 2, devto 51 / 0 / 6. On devto the grounding guard fired for real, downgrading 5 verdicts whose quotes were not in the cited request. The one yc CONTRADICTED is a judge error: the page showed 40 of 162 companies, and the judge compared 40 with the request's page size of 1000. Two sites were refused honestly: Open Library (server-rendered, `NO_ANSWER_REQUEST`) and npm (replay got 403, `BLOCKED`). All three working sites happen to use Algolia-hosted search; nothing in Pilot is Algolia-specific.

## How it uses GBrain (required) and QM

- **GBrain:** `pilot learn`, `pilot custos` and `pilot pages` write `learned-apis/<name>` and `proofs/<name>` pages (linked) into a GBrain brain using GBrain's own `put` and `link`. `pilot ask` routes a natural-language question through `gbrain query` to the right learned API and calls it (e.g. "startups in the yc directory doing robotics" → `learned-apis/yc`, 570 ms routing, 711 ms call). `gbrain serve` plus `pilot mcp` give any MCP agent both the memory and the calls.
- **QM:** `pilot qm` exports a deployment-layer tool (`tool.json`, self-contained `call.mjs`, learned APIs, egress limited to the API hosts). Written to `qm/sandbox/tools/pilot/`; QM's own `parseToolDescriptor` accepts it. Not yet live in Slack: that needs a QM deployment (Fly/AWS, Slack app tokens, model key).
- **River:** `pilot river` exports only runs where custos confirmed every claim; `integrations/river_train.py` builds real datums with `river-client` in a dry run. The export is empty today (all three runs have UNPROVEN claims), and no training job ran (no API key).
- **Memorable:** `pilot memorable` turns each verified learn run (probe passed, custos contradicted nothing: hn and devto today) into a Memorable procedure trace from the real recording. Not ingested yet: `--send` needs a Memorable login (`npx memorable-cli login && npx memorable-cli enable`).
- **Superset:** built with one lead agent and parallel sub-agents in Superset workspaces. Page: `docs/superset/index.html` (publishing pending). URL: TODO

## Tech stack

TypeScript on Node 24 (no build step) · Playwright over the Chrome DevTools Protocol · Claude Code (`claude -p`, Sonnet) driving the browser through Playwright MCP `--cdp-endpoint` · Claude Code with `--json-schema` as the custos judge · GBrain · QM · River client · MCP TypeScript SDK · `node:http` + SSE console · JSON/Markdown files in `apis/`.

## Built during the hackathon

Empty initial commit 13:16; core restarted from scratch about 14:10 by a lead agent and parallel sub-agents in Superset; nine commits between 14:16 and 14:48 (see README "Timeline"). A morning Python spike was thrown away; none of its code or numbers are used.

## What's next

- Run custos automatically before a repaired API replaces the old one.
- Logged-in sites with per-user credentials kept out of the shared API; pagination and multi-step flows.
- Give custos the rendered page state so claims about what the page showed can be confirmed.
- Run the River fine-tune once there are fully confirmed runs.

## Team

Patrick Liu, UCSB.

## Links

- Repo: https://github.com/machmoon/pilot-yc
- Demo video: TODO
- Superset page: TODO

---

## 90-second live demo

Full run sheet with fallbacks: `docs/DEMO.md`.

| Time | Command | Say |
|---|---|---|
| 0:00 | console Race view (hn), press Enter | "This is a real Claude Code agent learning Hacker News search earlier today, replayed from its recording: 35 seconds, 11 requests. Pilot races it with the learned API." |
| 0:10 | `bin/pilot list` | "A real Claude Code agent learned these three sites today: 32 to 67 seconds each." |
| 0:20 | `bin/pilot call hn "rust async"` | "Same site, new question, no browser, no model. One request; its time is the wifi's." |
| 0:30 | `bin/pilot swarm hn video/fifty.txt` | "Fifty queries in a few seconds. The agent would need about half an hour." |
| 0:45 | `bin/pilot custos hn "The top story is 'Claude Code is steganographically marking requests'" "It has 2845 points" "I emailed the results to the team"` | "Confirmed, with the request. Contradicted: the recording says 2445. Unproven: nothing sent an email." |
| 1:05 | `bin/pilot ask "startups in the yc directory doing robotics"` | "GBrain is the team memory. The asking agent doesn't know which site to use; GBrain picks the learned API." |
| 1:20 | `GBRAIN_HOME=~/.gbrain-pilot gbrain list` | "Every API and every proof is a GBrain page." |
