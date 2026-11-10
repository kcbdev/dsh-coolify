#!/usr/bin/env node
/**
 * start.mjs - DSH Web launcher for Coolify.
 *
 * `--host` accepts one concrete local IPv4/IPv6 literal only; wildcard (0.0.0.0)
 * hosts are rejected by design ("would expose remote code execution to the
 * network"). DSH therefore binds loopback (127.0.0.1:3080) and `socat` exposes
 * 0.0.0.0:3000 -> 127.0.0.1:3080 at L4, preserving Host / X-Forwarded-* for
 * DSH's browser-trust fence.
 *
 * Flags used: --host, --port, --public-url, --trusted-host, --no-open.
 * (--public-url exists since 0.2.x; it advertises the printed/opened URL and
 * grants no trust, which is why --trusted-host is still required.)
 *
 * The settings UI (Models/General/Plugins) requires a non-loopback page to be
 * accepted by the host; 0.1.2-rc.1 did not allow that, removed in 0.2.x.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";

const DSH_HOST = "127.0.0.1";
const DSH_PORT = 3080;
const DSH_PUBLIC_URL = (process.env.DSH_PUBLIC_URL || "https://dsh.kcb.ma/").trim();
const TRUSTED_HOST = process.env.DSH_PUBLIC_HOST || "dsh.kcb.ma";

// Resolve the dsh CLI entry so we never depend on PATH or the current working
// directory (the container starts in /workspace, the app lives in /app).
const require = createRequire(import.meta.url);
let dshBin;
try {
  dshBin = require.resolve("@deepseek-ai/dsh/lib/bin.js");
} catch {
  dshBin = "/app/node_modules/@deepseek-ai/dsh/lib/bin.js";
}

const args = [
  dshBin,
  "web",
  "--host", DSH_HOST,
  "--port", String(DSH_PORT),
  "--public-url", DSH_PUBLIC_URL,
  "--trusted-host", TRUSTED_HOST,
  "--no-open",
];

console.log(`[dsh] launching: bin=${dshBin} host=${DSH_HOST} port=${DSH_PORT} public=${DSH_PUBLIC_URL} trusted=${TRUSTED_HOST}`);

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
