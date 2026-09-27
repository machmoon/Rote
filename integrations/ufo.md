# Pilot on UFO

Research date: 2026-09-27. Sources are cited inline; nothing here comes from memory.

## What UFO is

"UFO is an AI teammate designed to do real work. It is chat-first" (https://ufo.ai/docs/getting-started/introduction/).
You reach it from the web portal (app.ufo.ai), Slack, iMessage, or a terminal client (`curl -fsSL https://ufo.ai/ufo | sh`,
https://ufo.ai/docs/work/terminal/). It can use a browser, a terminal, connected accounts, memory, and scheduled tasks
(https://ufo.ai/docs/work/tasks/). The changelog lists "GBrain import — sync an existing company brain to UFO" and a
GBrain connection (https://ufo.ai/docs/changelog/).

The runtime is open source: **github.com/ufo-ai/ufo-core** (Apache-2.0, "Business agent operating system"; read at
commit 63ba388). You can run it yourself (`make install && make init EMAIL=... && make serve`, README "Quick start") on
SQLite with your own `UFO_ANTHROPIC_API_KEY`/`UFO_OPENAI_API_KEY`.

## What an "extension" is

From ufo-core README "Extend it" and spec.md "Extension system": "An extension is a Python package that imports only
`ufo.sdk` and declares one entry point":

```toml
[project.entry-points."ufo.extension"]
acme = "ufo_ext_acme.manifest:manifest"
```

`manifest()` returns a `Manifest` that can register tools, objects, skills, connectors, sources, hooks, jobs, routes,
subagents and more. "Everything is an extension" (README): the browser, MCP, GBrain sync, memory and scheduled tasks
are all extensions under `extensions/`. The loader finds extensions through Python entry points
(`core/src/ufo/host/ext/loader.py`, `discovered()`); in dev every installed extension loads, in a deploy
`ufoctl ext install` pins it into the lockfile. Third-party extensions may register tools but not privileged points
(census, spend gates, and so on), which the same function enforces.

There is no public extension marketplace that I could find. The hosted docs site (58 pages in
https://ufo.ai/sitemap-0.xml) doesn't mention third-party extensions. On hosted UFO the supported way in is
**Connect an MCP server** (https://ufo.ai/docs/connectors/mcp/): Streamable HTTP only, an optional bearer token, and the
admin must add it. "Local stdio servers are not supported by a hosted workspace."

## What was built (both tested)

### 1. `integrations/ufo/`: a native UFO extension (`ufo-ext-pilot`)

- `pyproject.toml` declares `pilot = "ufo_ext_pilot:manifest"` in the `ufo.extension` group.
- `ufo_ext_pilot.py` registers three read-only tools: `pilot_list`, `pilot_ask` (GBrain picks the site) and `pilot_call`.
  The design is copied from ufo-core's own `extensions/perplexity/ufo_ext_perplexity.py` (a single-module manifest)
  and `extensions/mcp/ufo_ext_mcp.py`, which supplies the fastmcp `StreamableHttpTransport` client, `ToolFailure(...)
  .result(untrusted=True)` on errors, and `untrusted=True, binds_member_authority=False`. The tools reach Pilot through
  the HTTP server below. One deviation: the endpoint and token come from environment variables (`PILOT_MCP_URL`,
  `PILOT_MCP_TOKEN`) instead of an object store and credential slot, because this extension talks to one fixed server.

**Verified** in a scratch clone of ufo-core with `uv sync` and `uv pip install -e integrations/ufo`:
`ufo.host.ext.loader.discovered()` returns `pilot 0.1.0 ['pilot_list','pilot_ask','pilot_call']` from dist
`ufo-ext-pilot`, and `validate_tool_declaration` passes for each tool. Calling the handlers against the live server gave
these results:

- `pilot_list` returned devto, hn and yc with their custos counts.
- `pilot_ask("what is hacker news saying about gbrain")` returned "GBrain routed to learned-apis/hn … hn("gbrain") in
  2145 ms" plus results.
- `pilot_call(name="nope")` returned `is_error` with `UNKNOWN_PILOT`.

**Not verified:** a full `make serve` run with an agent turn. That needs model API keys in ufo-core's `.env`.

### 2. `integrations/ufo-mcp-http.ts`: Pilot's MCP server over Streamable HTTP

This wraps the same `buildServer()` from `src/mcp.ts`, which is unchanged. It follows the SDK's own stateless example
(`node_modules/@modelcontextprotocol/sdk/dist/esm/examples/server/simpleStatelessStreamableHttp.js`), with one
deviation: it uses `node:http` instead of express. Optional bearer auth comes from `PILOT_MCP_TOKEN`, and there is a
`/healthz` endpoint.

**Verified** with curl: `initialize` and `tools/list` return Pilot's 5 tools. `tools/call pilot_call {hn, gbrain}`
returned 1444 hits (top: "Show HN: Skill for your agent to visualize your gbrain and Obsidian"). GET returns 405, and a
request without the token returns 401 when a token is set.

## How Pat demos it

**A. Self-hosted UFO + native extension (no ufo.ai account; needs model keys):**
```sh
node integrations/ufo-mcp-http.ts            # Pilot on http://127.0.0.1:8787/mcp
git clone https://github.com/ufo-ai/ufo-core && cd ufo-core
make install && uv pip install -e ../shelled-steed/integrations/ufo
cp .env.template .env                        # set UFO_ANTHROPIC_API_KEY (+ UFO_OPENAI_API_KEY)
make build && make init EMAIL=you@x.com && make serve
./client/target/debug/ufo "use pilot_ask: what is hacker news saying about gbrain"
```

**B. Hosted UFO (needs a ufo.ai workspace, which means signing up; Pat's call):**
```sh
PILOT_MCP_TOKEN=$(openssl rand -hex 16) node integrations/ufo-mcp-http.ts
cloudflared tunnel --url http://127.0.0.1:8787   # installed at /opt/homebrew/bin/cloudflared; prints https://<x>.trycloudflare.com
```
Then, as workspace admin, send this in UFO chat: "Connect an MCP server named pilot at https://<x>.trycloudflare.com/mcp."
Enter the token in the private credential form, never in chat (https://ufo.ai/docs/connectors/mcp/). UFO calls
`list_mcp_tools`/`call_mcp_tool` with `server: "pilot"`.

**The automation (UFO's "Best Automation for startups")** is a scheduled task (https://ufo.ai/docs/work/tasks/), for
example: "Every weekday at 9:00 AM Pacific, use pilot to search hn, devto and yc for our company name and competitors.
Post new results in #growth. Send nothing when nothing changed." Each run is a handful of ~1 s replays and never drives
a browser. Only Pilot runs whose claims custos proved reach the tools.

## Honest caveats

- Hosted UFO can't load a pip package; only UFO's team can add in-tree extensions. On hosted UFO the MCP path (B) is
  the extension.
- Each trycloudflare URL is temporary, and its tunnel dies with the process.
- A `pilot_call` through either path appends to `apis/<name>.calls.log`, like any Pilot call.
- `pilot_custos` and `pilot_swarm` go through the MCP path but are left out of the native extension. It is read-only
  search by design.
