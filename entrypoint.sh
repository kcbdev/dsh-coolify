#!/bin/sh
# entrypoint.sh - container entrypoint for DSH on Coolify.
#
# Two deployment constraints drive this script:
#
# 1) Bind host: DSH's webserver schema only accepts 127.0.0.1 or 0.0.0.0, and the
#    launcher rejects 0.0.0.0. So `socat` forwards 0.0.0.0:${PORT} ->
#    127.0.0.1:3080 at L4, preserving Host / X-Forwarded-* headers for DSH's
#    browser-trust fence.
#
# 2) Patch reload: the shipped `web` profile defaults to `patchReload: "live"`,
#    which makes dsh boot the Cordis HMR watcher for the user patch layer. In a
#    container that watcher is unavailable and boot dies with
#    "dsh: user patch-layer watching requires the Cordis HMR service".
#    Seeding the profile manifest with `patchReload: "startup"` applies the same
#    patch layer once at boot and needs no watcher.
set -u

PORT="${PORT:-3000}"
DSH_HOME="${DSH_HOME:-/data}"
PROFILE_DIR="${DSH_HOME}/profiles/web"

mkdir -p "${PROFILE_DIR}"
cat > "${PROFILE_DIR}/package.json" <<'JSON'
{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {},
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app"
      ],
      "patchReload": "startup"
    }
  }
}
JSON

echo "[entrypoint] socat TCP-LISTEN:${PORT} -> 127.0.0.1:3080"
socat "TCP-LISTEN:${PORT},fork,reuseaddr" TCP:127.0.0.1:3080 &

# dsh-base derives the agent sandbox root from process.cwd()
# (`workspaceRoot: !!js process.cwd()`), so start from the persisted workspace
# volume instead of /app. Otherwise `workspace-write` would treat the read-only
# application code as the writable workspace and ignore /workspace entirely.
WORKSPACE="${DSH_WORKSPACE:-/workspace}"
mkdir -p "${WORKSPACE}" 2>/dev/null || true
cd "${WORKSPACE}" 2>/dev/null || cd /app
echo "[entrypoint] cwd=$(pwd) DSH_HOME=${DSH_HOME} DSH_PERMISSION_MODE=${DSH_PERMISSION_MODE:-workspace-write}"

node /app/start.mjs
CODE=$?

echo "[entrypoint] dsh exited with code ${CODE}"
exit "${CODE}"
