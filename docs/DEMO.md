# Pilot live demo: run sheet (90 seconds)

Judging starts at 5:00. Run everything from the repo root. Numbers marked TODO are to be filled in during rehearsal at 4:15, and only numbers that were actually seen on screen go in.

## Pre-flight (4:30)

- [ ] `bin/pilot call hn "yc"` returns results on the venue wifi. If it does, the saved API still works.
- [ ] `bin/pilot console` is open on http://localhost:4321 with the race view showing.
- [ ] Pre-run the three-claim custos check once (step 4 below), so a slow judge doesn't stall the demo and the saved result is ready to show.
- [ ] `gbrain import apis/ --no-embed` has been run after the last `bin/pilot pages`.
- [ ] If QM is deployed, Slack is open on the channel where `@pilot` is installed.
- [ ] Terminal font is large, and the scrollback is cleared.

## The run

| # | Time | Command | Say | Expect |
|---|---|---|---|---|
| 1 | 0:00 | console race view | "Agents click through the same websites every day, and nobody can check what they report." | |
| 2 | 0:10 | `bin/pilot learn hn https://hn.algolia.com/ "claude code"` | "A real Claude Code agent searches Hacker News while Pilot records every request. It only does this once." | Chrome opens and the agent's steps stream past. Last measured run: 35.0 s, 11 requests, then "✓ verified" |
| 3 | 0:30 | `bin/pilot call hn "rust async"` | "Same site, new question, no browser, no model." | Top 5 results with points. Last measured call: 947 ms |
| 4 | 0:40 | `bin/pilot swarm hn "rust" "gbrain" "yc" "robotics" "llm"` | "Many at once. In a browser that's minutes of clicking." | Wall time: TODO(measure) |
| 5 | 0:50 | `bin/pilot custos hn "The top story is 'Claude Code is steganographically marking requests'" "It has 2845 points" "I emailed the results to the team"` | "Confirmed, with the request it came from. Contradicted: the recording says 2,445. Unproven: no request ever sent an email." | CONFIRMED / CONTRADICTED / UNPROVEN, each citing `[n] "quote"`. TODO(measure) that the LLM judge gives exactly these three |
| 6 | 1:05 | `bin/pilot ask "top hacker news stories about claude code"` | "GBrain is the team's memory. A teammate's agent asks, GBrain picks the verified API, and it answers." | TODO(measure) latency |
| 7 | 1:15 | Slack: `@pilot hn claude code` (only if QM is live) | "I learned it. My teammate's agent just uses it." | Top 5 results in Slack |
| 8 | 1:25 | `bin/pilot list` | "Only proven work becomes memory or training data. Learn it once. Prove it. Call it forever." | `hn` row: calls, minutes saved, proof status |

## If something fails

- **The site or wifi is down during `learn`:** skip step 2. `apis/hn.*` is already learned and committed, so start at step 3 and say "learned earlier today". Show `apis/hn.recording.json` in the console as the proof.
- **The agent flakes:** run `bin/pilot learn hn https://hn.algolia.com/ "claude code" --typer` (a scripted browser, no model), and **say that it is scripted**.
- **The LLM judge is slow or fails:** show the pre-run verdicts in the console. Do **not** switch to `--rules` for the 2845 claim. The rules fallback returned UNPROVEN on it, not CONTRADICTED, because the digits 2845 appear somewhere in a recorded response (see `git show HEAD:apis/hn.custos.json`).
- **QM isn't deployed:** skip step 7 and show `qm/sandbox/tools/pilot/tool.json` instead. Say "it needs `qm up`".
- **Last resort:** the backup video. TODO(video URL)

## Judge questions

| Question | Answer |
|---|---|
| Where's the AI? | A real Claude Code agent drives the first run. custos is an LLM judge that has to cite a recorded request, and its quote is checked against that request. |
| Isn't this scraping? | It replays the site's own search request, read-only, on sites that allow it. It handles no logins and no write actions. |
| What if the site changes? | The call fails loudly with a typed error (`PILOT_BROKEN`, `BLOCKED`), and you re-run `learn`. Re-learning automatically, with custos approving the new version, is next. |
| Why not use the official API? | Most internal tools and portals don't have one. Pilot makes one from a single run. |
| Was it built today? | Yes. The git history starts at 1:16 pm, and it was built with parallel agents in Superset. A morning spike existed only as a throwaway prototype, and none of its code is here. |
| What didn't work? | Server-rendered sites (no JSON request), logins and pagination. River training is TODO: say whether a job actually ran. |
