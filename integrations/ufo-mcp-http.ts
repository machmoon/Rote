// Pilot's MCP server over Streamable HTTP, so UFO can connect it. UFO takes only Streamable HTTP servers:
// "The endpoint must be reachable from UFO. Local stdio servers are not supported by a hosted workspace"
// (https://ufo.ai/docs/connectors/mcp/), and its MCP extension dials with fastmcp's StreamableHttpTransport
// (github.com/ufo-ai/ufo-core extensions/mcp/ufo_ext_mcp.py). `pilot mcp` (src/mcp.ts) is stdio, so this wraps the same
// buildServer() in the stateless pattern of the official SDK example
// node_modules/@modelcontextprotocol/sdk/dist/esm/examples/server/simpleStatelessStreamableHttp.js: a fresh server +
// transport per POST, sessionIdGenerator undefined, GET/DELETE answer 405. Deviation: node:http instead of
// createMcpExpressApp, so Pilot takes no direct express dependency.
//
//   node integrations/ufo-mcp-http.ts [port]            # default 8787, endpoint http://127.0.0.1:8787/mcp
//   PILOT_MCP_TOKEN=... node integrations/ufo-mcp-http.ts  # require "Authorization: Bearer ..." (UFO's optional token)
import { createServer, type IncomingMessage } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "../src/mcp.ts";

const PORT = Number(process.argv[2] ?? process.env.PORT) || 8787;
const TOKEN = process.env.PILOT_MCP_TOKEN;

const readJson = (req: IncomingMessage) => new Promise<unknown>((resolve, reject) => {
  let s = "";
  req.on("data", (d) => (s += d));
  req.on("end", () => { try { resolve(s ? JSON.parse(s) : undefined); } catch (e) { reject(e); } });
  req.on("error", reject);
});
const rpcError = (code: number, message: string) => JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null });

createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://x").pathname;
  if (path === "/healthz") return void res.writeHead(200, { "content-type": "text/plain" }).end("ok");
  if (path !== "/mcp") return void res.writeHead(404).end();
  if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) return void res.writeHead(401, { "content-type": "application/json" }).end(rpcError(-32001, "Unauthorized"));
  if (req.method !== "POST") return void res.writeHead(405, { "content-type": "application/json" }).end(rpcError(-32000, "Method not allowed."));
  const server = buildServer();
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, await readJson(req));
  } catch (e) {
    process.stderr.write(`pilot mcp-http: ${(e as Error).message}\n`);
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" }).end(rpcError(-32603, "Internal server error"));
  }
}).listen(PORT, "127.0.0.1", () => process.stderr.write(`pilot MCP (Streamable HTTP) on http://127.0.0.1:${PORT}/mcp${TOKEN ? " (bearer token required)" : ""}\n`));
