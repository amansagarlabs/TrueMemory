import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = process.env.KONTEXT_API_URL || "http://localhost:3000";
const server = new McpServer({ name: "kontext", version: "1.0.0" });

server.tool(
  "kontext_search",
  "Search the web and get full page content from results",
  { query: z.string(), limit: z.number().optional() },
  async ({ query, limit }) => {
    const res = await fetch(`${API_URL}/api/web/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit }),
    });
    const data = await res.json();
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
);

server.tool(
  "kontext_scrape",
  "Scrape a URL and return clean markdown content",
  { url: z.string() },
  async ({ url }) => {
    const res = await fetch(`${API_URL}/api/web/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"] }),
    });
    const data = await res.json();
    return { content: [{ type: "text", text: data?.data?.markdown ?? "" }] };
  },
);

server.tool(
  "kontext_map",
  "Discover all URLs on a website",
  { url: z.string() },
  async ({ url }) => {
    const res = await fetch(`${API_URL}/api/web/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    return { content: [{ type: "text", text: JSON.stringify(data?.data?.links ?? []) }] };
  },
);

server.tool(
  "kontext_agent",
  "Autonomous multi-source web research. Describe what you need, agent finds it.",
  { prompt: z.string(), maxSteps: z.number().optional() },
  async ({ prompt, maxSteps }) => {
    const start = await fetch(`${API_URL}/api/web/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, maxSteps }),
    });
    const started = await start.json();
    const jobId = started.jobId as string;

    for (let i = 0; i < 40; i++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const statusRes = await fetch(`${API_URL}/api/web/agent?jobId=${encodeURIComponent(jobId)}`);
      const status = await statusRes.json();
      if (status.status === "complete") {
        return { content: [{ type: "text", text: JSON.stringify(status.output) }] };
      }
      if (status.status === "failed") {
        return { content: [{ type: "text", text: `Agent job failed: ${status.error}` }] };
      }
    }

    return { content: [{ type: "text", text: `Job ${jobId} still running, check back later.` }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
