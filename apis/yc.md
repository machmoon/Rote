---
title: yc search API (ycombinator.com/companies)
type: learned-api
tags: [learned-api, search, yc]
site: https://www.ycombinator.com/companies
method: POST
learned: 2026-09-27 21:21
driver: claude
---

# yc search API (ycombinator.com/companies)

The YC Startup Directory | Y Combinator

Search ycombinator.com/companies by keyword without a browser. Learned by a Claude Code agent in one run (32.3 s, 17 requests); a call takes about a second.  Status: custos: 56/59 of the agent's claims confirmed against the recording.

## Call

```sh
pilot call yc "<query>"
```

Underlying request: `POST https://45bwzj1sgc-dsn.algolia.net/1/indexes/*/queries` with the query templated as `{query}`.

## Example response

`pilot call yc "dental"` returned:

- Alara (Procurement Platform for Dental Offices)
- Rinse (We're building the One Medical for dental)
- Dodo (AI agents that handle communications for clinics)
- onederful (Dental Insurance API)
- Arini (AI receptionist for dentists)
