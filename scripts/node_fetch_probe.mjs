// Framework-free Node fetch client: no TrueMemory package imports.
const base = process.env.TM_BASE_URL || "http://localhost:8000";
const token = process.env.TM_TOKEN, workspace = process.env.TM_WS, agent = process.env.TM_AGENT;
if (!token || !workspace || !agent) throw new Error("TM_TOKEN, TM_WS, and TM_AGENT are required");
const scope = { workspace_id: workspace, agent_id: agent }, key = `node-fetch-${crypto.randomUUID()}`;
async function call(path, body) {
  const response = await fetch(base + path, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}
await call("/v1/memories", { key, content: "Node fetch value", ...scope });
const retrieved = await call("/v1/memories/retrieve", { query: key, ...scope });
await call("/v1/memories/forget", { id: `profile:workspace:${workspace}:${key}`, ...scope });
console.log(JSON.stringify({ status: "ok", transport: "node-fetch", retrieved: retrieved.count }));
