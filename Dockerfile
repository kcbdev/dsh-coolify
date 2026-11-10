# syntax=docker/dockerfile:1

# ---------- Builder ----------
FROM node:24-alpine AS builder

WORKDIR /app

# package.json pins @deepseek-ai/dsh, so a single install is enough.
# No package-lock.json is committed, so use `npm install` (not `npm ci`).
COPY package.json ./
RUN npm install --no-audit --no-fund

# Application source
COPY start.mjs ./

# ---------- Production ----------
FROM node:24-alpine

# socat is a tiny L4 forwarder: DSH only permits binding 127.0.0.1 / 0.0.0.0
# (and the launcher rejects 0.0.0.0), so we bind DSH to loopback and expose
# it to Traefik through socat on 0.0.0.0:3000.
RUN apk add --no-cache socat

WORKDIR /app

# Non-root application user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy runtime artifacts from the builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/start.mjs ./

# DSH configuration
# PORT is the *exposed* port that Coolify/Traefik targets (ports_exposes=3000).
# DSH itself listens on loopback:3080 behind the forwarder.
ENV DSH_HOME=/data \
    DSH_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    PORT=3000 \
    DSH_PUBLIC_HOST=dsh.kcb.ma

# Persistent directories owned by the non-root user
RUN mkdir -p /data /workspace && \
    chown -R appuser:appgroup /data /workspace /app && \
    rm -rf /root/.npm /tmp/*

USER appuser

EXPOSE 3000

# socat forwards 0.0.0.0:${PORT} -> 127.0.0.1:3080 (DSH), preserving all
# headers (Host / X-Forwarded-*) for DSH's browser-trust fence.
# start.mjs launches `dsh web` on loopback with the public host trusted.
CMD socat TCP-LISTEN:${PORT},fork,reuseaddr TCP:127.0.0.1:3080 & exec node start.mjs
