# Pilot + Memorable

Memorable stores *procedures*: how an agent actually finished a task, so the next agent can recall it instead of
working it out again. Pilot learns a site once. Every verified learn run becomes a Memorable procedure called
"search <site> for <query> and turn the result request into a reusable API". When another agent later faces a site,
`memorable recall` hands it the steps that worked.

Code: `src/memorable.ts`. Command: `pilot memorable`.

## Only proven runs

Pilot applies the same rule here as everywhere else: a run becomes memory only if it passed.

- the replay probe passed (`apis/<name>.json` → `verified.ok`), and
- custos judged the agent's summary and **contradicted nothing**.

```
$ bin/pilot memorable
  ✓ devto    memorable/devto.trace.json
  ✓ hn       memorable/hn.trace.json
  left out: uitest (custos has not judged this run); yc (custos contradicted 1 of 59 claims)
  2 trace(s) ready. `pilot memorable --send` ingests them into Memorable.
```

## Trace format

The trace uses Memorable's generic harness input, read from the published CLI (`memorable-cli@0.5.30`,
`dist/cli.js`, the `memorable ingest` path): `{session_id, task_description, harness, tool_calls: [{name, input, result?}]}`.

The tool calls are the real run from `apis/<name>.recording.json`:

1. `browser_navigate` to the site
2. the agent's own browser steps (`browser_snapshot`, `browser_type`, …)
3. `capture_request`: the endpoint that carried the answer. The query string is stripped because it can carry site keys.
4. `Write apis/<name>.json`
5. `Bash pilot verify <name>`, then `Bash pilot call <name> "<query>"`

Memorable refuses a trace that "only read and searched" (reason `no_decisive_steps` in the CLI). Steps 4 and 5 are
the write and the execute steps that learn really performs, so these traces are accepted.

## Linking Memorable (Pat: about 1 minute)

Memorable needs a workspace login, and nothing is stored until you consent. Nobody has logged in on this machine
yet. `memorable status` says `extraction api not configured` and `consent unset`.

```
npx memorable-cli login        # opens a browser and links this machine to your workspace
npx memorable-cli enable       # explicit consent
npx memorable-cli init gbrain  # optional: store procedures in your GBrain instead of ~/.memorable
bin/pilot memorable --send     # runs `memorable ingest` on each verified trace
bin/pilot memorable recall "search hacker news for a topic"
```

Until you link it, `--send` and `recall` stop with those same instructions and don't fail silently:

```
$ bin/pilot memorable hn --send
  ✓ hn       memorable/hn.trace.json
  not sent: Memorable isn't linked here. Run `npx memorable-cli login && npx memorable-cli enable`, then `pilot memorable --send`.
$ bin/pilot memorable recall "search hacker news"
SOURCE_UNAVAILABLE: Memorable is not linked on this machine. Run: npx memorable-cli login && npx memorable-cli enable
```

## GBrain

`memorable init gbrain` makes Memorable store its procedures as pages in GBrain. With that, one brain holds both the
learned API (`learned-apis/hn`, written by Pilot) and the procedure for learning the next one (written by Memorable).
