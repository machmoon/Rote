// Shared test helpers: a local stand-in for a learned site, and a throwaway apis/ dir.
import { createServer, type Server } from "node:http";
import { gzipSync } from "node:zlib";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const FIX = join(import.meta.dirname, "fixtures");
export const fixture = (f: string) => readFileSync(join(FIX, f), "utf8");

export interface Seen { method: string; url: string; body: string; }

/** Routes: /429 /403 /401 /500 /text /empty /gzip /json /hard?q= (ignores q) /real?q= (echoes q into titles) /body (echoes POST body query). */
export async function site(): Promise<{ base: string; seen: Seen[]; close: () => Promise<void> }> {
  const seen: Seen[] = [];
  const srv: Server = createServer(async (req, res) => {
    let body = ""; for await (const c of req) body += c;
    seen.push({ method: req.method!, url: req.url!, body });
    const u = new URL(req.url!, "http://x");
    const q = u.searchParams.get("q") ?? "";
    const send = (code: number, b: string | Buffer, type = "application/json") => { res.writeHead(code, { "content-type": type }); res.end(b); };
    switch (u.pathname) {
      case "/429": return send(429, "{}");
      case "/403": return send(403, "{}");
      case "/401": return send(401, "{}");
      case "/500": return send(500, "{}");
      case "/text": return send(200, "<html>hello</html>", "text/html");
      case "/empty": return send(200, "");
      case "/gzip": return send(200, gzipSync(JSON.stringify({ hits: [{ title: "gzipped hit", objectID: "g1" }] })), "application/octet-stream");
      case "/json": return send(200, fixture("algolia.json"));
      case "/hard": return send(200, JSON.stringify({ hits: [1, 2, 3].map((k) => ({ title: `always the same ${k}`, objectID: String(k) })) }));
      case "/real": return send(200, JSON.stringify({ hits: q ? [1, 2, 3].map((k) => ({ title: `${q} result ${k}`, objectID: `${q}${k}` })) : [] }));
      case "/body": { let bq = ""; try { bq = JSON.parse(body).query; } catch {} return send(200, JSON.stringify({ hits: [{ title: `body:${bq}`, objectID: "b" }] })); }
      default: return send(404, "{}");
    }
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const { port } = srv.address() as { port: number };
  return { base: `http://127.0.0.1:${port}`, seen, close: () => new Promise((r) => { srv.closeAllConnections(); srv.close(() => r()); }) };
}

export const api = (url: string, extra: Record<string, unknown> = {}) => ({
  name: "fx", site: "https://example.com/", method: "GET", url, body: "", headers: {}, learned_query: "claude code",
  driver: "manual" as const, browser_seconds: 30, requests_seen: 3, learned_at: "2026-09-27 12:00", ...extra,
});

export function tmpApis(files: Record<string, unknown> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "pilot-apis-"));
  for (const [f, v] of Object.entries(files)) writeFileSync(join(dir, f), typeof v === "string" ? v : JSON.stringify(v));
  return dir;
}
