#!/usr/bin/env node
/**
 * start.mjs - DSH Web launcher for Coolify.
 *
 * DSH refuses to bind 0.0.0.0 for safety, so we bind to the container's
 * reachable IPv4 address (which Traefik can reach on the Docker network).
 * The public host is added to the /api browser-trust fence, and the browser
 * auto-open is disabled for a headless deployment.
 *
 * Supported `dsh web` flags (verified against @deepseek-ai/dsh 0.1.2-rc.1):
 *   --host <host>  --port <port>  --trusted-host <authority>  --no-open
 * (There is no `--public-url` flag.)
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { networkInterfaces } from "node:os";
import process from "node:process";

const PORT = Number(process.env.PORT || 3000);
const TRUSTED_HOST = process.env.DSH_PUBLIC_HOST || "dsh.kcb.ma";

/** Pick the container's reachable IPv4 (skip loopback / docker0). */
function pickContainerIp() {
  const nets = networkInterfaces();
  const skip = new Set(["lo", "docker0"]);

  // Preferred pass: non-internal IPv4 on a usable interface.
  for (const [name, addrs] of Object.entries(nets)) {
    if (!addrs || skip.has(name.toLowerCase())) continue;
    for (const a of addrs) {
      if (a && a.family === "IPv4" && !a.internal && a.address !== "127.0.0.1") {
        return a.address;
      }
    }
  }

  // Fallback pass: any non-internal IPv4.
  for (const addrs of Object.values(nets)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a && a.family === "IPv4" && !a.internal && a.address !== "127.0.0.1") {
        return a.address;
      }
    }
  }

  return "127.0.0.1";
}

const HOST = process.env.DSH_BIND_HOST || pickContainerIp();

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
  "--host", HOST,
  "--port", String(PORT),
  "--trusted-host", TRUSTED_HOST,
  "--no-open",
];

console.log(`[dsh] launching: bin=${dshBin} host=${HOST} port=${PORT} trusted=${TRUSTED_HOST}`);

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
