// Browser-safe probe. The token must be short-lived/scoped and supplied by the host page;
// this file never embeds a privileged permanent key.
export async function runTrueMemoryProbe({ baseUrl, token, workspaceId, agentId }) {
  if (!token || !baseUrl) throw new Error("A short-lived scoped token and API URL are required");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const scope = { workspace_id: workspaceId, agent_id: agentId };
  const call = (path, body) => fetch(`${baseUrl.replace(/\/$/, "")}${path}`, { method: "POST", headers, body: JSON.stringify(body) }).then(async response => {
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || `TrueMemory request failed (${response.status})`);
    return payload;
  });
  const key = `browser-${crypto.randomUUID()}`;
  await call("/v1/memories", { key, content: "browser compatibility value", ...scope });
  const retrieved = await call("/v1/memories/retrieve", { query: key, ...scope });
  const searched = await call("/v1/memories/search", { query: key, ...scope });
  return { key, retrieved, searched };
}

globalThis.document?.querySelector("#run")?.addEventListener("click", async () => {
  const output = document.querySelector("#output");
  const config = globalThis.__TRUEMEMORY_BROWSER_CONFIG__;
  if (!config) {
    output.textContent = "Provide a short-lived token through the host integration to run this probe.";
    return;
  }
  try {
    output.textContent = JSON.stringify(await runTrueMemoryProbe(config));
  } catch (error) {
    output.textContent = JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
});
