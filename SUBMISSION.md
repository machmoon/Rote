# Pilot: submission answers (ready to paste)

Replace every `TODO` before submitting at 4:45 pm. Numbers come from `apis/` in the repo. Don't add a number that isn't there.

## Project name

Pilot

## Tagline (≤ 60 chars)

Learn it once. Prove it. Call it forever.

_(41 chars. Alternative: "Agents learn a site once; GBrain remembers it" is 45 chars.)_

## Short description (≤ 280 chars)

Your agents learn a website once. custos checks every claim they make against a recording of what they actually did, GBrain remembers the verified API, and every agent on your team calls that site in about a second instead of clicking through it again.

_(252 chars)_

## Long description (~250 words)

Browser agents keep doing the same slow work. Each session, the agent opens the same site, types the same kind of query and reads the same results page. Then it reports what it found, and nobody can check the report. Whatever it learned disappears when the session ends.

Pilot keeps that work. A real Claude Code agent searches a site once while Pilot records every request. Pilot finds the one JSON request that carries the answer and turns it into an API with the query as a parameter. A probe then checks that a different query really returns different results. Next, custos splits the agent's summary into atomic claims and judges each one against the recording. Every verdict has to cite a recorded request and a quote from it, and a grounding guard downgrades any verdict whose quote isn't actually there.

GBrain is the team's memory. Every learned API becomes a GBrain page that records the call, whether verification passed and what custos proved. `pilot ask "<question>"` searches GBrain, picks a verified API and answers without a browser. A QM `@pilot` tool lets any teammate's agent in Slack use a site that someone else's agent learned. An MCP server does the same for any MCP client. Only runs that custos fully confirmed are exported as River fine-tuning data.

Measured on hn.algolia.com: the real agent took 35.0 s and 11 requests, and the replayed call took 947 ms. custos judged the agent's 34 claims: 32 confirmed, 0 contradicted and 2 unproven, each confirmed claim citing a request.

We built all of it today during hackathon hours, using parallel agents in Superset.

## How it uses each sponsor tool

- **GBrain (core):** GBrain is the shared memory of every site an agent has learned. Each page records the call signature, verification, custos status and an example response (`pilot pages`, then `gbrain import apis/ --no-embed`). `pilot ask` and the MCP tool `pilot_ask` search GBrain to pick a verified API and answer. The tedious task it automates is agents re-clicking the same websites.
- **QM:** Extends QM with an `@pilot` deployment-layer tool (`tool.json` plus a self-contained `call.mjs` and the learned APIs), so any teammate's QM agent can use APIs that someone else learned. It needs a running QM deployment (`qm up`). TODO: confirm it answered live in Slack.
- **River:** `pilot river` exports fine-tuning JSONL containing only runs where custos confirmed every claim. Proven work is the only thing that becomes training data. TODO: training job ran? (yes/no; if no, say "dataset export only")
- **Superset:** We built Pilot in Superset, with parallel agents in separate workspaces handling the core, the console, integrations and docs. TODO: Superset page link.
- **Memorable / UFO:** TODO, or leave blank. Don't claim anything that wasn't built.

## Tech stack

TypeScript on Node 24 (runs `.ts` directly, no build step) · Playwright over the Chrome DevTools Protocol · Claude Code (headless `claude -p`, Sonnet) driving the browser through Microsoft Playwright MCP `--cdp-endpoint` · Claude Code with `--json-schema` as the custos judge · GBrain · QM · River · MCP · `node:http` + SSE for the live console · plain JSON/Markdown files in `apis/` as the store.

## What's next

- Re-learn automatically when a saved call breaks (errors such as `PILOT_BROKEN`, `BLOCKED`), with custos approving the new version before it replaces the old one.
- Support logged-in sites with per-user credentials kept out of the shared API, plus pagination, filters and multi-step flows.
- Run the River fine-tune on custos-verified runs only, and measure whether it beats training on unfiltered runs.
- Make custos a check any agent framework can call before writing to memory.

## Team

Patrick Liu, UCSB.

## Links

- Repo: https://github.com/machmoon/pilot-yc
- Demo video: TODO(video URL)
- Superset page: TODO

---

## 90-second live demo script

The full run sheet, with fallbacks, is in `docs/DEMO.md`.

| Time | Command | Say |
|---|---|---|
| 0:00 | (console open: `bin/pilot console`, race view) | "Agents click through the same websites every day, and nobody can check what they report. Pilot fixes both." |
| 0:10 | `bin/pilot learn hn https://hn.algolia.com/ "claude code"` | "This is a real Claude Code agent searching Hacker News while Pilot records every request. It took 35 seconds. It only has to do this once." |
| 0:30 | `bin/pilot call hn "rust async"` | "Same site, new question, no browser, no model. Under a second." |
| 0:40 | `bin/pilot swarm hn "rust" "gbrain" "yc" "robotics" "llm"` | "Many at once. In a browser that's minutes of clicking." |
| 0:50 | `bin/pilot custos hn "The top story is 'Claude Code is steganographically marking requests'" "It has 2845 points" "I emailed the results to the team"` | "custos checks the agent against the recording. Confirmed, with the request it came from. Contradicted: the recording says 2,445. Unproven: no request ever sent an email." |
| 1:10 | `bin/pilot ask "top hacker news stories about claude code"` | "GBrain is the team's memory. My teammate's agent doesn't need to know which site to use. It asks, GBrain picks the verified API, and it answers." |
| 1:20 | QM `@pilot hn claude code` in Slack (if deployed) | "I learned the site. My teammate's agent just uses it." |
| 1:25 | `bin/pilot list` | "Only proven work becomes memory or training data. Learn it once. Prove it. Call it forever." |
