# Pilot + GBrain

GBrain is Pilot's shared memory. Every learned API and every custos verdict becomes a GBrain page, and
`pilot ask` asks GBrain which learned API answers a question before Pilot calls it.

Verbs are GBrain's own (read in `~/Desktop/Coding/gbrain-src`, v0.59): `put <slug> --force` (markdown on stdin,
`src/core/operations.ts` put_page), `link <from> <to> --link-type discusses` (a link type declared in the
`gbrain-base-v2` schema pack), `query <q> --no-expand --json` for routing. Code: `src/gbrain.ts`.

## Which brain

Pilot writes to `~/.gbrain-pilot` (override with `PILOT_GBRAIN_HOME` or `GBRAIN_HOME`).

Pat's default brain `~/.gbrain` refuses writes: `recovery_required: The filesystem device identifier changed`.
The volume's device id went from 16777233 to 16777230 (a remount), and the root stamp still records the old one
(`src/core/persistence/physical-root-record.ts`). GBrain only allows the fix, `gbrain sources writer transfer
prepare default --self-transfer`, with `--admin-intent` and `--expected-state` from an operator who has read
`docs/architecture/topologies.md`. That is Pat's call, so Pilot doesn't do it. Reads from `~/.gbrain` still work.

## Write pages (happens automatically)

`pilot learn`, `pilot custos` and `pilot pages` all write into the brain:

```
$ bin/pilot pages
  gbrain: learned-apis/hn, proofs/hn written to /Users/patliu/.gbrain-pilot
  gbrain: learned-apis/yc, proofs/yc written to /Users/patliu/.gbrain-pilot

$ GBRAIN_HOME=~/.gbrain-pilot gbrain list
proofs/hn        custos-proof  custos verdicts for hn (https://hn.algolia.com/)
learned-apis/hn  learned-api   hn search API (hn.algolia.com)
proofs/yc        custos-proof  custos verdicts for yc (https://www.ycombinator.com/companies)
learned-apis/yc  learned-api   yc search API (ycombinator.com/companies)

$ GBRAIN_HOME=~/.gbrain-pilot gbrain search "hacker news"
[0.5332] learned-apis/hn -- # hn search API (hn.algolia.com)
Hacker News Search powered by Algolia
```

`proofs/<name>` lists each verdict with its cited request and quote, and links to `learned-apis/<name>`
(`gbrain backlinks learned-apis/hn` shows the link).

`gbrain import apis/ --no-embed` also works, but it creates slugs `hn` and `yc` from the file names, which
duplicate the `learned-apis/*` pages. Use `pilot pages` instead.

## Ask: GBrain picks the API, Pilot answers

```
$ bin/pilot ask "what is hacker news saying about gbrain"
gbrain → learned-apis/hn (score 0.16, 548 ms)  hn("gbrain")  534 ms  custos 31/37 confirmed
  • Show HN: Skill for your agent to visualize your gbrain and Obsidian  23 points
  • GBrain – The memex, built for people who think for a living  9 points
  ...
$ bin/pilot ask "startups in the yc directory doing robotics"
gbrain → learned-apis/yc (score 1.00, 571 ms)  yc("robotics") ...
  • AutoPallet Robotics  We make robots that move boxes in warehouses
```

Routing uses `gbrain query`, not `search`. `search` ANDs every term in a tsvector query, so a natural question
like "hacker news gbrain" returns nothing. `--types learned-api` also returned nothing in v0.59, so Pilot keeps
only the `learned-apis/` slugs itself. The search term is the question minus filler words and the site's own
words (`termFrom`, tested in `test/gbrain.test.ts`). Pass `--query "<q>"` to set it yourself.

## Give agents the brain over MCP

`gbrain serve` is a stdio MCP server. With `--surface starter` it has 33 tools, including search, query,
get_page, recall and traverse_graph. `integrations/claude-mcp.json` starts both servers:

```
claude --mcp-config integrations/claude-mcp.json --strict-mcp-config --allowedTools mcp__pilot,mcp__gbrain
# or permanently:
claude mcp add gbrain -e GBRAIN_HOME=$HOME/.gbrain-pilot -- gbrain serve --surface starter
```

Checked with the MCP SDK client: `search {"query":"hacker news"}` returned `learned-apis/hn` first.

## Hosted GBrain (gbrain.io)

There is no hosted-brain URL or token in `~/.gbrain/config.json`. The only gbrain.io references in the source
are the Google OAuth relay (`src/core/creds/relay-client.ts`) and the hosted credentials vault. To use a hosted
brain you need its MCP URL and a bearer token from Pat's gbrain.io account. Then:

```
gbrain connect <mcp-url> --token <token> --install     # wires Claude Code to the remote brain
```

For Pilot to write there too, set `PILOT_GBRAIN_HOME` to a brain initialized with `gbrain init --url <postgres>`,
or use the remote MCP's `put_page`. None of this was done: it needs Pat's login.
