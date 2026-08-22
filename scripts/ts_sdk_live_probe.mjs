import { TrueMemory } from "../packages/memory-sdk/dist/index.js";

const { TM_BASE_URL = "http://localhost:8000", TM_TOKEN, TM_WS, TM_AGENT } = process.env;
if (!TM_TOKEN || !TM_WS || !TM_AGENT) throw new Error("TM_TOKEN, TM_WS, and TM_AGENT are required");
const memory = new TrueMemory({ baseUrl: TM_BASE_URL, token: TM_TOKEN });
const scope = { workspace_id: TM_WS, agent_id: TM_AGENT };
const key = `ts-parity-${crypto.randomUUID()}`;
const health = await memory.health();
const stored = await memory.remember({ key, content: "TypeScript parity value", ...scope });
const retrieved = await memory.retrieve({ query: key, ...scope });
const searched = await memory.search({ query: key, ...scope });
const profile = await memory.profile(scope);
const usage = await memory.usage();
const id = `profile:workspace:${TM_WS}:${key}`;
const forgotten = await memory.forget({ id, ...scope });
console.log(JSON.stringify({ status: "ok", health: health.status, stored: stored.saved, retrieved: retrieved.count, searched: searched.count, profile: profile.items.length, usage: typeof usage === "object", forgotten: forgotten.forgotten }));
