// Replaying a learned API: fill the template, send it, pull out the results. No browser, no model.
import { gunzipSync } from "node:zlib";
import { fail } from "./errors.ts";
import { type Api, logCall, loadApi } from "./store.ts";

export const fill = (t: string, q: string) => t.replaceAll("{query:url}", encodeURIComponent(q)).replaceAll("{query:raw}", q);

export interface Result { title: string; detail: string; }
export interface CallResult { name: string; query: string; ms: number; results: Result[]; total?: number; data: unknown; }

export async function rawCall(api: Api, q: string): Promise<{ data: unknown; ms: number }> {
  const body = api.body ? fill(api.body, JSON.stringify(q).slice(1, -1)) : undefined;
  const t = performance.now();
  let res: Response;
  try {
    res = await fetch(fill(api.url, q), { method: api.method, headers: api.headers, body, signal: AbortSignal.timeout(15000) });
  } catch (e) {
    throw fail("SOURCE_UNAVAILABLE", `${new URL(api.url).host} did not answer: ${(e as Error).message}`, api.name);
  }
  if (res.status === 429) throw fail("RATE_LIMITED", `${new URL(api.url).host} is rate limiting (429)`, api.name);
  if (res.status === 401 || res.status === 403) throw fail("BLOCKED", `${new URL(api.url).host} refused the saved request (${res.status}); re-run learn`, api.name);
  if (!res.ok) throw fail("PILOT_BROKEN", `${new URL(api.url).host} answered ${res.status}; the saved request may be stale, re-run learn`, api.name);
  let buf = Buffer.from(await res.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
  try {
    return { data: JSON.parse(buf.toString("utf8")), ms: performance.now() - t };
  } catch {
    throw fail("INVALID_SOURCE_RESPONSE", `${new URL(api.url).host} stopped returning JSON`, api.name);
  }
}

/** Generic result extraction, no site-specific code: objects with a title/name and an id-like key, plus a score-ish field. */
export function items(data: unknown, n = 5): Result[] {
  const out: Result[] = [];
  const seen = new Set<string>();
  const text = (v: any): string =>
    typeof v === "string" ? v : v && typeof v === "object" ? v.simpleText ?? (v.runs ?? []).map((r: any) => r.text ?? "").join("") : "";
  const walk = (o: any) => {
    if (out.length >= n || !o || typeof o !== "object") return;
    if (Array.isArray(o)) return o.forEach(walk);
    const t = text(o.title) || text(o.name);
    const hasId = ["videoId", "objectID", "id", "slug", "url"].some((k) => k in o);
    if (t && hasId && t.length > 2 && !seen.has(t)) {
      seen.add(t);
      const score = o.points != null ? `${o.points} points` : text(o.viewCountText) || o.one_liner || "";
      out.push({ title: t.trim(), detail: String(score) });
    }
    Object.values(o).forEach(walk);
  };
  walk(data);
  return out;
}

export function total(data: any): number | undefined {
  return data?.nbHits ?? data?.results?.[0]?.nbHits ?? data?.estimatedResults ?? undefined;
}

export async function call(name: string, q: string): Promise<CallResult> {
  const api = loadApi(name);
  const { data, ms } = await rawCall(api, q);
  logCall(name, ms);
  return { name, query: q, ms, results: items(data), total: total(data), data };
}

export async function swarm(name: string, qs: string[]) {
  const api = loadApi(name);
  const t = performance.now();
  const runs = await Promise.all(qs.map(async (q) => {
    try {
      const { data, ms } = await rawCall(api, q);
      logCall(name, ms);
      return { query: q, ms, ok: true, top: items(data, 1)[0]?.title ?? "", count: items(data, 50).length };
    } catch (e) {
      return { query: q, ms: 0, ok: false, top: (e as Error).message, count: 0 };
    }
  }));
  return { name, wall_ms: performance.now() - t, browser_seconds: api.browser_seconds, runs };
}
