# Pilot: hostile-judge critique and rehearsal (2026-09-27, ~14:35–14:55)

Everything here was checked against the files or measured on venue wifi. The only commands run were `list`, `call`, one `swarm`, a 3-claim `custos`, 6×`ask`, `verify yc`, a console on port 4488 (now stopped), and dry-run `river` and `qm` exports written to the scratchpad. **Side effects:** `apis/yc.json` now has `verified.ok: true` (from `verify yc`). `apis/hn.claims.json` was rewritten with the same 3 verdicts. Rehearsal calls were appended to `apis/*.calls.log`.

## 1. Claims vs. reality

| Where | Claim | Reality | Severity |
|---|---|---|---|
| README "Unverifiable" row; SUBMISSION long description | custos: **34 claims, 32 confirmed, 0 contradicted, 2 unproven** | `apis/hn.custos.json` (judged 14:23) says **37 claims, 31 confirmed, 0 contradicted, 6 unproven**. The "What is real" paragraph ("its 2 UNPROVEN verdicts") is stale too. | **High**: the first number a judge checks is wrong |
| README "Repeated" row; SUBMISSION; DEMO step 3 | **947 ms, ~37× faster** | That is one call. `hn.calls.log` median over about 340 calls is **~1.05 s (≈33×)**, and the console shows avg-of-50 **1.48 s = 24×**. Live on venue wifi I measured **6.9–7.9 s (CLI prints "4× faster")**, a swarm at 4.7 s per call, and curl alone at 0.6–5 s. So Pilot isn't the slow part, the wifi is. There are three different "×" numbers across README, console and CLI. | **High**: "under a second" on stage will be false on this wifi |
| README Sources | "`apis/hn.calls.log` (call latency)" | `apis/*.calls.log` is in **`.gitignore`**, so a judge who clones the repo cannot check it. | Med |
| README "Slow" row | "A scripted browser took 24.3 s and 16 requests" | That recording was overwritten. It exists only as `git show 161f09c:apis/hn.recording.json`. Cite that or drop the line. | Low |
| README Screens table | `docs/screens/{race,custos,library}.png` | `docs/screens/` is **empty**, so the images at the top of the README are broken. | **High** (first thing seen on GitHub) |
| README "At scale"; DEMO step 4 | Swarm wall time TODO | Measured: 5 queries in **4.76 s** (wifi-bound). The 50-query number is still unmeasured. | Med |
| README top / sponsor table | `pilot ask` "in progress", MCP "in progress", ask latency TODO | Both work. I measured `ask` at **1.1–2.1 s total, GBrain routing 550–660 ms**, and 5/5 questions routed correctly. An off-topic question ("weather in SF") correctly fails with `UNKNOWN_PILOT`. | Med (it undersells working features) |
| README River row; SUBMISSION | "Only runs custos fully confirmed go into River" | `pilot river` today exports **0 runs**: devto 51/57, hn 31/37 and yc 56/59 all fail the "every claim CONFIRMED" rule. The River story currently shows an empty file. | **High** if a River judge asks to see it |
| Console Library chips "QM · @pilot hn" (green); README "Tool export done" | Implies it is shared to QM | There is **no `qm/` directory** in the worktree (`pilot qm` was never run). DEMO's fallback "show `qm/sandbox/tools/pilot/tool.json`" would show a missing file. | Med–High (reads as dishonest) |
| DEMO pre-flight | "`gbrain import apis/ --no-embed`" | The code writes pages with `gbrain put` into **`~/.gbrain-pilot`** (`src/gbrain.ts` BRAIN_HOME). A bare `gbrain import` targets `~/.gbrain`, which refuses writes (`integrations/gbrain.md`). The step is wrong or stale, and so is the README quick-start line for `pilot pages`. | Med |
| DEMO fallback | "see `git show HEAD:apis/hn.custos.json`" for the `--rules` UNPROVEN on 2845 | HEAD's file holds the 37 summary verdicts. The rules result is at **`161f09c:apis/hn.custos.json`**. | Low |
| DEMO timing | 90 s, with `learn` at 0:10–0:30 | `learn` takes **35 s** by itself, and custos took **14 s**. The script runs to about 2 min. A live `learn hn` also **overwrites `hn.recording.json`**, which leaves the committed 37 verdicts pointing at request indices of the old recording. | **High** |
| Console Learn replay; `apis/*.json learned_at` | "recorded 2026-09-27 21:16" | That is **UTC** (14:16 PDT), shown with no zone. At a 5 pm demo, "21:16" reads like it was learned last night. `judged_at` uses local time, so the two are inconsistent. | Med (hurts the "built today" optics) |
| README "What is real" | "A throwaway Python spike from the morning" | Honest, but it invites "prebuilt?" questions. The git history shows an empty initial commit at 13:16, then **950 lines in one commit at 14:16** (`161f09c`). Be ready to say the Superset parallel agents wrote it between 13:16 and 14:16. Showing the Superset workspaces or transcripts is the proof. | Med |
| Console Library "3.3 h of browser time saved" / `pilot list` "153 min saved" | Time saved | Each logged call counts as one avoided 35 s agent run, including tests, swarms and my rehearsal. The number is inflated by our own calls. | Med |
| yc custos | 1 CONTRADICTED | "The page was showing 40 companies" was CONTRADICTED because `hitsPerPage=1000`. The page likely does render 40. This is probably a **custos false positive**, and it paints yc's chip red. It is good material for "custos is not always right", but only if we say so. | Low–Med |

Accurate as stated: 35.0 s, 11 requests and 5 tool calls (`hn.recording.json`: `duration_ms` 35014, 5 agent steps). Verify passed (30/30 results, differs). All confirmed verdicts are grounded (`grounded: true`). The 3-claim demo gave exactly CONFIRMED / CONTRADICTED / UNPROVEN, with 2845 vs 2445 cited from `[10]`. 39/39 tests pass.

## 2. Judge questions: best honest answers and gaps

1. **"Where is GBrain essential, not bolted on?"** Answer: `pilot ask` has no other router. `src/gbrain.ts route()` runs `gbrain query --no-expand --json` and picks the learned API only from GBrain hits. `learn` and `custos` write the API page and the linked `proofs/<name>` page into the brain. *Gap:* the answer doesn't show that GBrain did anything. Print the top 2–3 hits with scores (all `r.route.hits` in `cli.ts` ask), and show the proof page in the Library. Also, the routing score for "rust async runtimes" was 0.05, and nothing refuses a weak match (no threshold).
2. **"Isn't this just scraping?"** Answer: it replays the site's own public JSON search request (for HN and YC, Algolia search-only keys that are already in their page source), read-only, with no logins. That is closer to "discovering the undocumented API" than to HTML scraping. *Gap:* none of the code limits the request rate. Add a per-host concurrency cap to `swarm` (today it fires 50 at once with `Promise.all`).
3. **"ToS / auth / rate limits?"** Answer: sites without auth only. Cookies are dropped. A 429 maps to `RATE_LIMITED` and 401/403 to `BLOCKED` (`src/replay.ts`). The README says to use it only on sites that allow it. *Gap:* the concurrency cap above.
4. **"What happens when the site changes?"** Answer: typed failures (`PILOT_BROKEN`, `INVALID_SOURCE_RESPONSE`) plus `verify`'s probe. Commit `edb4b33` "pilot repair" re-learns with the agent. *Gap:* README and DEMO don't mention `repair`. Say it exists (after checking it with `bin/pilot` help).
5. **"How is custos different from asking an LLM 'is this right'?"** Answer: (a) the judge sees only the recorded HTTP evidence, not the web or prior knowledge. (b) Every CONFIRMED or CONTRADICTED verdict must cite `[request] "quote"`. (c) The **grounding guard** (`custos.ts ground()`) checks that the quote really is in that request and downgrades it otherwise, so a hallucinated citation can't pass. (d) An action claim with no request behind it ("I emailed…") is UNPROVEN. *Gap:* nothing shows the guard firing. Keep one saved example of a downgraded verdict ready to show.
6. **"Why not official APIs?"** Answer: most sites and internal tools don't have one. Where one exists, use it. Pilot builds one from a single agent run. *Honest caveat:* both HN and YC are Algolia, so a judge may call these the easy case. devto (also Algolia) doesn't help. A learned site that isn't Algolia would be the strongest proof, but that needs `learn` and is out of scope for this hour.
7. **"Memorable / UFO?"** Nothing was built for them. Leave them blank, as SUBMISSION already says.

## 3. Rehearsal log (venue wifi, 14:36–14:45)

| Step | Command | Time | Result |
|---|---|---|---|
| list | `bin/pilot list` | 0.24 s | OK |
| call | `call hn yc` / `call hn "rust async"` | **8.2 s / 7.2 s** | Results were correct, but the CLI printed "4×/5× faster" |
| swarm | 5 queries | 5.0 s (4.76 s wall) | OK. "vs ~2.9 min" |
| custos | 3 demo claims | **14.3 s** | Exactly C / X / U with citations. Also writes GBrain pages |
| ask ×5 | see below | 1.2–2.1 s | 5/5 routed. The search term was poor in 2 of 5 |
| verify yc | | 0.7 s | ✓ |
| learn | not run (forbidden) | ~35 s | Would overwrite the proof recording |

`ask` quality:
- "top hacker news stories about claude code" → hn("claude code"). ✓ Perfect.
- "what is hacker news saying about gbrain" → hn("gbrain"). ✓ Good.
- "which YC startups are building dental software" → yc("**building dental software**"). ✗ Results 3–5 are junk (Lobby, Glow Energy). "building" and "software" need to be stop words.
- "find me robotics companies in the yc directory" → yc("robotics"). ✓
- "any good posts on rust async runtimes?" → hn("**good** rust async runtimes"). ✗ Junk (an ePub reader, tmux). "good" needs to be a stop word.

## 4. Console (Playwright, system Chrome headless, 1440×900 and 390 wide)

Screenshots: `…/scratchpad/critique/01…09*.png`.
- **Broken: Library → Ask shows `[object Object]`.** `web/index.html` about line 717 does `r.answer ?? r.text ?? r.result`, but `/api/ask` returns `{route, route_ms, result:{name,query,ms,results}}`. This is the GBrain feature, visibly broken.
- Race works and looks good. It is honest (it shows the google-analytics requests in the agent lane). But the headline "Pilot answered 11× faster" appears while the agent lane still says RUNNING, and the hero stat says 24× in the same view.
- Custos view: 37 cards in one very long column. The 6 UNPROVEN sit at the bottom, and a judge sees a wall of green. Show the summary counts and the non-confirmed verdicts first, then collapse the CONFIRMED ones.
- Library: the green "QM · @pilot" chips are dishonest until `pilot qm` has run and a deployment exists. The yc chip is red because of a likely false positive (see above).
- Learn replay: the UTC timestamp problem described in section 1.
- Mobile (390 px): horizontal overflow, with the headline clipped and an empty drawer area on the right. This doesn't matter on a projector.
- Console errors: one 404 (probably the favicon) and one 400 from the `probeAsk` empty-question probe. Harmless.

## 5. Top 10 fixes, ranked by impact / effort (next 60 min)

1. **`web/index.html` ~l.717, Ask renders `[object Object]`.** Render `r.route.hit.slug` (score, `route_ms`) and a list of `r.result.results` (title and detail), plus `custos r.confirmed`. (5 min)
2. **README.md + SUBMISSION.md custos numbers.** Change 34/32/0/2 to **37/31/0/6** (from `apis/hn.custos.json`), and change "its 2 UNPROVEN" to 6, explaining that they are sort/time-filter/displayed-query claims with no request field behind them. (5 min)
3. **Speed claims (README, SUBMISSION, DEMO step 3, console hero).** Use one number: "35 s agent vs ~1 s call (median of N logged calls ≈ 33×)". Drop "947 ms / 37×" and "under a second". On stage, say "on this wifi it's a few seconds, still one request, no browser". Better still, demo from a phone hotspot. In `src/cli.ts` `call`, print the ratio against the logged median, not the single live call. (10 min)
4. **DEMO.md: do not run `learn hn` live.** It takes 35 s and overwrites the proof recording. Use the console's "Replay a saved run", or `learn` a *new name*. Re-time the script to about 90 s with the measured numbers: custos 14 s, ask about 1.5 s, swarm about 5 s. (5 min)
5. **README screens.** Copy `scratchpad/critique/03-race-done.png`, `04-custos.png` and `05-library.png` (after fix 1) to `docs/screens/{race,custos,library}.png`, or remove the table. (3 min)
6. **River shows 0 runs.** Either change `src/share.ts river()` to keep runs with 0 CONTRADICTED and ≥90% CONFIRMED (and say so), or change README/SUBMISSION to say plainly "custos currently rejects all 3 runs: strict filter, dataset empty". The second option is honest and costs nothing. (5 min)
7. **QM honesty.** Run `bin/pilot qm` so `qm/sandbox/tools/pilot/tool.json` exists for the DEMO fallback. In `web/index.html` Library, make the QM chip read "QM · tool exported (needs qm up)" and not green. (5 min)
8. **`src/gbrain.ts` STOP list.** Add `good great building build software tool tools app apps`, which fixes 2 of the 5 rehearsal questions. In `src/cli.ts` ask, print the top 3 GBrain hits with scores so GBrain's role is visible. (5 min)
9. **Timestamps.** In `src/learn.ts`/`store.ts`, `learned_at`/`started_at` shown as "21:16" are UTC. Use `stamp()` (local), or label them "UTC", in `web/index.html` Learn replay and `apis/*.json`/`.md`. This protects the "built today" story. (5 min)
10. **README/DEMO stale bits.** Remove "`pilot ask` in progress / MCP in progress" and add the measured ask latency (1.1–2.1 s, routing ~0.6 s). Fix the pre-flight to say `bin/pilot pages` (it writes to `~/.gbrain-pilot` itself), not `gbrain import`. Fix the DEMO ref `HEAD:` → `161f09c:apis/hn.custos.json`. Remove `apis/*.calls.log` from `.gitignore`, or stop citing it as a source. Mention `pilot repair` for "what if the site changes". (10 min)
