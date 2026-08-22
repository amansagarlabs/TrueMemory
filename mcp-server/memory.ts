import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = (process.env.KONTEXT_MEMORY_URL || "http://localhost:8010").replace(/\/$/, "");
const API_KEY = process.env.KONTEXT_API_KEY || "";
const ACCESS_TOKEN = process.env.KONTEXT_MEMORY_TOKEN || "";
const server = new McpServer({ name: "truememory-memory", version: "1.0.0" });

function headers(): Record<string, string> {
  const result: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) result["X-Aman-API-Key"] = API_KEY;
  if (ACCESS_TOKEN) result.Authorization = `Bearer ${ACCESS_TOKEN}`;
  return result;
}

async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`KONTEXT Memory ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

server.tool(
  "memory_search",
  "Search authorized KONTEXT memories.",
  { query: z.string().optional(), scope: z.string().optional(), limit: z.number().optional() },
  async ({ query = "", scope = "general", limit = 10 }) => ({
    content: [{ type: "text", text: JSON.stringify(await call("/v1/memories/search", { method: "POST", body: JSON.stringify({ query, scope, limit }) })) }],
  }),
);

server.tool(
  "memory_retrieve",
  "Retrieve authorized KONTEXT memories for context assembly.",
  { query: z.string().optional(), scope: z.string().optional(), limit: z.number().optional() },
  async ({ query = "", scope = "general", limit = 10 }) => ({
    content: [{ type: "text", text: JSON.stringify(await call("/v1/memories/retrieve", { method: "POST", body: JSON.stringify({ query, scope, limit }) })) }],
  }),
);

server.tool(
  "memory_store",
  "Store a user or agent memory in KONTEXT.",
  { key: z.string(), content: z.string(), scope: z.string().optional(), source: z.string().optional() },
  async ({ key, content, scope = "general", source = "mcp" }) => ({
    content: [{ type: "text", text: JSON.stringify(await call("/v1/memories", { method: "POST", body: JSON.stringify({ key, content, scope, source }) })) }],
  }),
);

server.tool(
  "memory_update",
  "Update an existing KONTEXT memory.",
  { id: z.string(), content: z.string(), source: z.string().optional() },
  async ({ id, content, source = "mcp" }) => ({
    content: [{ type: "text", text: JSON.stringify(await call("/v1/memories/update", { method: "POST", body: JSON.stringify({ id, content, source }) })) }],
  }),
);

server.tool(
  "memory_forget",
  "Forget an existing KONTEXT memory.",
  { id: z.string() },
  async ({ id }) => ({
    content: [{ type: "text", text: JSON.stringify(await call("/v1/memories/forget", { method: "POST", body: JSON.stringify({ id }) })) }],
  }),
);

server.tool(
  "memory_profile",
  "List authorized profile memories.",
  { scope: z.string().optional(), limit: z.number().optional() },
  async ({ scope = "general", limit = 50 }) => ({
    content: [{ type: "text", text: JSON.stringify(await call(`/v1/memories?scope=${encodeURIComponent(scope)}&limit=${limit}`)) }],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
