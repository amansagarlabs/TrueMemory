import { createHash } from "crypto";

function hash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 24);
}

export const cacheKeys = {
  scrape: (url: string, formats: string[] = ["markdown"]) => `cache:scrape:${hash(url + formats.slice().sort().join(","))}`,
  map: (url: string) => `cache:map:${hash(url)}`,
  search: (query: string, limit: number) => `cache:search:${hash(query.toLowerCase().trim() + limit)}`,
  agentResult: (prompt: string, schema?: object) =>
    `cache:agent:${hash(prompt.toLowerCase().trim() + JSON.stringify(schema || {}))}`,
};
