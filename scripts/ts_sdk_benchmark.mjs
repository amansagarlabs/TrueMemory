import { TrueMemory } from "../packages/memory-sdk/dist/index.js";
const client = new TrueMemory({ baseUrl: process.env.TM_BASE_URL || "http://localhost:8000", token: process.env.TM_TOKEN });
const values = [], key = `ts-bench-${crypto.randomUUID()}`, scope = { workspace_id: process.env.TM_WS, agent_id: process.env.TM_AGENT };
await client.remember({ key, content: "benchmark", ...scope });
for (let i = 0; i < 10; i++) { const start = performance.now(); await client.retrieve({ query: key, ...scope }); values.push(performance.now() - start); }
await client.forget({ id: `profile:workspace:${process.env.TM_WS}:${key}`, ...scope });
values.sort((a,b)=>a-b); const at = p => values[Math.min(values.length - 1, Math.round((values.length - 1) * p / 100))];
console.log(JSON.stringify({ typescript_sdk_ms: { p50: +at(50).toFixed(2), p95: +at(95).toFixed(2), p99: +at(99).toFixed(2) } }));
