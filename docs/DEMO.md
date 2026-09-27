# Pilot live demo: run sheet (90 seconds)

Run everything from the repo root. Expected values are from runs earlier today; say only what appears on screen.

## Pre-flight

- [ ] `bin/pilot call hn "yc"` returns results on the venue wifi (the saved API still works).
- [ ] `bin/pilot console` open on http://localhost:4321, race view showing.
- [ ] Run the three-claim custos check (step 5) once beforehand, so a slow judge doesn't stall the demo. The saved result is `apis/hn.claims.json`.
- [ ] `bin/pilot pages` run after the last learn, and `GBRAIN_HOME=~/.gbrain-pilot gbrain list` shows 6 pages.
- [ ] Large terminal font, cleared scrollback.

## The run

| # | Time | Command | Say | Expect |
|---|---|---|---|---|
| 1 | 0:00 | console Race view (hn, 4×), press Enter | "Agents click through the same websites every session, and nobody checks what they report. This is a real Claude Code agent learning HN search earlier today, replayed from its recording." | Left lane replays the agent's recorded run (35 s, 11 requests, from `apis/hn.recording.json`; no browser starts); the right lane makes one live call. The Learn tab's "Replay a saved run" shows the same recording step by step |
| 2 | 0:15 | `bin/pilot list` | "A real Claude Code agent learned these three sites today." | hn, yc, devto rows with proof status (hn 31/37, yc 56/59, devto 51/57) |
| 3 | 0:20 | `bin/pilot call hn "rust async"` | "Same site, new question, no browser, no model." | Top results with points. Median about 1 s; 7–8 s seen during a slow wifi patch. If slow, say "one request, no browser; the time is the wifi" |
| 4 | 0:30 | `bin/pilot swarm hn video/fifty.txt` | "Fifty queries at once. The agent would need about half an hour." | "50 searches in ~1–3 s vs ~29.2 min for the agent" |
| 5 | 0:45 | `bin/pilot custos hn "The top story is 'Claude Code is steganographically marking requests'" "It has 2845 points" "I emailed the results to the team"` | "Confirmed, with the request it came from. Contradicted: the recording says 2445. Unproven: no request ever sent an email." | CONFIRMED / CONTRADICTED / UNPROVEN, each citing `[n] "quote"` |
| 6 | 1:05 | `bin/pilot ask "startups in the yc directory doing robotics"` | "GBrain is the team memory. The agent asking doesn't know which site to use. GBrain picks the learned API, Pilot calls it." | `gbrain → learned-apis/yc (score ~1.0, ~570 ms)` then robotics companies |
| 7 | 1:20 | `GBRAIN_HOME=~/.gbrain-pilot gbrain list` | "Every learned API and every proof is a GBrain page. Learn it once, prove it, call it forever." | `learned-apis/*` and `proofs/*` for hn, yc, devto |

Measured timings: custos on 3 claims took 14.3 s in rehearsal (run it in pre-flight and show the result if pressed), `ask` 1.1–2.1 s, swarm of 50 1.1–3.0 s. Optional, only with spare time: `bin/pilot learn <new-name> <url> "<query>"` shows the agent live; it takes 30–70 s.

## If something fails

- **Wifi is slow:** calls are network-bound. Say so. A phone hotspot is the better fallback.
- **Do not run `learn hn` live:** it overwrites `apis/hn.recording.json`, and the committed custos verdicts cite request indices in that recording. Use a new name if you must show `learn`.
- **The LLM judge is slow or fails:** show `apis/hn.claims.json` in the console. Do not switch to `--rules` for the 2845 claim: the offline fallback returned UNPROVEN instead of CONTRADICTED because the digits 2845 appear elsewhere in a response (`git show 161f09c:apis/hn.custos.json`).
- **`pilot ask` routes wrong:** pass `--query "robotics"` to set the search term, or use `bin/pilot call yc "robotics"`.
- **QM questions:** show `qm/sandbox/tools/pilot/tool.json` (from `bin/pilot qm`) and `integrations/qm.md`. It is not live in Slack; that needs `qm up` on a QM deployment.
- **Last resort:** the backup video. TODO(video URL)

## Judge questions

| Question | Answer |
|---|---|
| Where's the AI? | A real Claude Code agent learns the site. custos is an LLM judge that must cite a recorded request, and a guard checks the quote is really in that request. |
| How is GBrain used? | It is the memory: `learned-apis/*` and `proofs/*` pages, and `pilot ask` routes questions through `gbrain query`. |
| Isn't this scraping? | It replays the site's own search request, read-only, on sites that allow it. No logins, no writes. |
| What if the site changes? | `verify` fails with a typed error (`PILOT_BROKEN`, `BLOCKED`), and `bin/pilot repair <name>` reproduces the failure and re-runs the agent. |
| How do I know custos isn't just an LLM saying yes? | It sees only the recorded requests, must cite `[request] "quote"`, and the guard checks the quote. On devto the guard downgraded 5 real verdicts (`apis/devto.custos.json`). |
| What didn't work? | Open Library (server-rendered, `NO_ANSWER_REQUEST`) and npm (replay got 403, `BLOCKED`). No Slack deployment of the QM tool. No River training job. |
| Was it built today? | Yes. Initial commit 13:16, rebuilt from scratch from about 14:10, built with parallel agents in Superset. |
| All three sites use Algolia? | Yes (hn, yc and devto all search through Algolia). Detection looks for any JSON request carrying the query, but the two non-Algolia sites we tried were refused (Open Library server-rendered, npm 403). |
| Is custos ever wrong? | Yes. On yc it contradicted "the page was showing 40 companies" because the request asked for 1000 hits; the page does show 40 of 162. |
