---
title: hn search API (hn.algolia.com)
type: learned-api
tags: [learned-api, search, hn]
site: https://hn.algolia.com/
method: POST
learned: 2026-09-27 21:14
driver: typer
---

# hn search API (hn.algolia.com)

Hacker News Search powered by Algolia

Search hn.algolia.com by keyword without a browser. Learned by a scripted browser in one run (24.3 s, 16 requests); a call takes about a second. Replay verified 2026-09-27 21:15: a different query returns different results. Status: custos: 0/1 of the agent's claims confirmed against the recording.

## Call

```sh
pilot call hn "<query>"
```

Underlying request: `POST https://uj5wyc0l7x-2.algolianet.com/1/indexes/Item_dev/query` with the query templated as `{query}`.

## Example response

`pilot call hn "claude code"` returned:

- Claude Code is steganographically marking requests (2445 points)
- Claude 3.7 Sonnet and Claude Code (2127 points)
- Claude Code's source code has been leaked via a map file in their NPM registry (2095 points)
- The Claude Code Source Leak: fake tools, frustration regexes, undercover mode (1376 points)
- Issue: Claude Code is unusable for complex engineering tasks with Feb updates (1364 points)
