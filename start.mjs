#!/usr/bin/env node
/**
 * start.mjs - DSH Web launcher for Coolify.
 *
 * Constraints discovered in @deepseek-ai/dsh 0.1.2-rc.1:
 *   - The webserver's `host` schema accepts ONLY "127.0.0.1" or "0.0.0.0".
 *   - The `dsh web` launcher rejects "--host 0.0.0.0" for safety.
 *   => DSH must bind loopback (127.0.0.1:3080). The Dockerfile runs `socat`
 *      to expose 0.0.0.0:3000 -> 127.0.0.1:3080 so Traefik can reach it.
 *
 * Supported `dsh web` flags: --host, --port, --trusted-host, --no-open.
 * (There is no --public-url flag.)
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";

const DSH_HOST = "127.0.0.1";
const DSH_PORT = 3080;
const TRUSTED_HOST = process.env.DSH_PUBLIC_HOST || "dsh.kcb.ma";

// Resolve the dsh CLI entry so we never depend on PATH (node_modules/.bin is
// not on PATH when Coolify runs `node start.mjs`).
const require = createRequire(import.meta.url);
let dshBin;
try {
  dshBin = require.resolve("@deepseek-ai/dsh/lib/bin.js");
} catch {
  dshBin = "node_modules/@deepseek-ai/dsh/lib/bin.js";
}

const args = [
  dshBin,
  "web",
  "--host", DSH_HOST,
  "--port", String(DSH_PORT),
  "--trusted-host", TRUSTED_HOST,
  "--no-open",
];

console.log(`[dsh] launching: bin=${dshBin} host=${DSH_HOST} port=${DSH_PORT} trusted=${TRUSTED_HOST}`);

const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    DSH_HOME: process.env.DSH_HOME || "/data",
    DSH_TELEMETRY_DISABLED: process.env.DSH_TELEMETRY_DISABLED || "1",
    DSH_PERMISSION_MODE: process.env.DSH_PERMISSION_MODE || "workspace-write",
  },
});

child.on("error", (err) => {
  console.error("[dsh] spawn error:", err);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  console.log(`[dsh] exited code=${code} signal=${signal}`);
  process.exit(code === null ? 1 : code);
});

let shuttingDown = false;
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[dsh] received ${sig}, forwarding...`);
    try {
      child.kill(sig);
    } catch {
      /* already gone */
    }
    setTimeout(() => process.exit(0), 5000);
  });
}
