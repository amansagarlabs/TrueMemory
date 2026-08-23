import { spawn, spawnSync } from "node:child_process";

const root = process.cwd();
const api = process.env.TM_BASE_URL ?? "http://127.0.0.1:8000";
const authEnv = { ...process.env, KONTEXT_ENABLE_TEST_AUTH: "1" };
let backend;
let credential;

async function healthy() {
  try {
    const response = await fetch(`${api}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

try {
  if (!await healthy()) {
    backend = spawn("python", ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", new URL(api).port || "8000"], { cwd: `${root}/backend`, env: { ...authEnv, CORS_ORIGINS: "http://localhost:3000" }, stdio: ["ignore", "ignore", "pipe"] });
    let backendError = "";
    backend.stderr.on("data", chunk => { backendError += chunk.toString(); });
    const deadline = Date.now() + 120_000;
    while (!(await healthy())) {
      if (backend.exitCode !== null) throw new Error(`TrueMemory backend exited before health check: ${backendError.trim() || `exit ${backend.exitCode}`}`);
      if (Date.now() > deadline) throw new Error(`TrueMemory backend did not become healthy${backendError.trim() ? `: ${backendError.trim()}` : ""}`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  const localDatabaseEnv = { ...authEnv, USE_DOCKER_POSTGRES: "false", DATABASE_URL: process.env.DATABASE_URL_LOCAL ?? "" };
  const provisioned = spawnSync("python", ["backend/scripts/bootstrap_browser_test_identity.py"], { cwd: root, env: localDatabaseEnv, encoding: "utf8" });
  if (provisioned.status !== 0) throw new Error(provisioned.stderr.trim() || "browser credential provisioning failed");
  credential = JSON.parse(provisioned.stdout);
  const result = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config", "playwright.browser-compat.config.ts"], {
    cwd: root,
    env: { ...process.env, ...authEnv, TM_TOKEN: credential.token, TM_WS: "00000000-0000-4000-8000-000000000002", TM_AGENT: "00000000-0000-4000-8000-000000000003" },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (credential) {
    const revoked = spawnSync("python", ["backend/scripts/bootstrap_browser_test_identity.py", "--revoke", credential.user_id, credential.token_id], { cwd: root, env: { ...authEnv, USE_DOCKER_POSTGRES: "false", DATABASE_URL: process.env.DATABASE_URL_LOCAL ?? "" }, encoding: "utf8", stdio: "ignore" });
    if (revoked.status !== 0) process.exitCode = 1;
  }
  if (backend) backend.kill("SIGTERM");
}
