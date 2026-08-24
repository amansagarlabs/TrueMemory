import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import net from "node:net";

const root = process.cwd();
const authEnv = { ...process.env, KONTEXT_ENABLE_TEST_AUTH: "1" };
const network = "truememory_default";
const suffix = `${Date.now()}_${process.pid}`;
const database = `truememory_browser_e2e_${suffix}`.toLowerCase();
const dotenv = readFileSync(`${root}/.env`, "utf8");
const envValue = name => dotenv.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim().replace(/^"(.*)"$/, "$1") ?? "";
const postgresPassword = envValue("POSTGRES_PASSWORD") || "postgres";
const openrouterApiKey = envValue("OPENROUTER_API_KEY");
const postgresUrl = `postgresql://postgres:${encodeURIComponent(postgresPassword)}@postgres:5432/${database}`;
const backendName = `truememory-browser-backend-${suffix}`;
let credential;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout || "").trim()}`);
  return result.stdout.trim();
}
function docker(args) { return run("docker", args); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}
async function waitFor(url, predicate, label, timeoutMs = 120_000, init) {
  const deadline = Date.now() + timeoutMs;
  let delay = 250;
  let lastError = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, init);
      const body = await response.text();
      if (predicate(response.status, body)) return body;
      lastError = `HTTP ${response.status}: ${body.slice(0, 300)}`;
    } catch (error) { lastError = error.message; }
    await sleep(delay);
    delay = Math.min(delay * 1.7, 2_000);
  }
  throw new Error(`${label} did not become ready: ${lastError}`);
}

try {
  const frontendPort = await freePort();
  const frontendBase = `http://127.0.0.1:${frontendPort}`;
  docker(["compose", "exec", "-T", "postgres", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${database}`]);
  docker(["run", "--rm", "--network", network, "-e", `DATABASE_URL=${postgresUrl}`, "truememory-backend:local", "python", "-c", "import os,psycopg; from pathlib import Path; c=psycopg.connect(os.environ['DATABASE_URL']); cur=c.cursor(); [cur.execute(Path(p).read_text(encoding='utf-8')) for p in sorted(Path('/app/db/init').glob('*.sql')) if not p.name.startswith(('015_', '016_'))]; c.commit(); c.close()"]);
  docker(["run", "-d", "--name", backendName, "--network", network, "-p", "127.0.0.1::8000", "-e", `DATABASE_URL=${postgresUrl}`, "-e", `DATABASE_URL_LOCAL=${postgresUrl}`, "-e", `DATABASE_URL_DOCKER=${postgresUrl}`, "-e", "USE_DOCKER_POSTGRES=false", "-e", "POSTGRES_LOCAL_HOST=postgres", "-e", "POSTGRES_DOCKER_HOST=postgres", "-e", "POSTGRES_PORT=5432", "-e", `POSTGRES_DB=${database}`, "-e", "POSTGRES_USER=postgres", "-e", `POSTGRES_PASSWORD=${postgresPassword}`, "-e", `OPENROUTER_API_KEY=${openrouterApiKey}`, "-e", `CORS_ORIGINS=${frontendBase}`, "-e", "KONTEXT_ENABLE_TEST_AUTH=1", "-e", "AMAN_JWT_SECRET=browser-e2e-test-secret", "truememory-backend:local", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]);
  const backendPort = docker(["port", backendName, "8000/tcp"]).split(":").pop();
  const apiBase = `http://127.0.0.1:${backendPort}`;
  const health = JSON.parse(await waitFor(`${apiBase}/health`, (status, body) => status === 200 && body.includes(database), "test backend health"));
  if (health.postgres_database !== database) throw new Error(`test backend used database ${health.postgres_database}, expected ${database}`);
  await waitFor(`${apiBase}/readiness`, (status, body) => status === 200 && body.includes('"ready"'), "test backend readiness");
  await waitFor(`${apiBase}/mcp`, status => status === 401, "test MCP endpoint", 120_000, { method: "POST" });
  credential = JSON.parse(docker(["exec", backendName, "sh", "-lc", "KONTEXT_ENABLE_TEST_AUTH=1 python scripts/bootstrap_browser_test_identity.py"]));
  const result = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config", "playwright.browser-compat.config.ts"], { cwd: root, env: { ...authEnv, TM_BASE_URL: apiBase, TEST_BASE_URL: frontendBase, TM_TOKEN: credential.token, TM_WS: "00000000-0000-4000-8000-000000000002", TM_AGENT: "00000000-0000-4000-8000-000000000003" }, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (credential) { try { docker(["exec", backendName, "python", "scripts/bootstrap_browser_test_identity.py", "--revoke", credential.user_id, credential.token_id]); } catch {} }
  try {
    const logs = docker(["logs", backendName]);
    if (logs) console.error(`\n[ browser-compat backend logs ]\n${logs}`);
  } catch {}
  try { docker(["rm", "-f", backendName]); } catch {}
  try { docker(["compose", "exec", "-T", "postgres", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${database}`]); } catch {}
}
