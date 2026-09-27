import { existsSync, readFileSync, readdirSync } from "node:fs";
const dir = "/usr/local/lib/pilot/apis", [cmd, name, ...q] = process.argv.slice(2);
const form = (t) => t.replaceAll("={query:raw}", "={query:url}"), fill = (t, s, json) => form(t).replaceAll("{query:url}", () => encodeURIComponent(s)).replaceAll("{query:raw}", () => json ? JSON.stringify(s).slice(1, -1) : s);
if (cmd === "list" || !cmd) { for (const f of readdirSync(dir)) { const a = JSON.parse(readFileSync(dir + "/" + f)); console.log(a.name.padEnd(10), a.about || a.site); } process.exit(0); }
if (cmd !== "call" || !name) { console.log('usage: pilot call <site> "<question>" | pilot list'); process.exit(1); }
if (!/^[\w-]+$/.test(name) || !existsSync(dir + "/" + name + ".json")) { console.log("No learned site called " + JSON.stringify(name) + ". Try: pilot list"); process.exit(1); }
const a = JSON.parse(readFileSync(dir + "/" + name + ".json", "utf8")), query = q.join(" "), t = Date.now();
const r = await fetch(fill(a.url, query), { method: a.method, headers: a.headers, body: a.body ? fill(a.body, query, true) : undefined });
if (!r.ok) { console.log(name + " answered HTTP " + r.status + "; the saved request may be stale."); process.exit(1); }
const data = await r.json(), out = [], seen = new Set();
const text = (v) => typeof v === "string" ? v : v && typeof v === "object" ? (v.simpleText ?? (v.runs ?? []).map((x) => x.text ?? "").join("")) : "";
const walk = (o) => { if (out.length >= 5 || !o || typeof o !== "object") return; if (Array.isArray(o)) return o.forEach(walk);
  const ti = text(o.title) || text(o.name); if (ti && ["videoId","objectID","id","slug","url"].some((k) => k in o) && ti.length > 2 && !seen.has(ti)) { seen.add(ti); out.push(ti.trim() + (o.points != null ? " (" + o.points + " points)" : o.one_liner ? " — " + o.one_liner : "")); }
  Object.values(o).forEach(walk); };
walk(data);
console.log(name + "(" + JSON.stringify(query) + ") in " + (Date.now() - t) + " ms, learned by " + a.driver + " in " + a.browser_seconds + " s:");
out.forEach((x, i) => console.log((i + 1) + ". " + x));
