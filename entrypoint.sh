#!/bin/sh
# entrypoint.sh - container entrypoint for DSH on Coolify.
#
# DSH refuses to bind wildcard addresses (--host 0.0.0.0 is rejected by design:
# "binding every interface would expose remote code execution to the network"),
# so `socat` forwards 0.0.0.0:${PORT} -> 127.0.0.1:3080 at L4. L4 forwarding
# preserves the Host / X-Forwarded-* headers for DSH's browser-trust fence.
#
# Note: the container starts DSH from the persisted $DSH_WORKSPACE directory
# because dsh-base derives the agent sandbox root from process.cwd().
set -u

PORT="${PORT:-3000}"
DSH_HOME="${DSH_HOME:-/data}"
mkdir -p "${DSH_HOME}" "${WORKSPACE:-/workspace}" 2>/dev/null || true

echo "[entrypoint] socat TCP-LISTEN:${PORT} -> 127.0.0.1:3080"
socat "TCP-LISTEN:${PORT},fork,reuseaddr" TCP:127.0.0.1:3080 &

WORKSPACE="${DSH_WORKSPACE:-/workspace}"
cd "${WORKSPACE}" 2>/dev/null || cd /app
echo "[entrypoint] cwd=$(pwd) DSH_HOME=${DSH_HOME} DSH_PERMISSION_MODE=${DSH_PERMISSION_MODE:-workspace-write}"

node /app/start.mjs
CODE=$?

echo "[entrypoint] dsh exited with code ${CODE}"
exit "${CODE}"
