// Executes the browser module with a controlled fetch transport; no privileged key is embedded.
const nativeFetch = globalThis.fetch;
globalThis.fetch = (url, init) => nativeFetch(url, init);
const { runTrueMemoryProbe } = await import("../browser-compat/app.js");
const result = await runTrueMemoryProbe({ baseUrl: process.env.TM_BASE_URL, token: process.env.TM_TOKEN, workspaceId: process.env.TM_WS, agentId: process.env.TM_AGENT });
console.log(JSON.stringify({ status: "ok", browser_module: true, retrieved: result.retrieved.count, searched: result.searched.count }));
