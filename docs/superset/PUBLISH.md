# Publish this page

Run from the workspace root (/Users/patliu/.superset/worktrees/Thanks/shelled-steed) after `superset auth login`:

```sh
superset pages publish docs/superset/ --title "Pilot — learn it once, prove it, call it forever" --description "Agents learn a site once, custos proves their claims against the recording, and the whole team calls a verified API: real race replay, real verdicts, demo video." --label "final: race replay, 4 sites, custos verdicts, pilot ask, integrations, console screens, demo video"
```

Republishing the same path from this workspace adds a version to the same page.

To refresh the page from whatever is in `apis/`, `docs/screens/` and `video/pilot-demo.mp4` right before publishing:

```sh
python3 /private/tmp/claude-501/-Users-patliu--superset-worktrees-Thanks-shelled-steed/8b9efa13-3bd0-4e2e-aed5-077d151c4f0a/scratchpad/superset/build.py
```
