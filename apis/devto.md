---
title: devto search API (dev.to)
type: learned-api
tags: [learned-api, search, devto]
site: https://dev.to/
method: POST
learned: 2026-09-27 14:38
driver: claude
---

# devto search API (dev.to)

DEV Community — A space to discuss and keep up software development and manage your software career

Search dev.to by keyword without a browser. Learned by a Claude Code agent in one run (66.8 s, 19 requests); a call takes about a second. Replay verified 2026-09-27 14:38: a different query returns different results. Status: custos: 51/57 of the agent's claims confirmed against the recording.

## Call

```sh
pilot call devto "<query>"
```

Underlying request: `POST https://prsobfp46h-3.algolianet.com/1/indexes/Article_production/query` with the query templated as `{query}`.

## Example response

`pilot call devto "claude code"` returned:

- Claude Code Batch File Edits: Using MultiEdit and Write Together to Cut Round-Trips in Long Refactor Sessions
- jsmanifest
- Claude Code Compaction: Why Your Session Forgets Mid-Task (and the Fix)
- Alfredo Izquierdo
- Claude Code Subagents Were 48% of My Bill. Their Output Was 0.9%
