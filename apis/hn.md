---
title: hn search API (hn.algolia.com)
type: learned-api
tags: [learned-api, search, hn]
site: https://hn.algolia.com/
method: POST
learned: 2026-09-27 21:16
driver: claude
---

# hn search API (hn.algolia.com)

Hacker News Search powered by Algolia

Search hn.algolia.com by keyword without a browser. Learned by a Claude Code agent in one run (35 s, 11 requests); a call takes about a second. Replay verified 2026-09-27 21:16: a different query returns different results. Status: custos: 31/37 of the agent's claims confirmed against the recording.

## Call

```sh
pilot call hn "<query>"
```

Underlying request: `POST https://uj5wyc0l7x-dsn.algolia.net/1/indexes/Item_dev/query` with the query templated as `{query}`.

## Example response

`pilot call hn "claude code"` returned:

- Claude Code is steganographically marking requests (2445 points)
- Claude 3.7 Sonnet and Claude Code (2127 points)
- Claude Code's source code has been leaked via a map file in their NPM registry (2095 points)
- The Claude Code Source Leak: fake tools, frustration regexes, undercover mode (1376 points)
- Issue: Claude Code is unusable for complex engineering tasks with Feb updates (1364 points)
