import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tests = [
  "tests/web-intel-cache.test.ts",
  "tests/web-intel-agent.test.ts",
  "tests/web-intel-routes.test.ts",
  "tests/web-intel-security.test.ts",
  "tests/usage-counter-refresh.test.ts",
  "tests/middleware-auth.test.ts",
  "tests/auth-session.test.ts",
];

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...tests],
  {
    cwd: root,
    env: {
      ...process.env,
      TSX_TSCONFIG_PATH: resolve(root, "frontend/tsconfig.json"),
    },
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
