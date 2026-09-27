# Pilot + QM

`bin/pilot qm <dir>` writes a QM deployment-layer tool. With it, a QM agent answers `@pilot <site> <question>` in
Slack by replaying a learned API, with no browser. The descriptor shape follows `ToolDescriptor` in
yc-software/qm `src/deployment/deployment-layer.ts`. Code: `qm()` in `src/share.ts`.

## Export and validate with QM's own parser

```
$ bin/pilot qm /tmp/qm-out
QM tool written to /tmp/qm-out (2 sites). Copy it to <your-qm-deployment>/sandbox/tools/pilot/ and run `qm up`.
$ ls /tmp/qm-out
call.mjs  hn.json  pilot  tool.json  yc.json
```

This was validated with QM's `parseToolDescriptor`, run under bun from a clone of yc-software/qm:

```ts
// validate-pilot.ts, at the root of a yc-software/qm checkout
import { readFileSync } from "node:fs";
import { parseToolDescriptor } from "./src/deployment/deployment-layer.ts";
const p = "/tmp/qm-out/tool.json";
const d = parseToolDescriptor(readFileSync(p, "utf8"), p);
console.log(JSON.stringify({ id: d.id, advertise: d.advertise, egress: d.egress, binary: d.install?.binary, files: d.install?.files?.length }, null, 1));
```

```
$ bun validate-pilot.ts
{ "id": "pilot", "advertise": "pilot",
  "egress": ["45bwzj1sgc-dsn.algolia.net", "uj5wyc0l7x-dsn.algolia.net"],
  "binary": "pilot", "files": 4 }
```

The parser does reject bad input. `{"id":"Pilot!"}` fails with `"id" must match ^[a-z0-9][a-z0-9-]{0,63}$`.

The tool installs `/usr/local/bin/pilot`, a shell shim, and `/usr/local/lib/pilot/call.mjs`, a self-contained
replay with no dependencies. It installs one `<name>.json` per learned API and no recordings. Egress is limited
to the API hosts.

## Running QM with Slack

From yc-software/qm `docs/getting-started.md`:

```
npm exec --yes --package=@yc-software/qm@latest -- qm init . --org <slug> --target <fly-or-aws>
npm install
# copy the exported dir to sandbox/tools/pilot/, then: qm check / qm up
```

Pilot doesn't do this, because every step needs credentials we don't have:

- `--target` must be `fly` or `aws`, so you need a Fly.io or AWS account with billing. There is no local target.
  `local/Dockerfile` is only the sandbox image.
- Sign-in uses the built-in `auth` broker. It needs an admin email, a verified sender, and a Resend key or SMTP
  credentials.
- Slack needs a Slack app: `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` (see `docs/external-slack.md`).
- It also needs a model-provider key (`docs/model-gateway.md`).

A source checkout has `npm run dev-instance:no-slack` / `dev-instance:slack` (`scripts/dev-instance.sh`).
That is the quickest path to a demo, but it still needs the model and Slack secrets above.

What Pat would do: `qm init` with Fly, add the Slack app tokens, copy `pilot` into `sandbox/tools/`, then run
`qm up`. No accounts were created.
