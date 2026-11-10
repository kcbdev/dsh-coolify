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

WORKDIR /app

# Non-root application user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy runtime artifacts from the builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/start.mjs ./

# DSH configuration
# PORT must match Coolify's ports_exposes (3000).
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

# start.mjs discovers the container IP (DSH rejects 0.0.0.0) and launches
# `dsh web` bound to it, trusting the public host, without opening a browser.
CMD ["node", "start.mjs"]
