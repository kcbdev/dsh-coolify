#!/bin/sh
# entrypoint.sh - container entrypoint for DSH on Coolify.
#
# DSH must bind loopback (the webserver schema only accepts 127.0.0.1/0.0.0.0 and
# the launcher rejects 0.0.0.0), so `socat` forwards 0.0.0.0:${PORT} -> 127.0.0.1:3080
# at L4, preserving Host / X-Forwarded-* headers for DSH's browser-trust fence.
set -u

PORT="${PORT:-3000}"

echo "[entrypoint] socat TCP-LISTEN:${PORT} -> 127.0.0.1:3080"
socat "TCP-LISTEN:${PORT},fork,reuseaddr" TCP:127.0.0.1:3080 &

node start.mjs
CODE=$?

echo "[entrypoint] dsh exited with code ${CODE}"
# Keep the container alive after an unexpected exit so the platform can collect
# the stdout/stderr above instead of showing an empty crash-loop.
sleep 3600
exit "${CODE}"
