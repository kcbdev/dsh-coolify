FROM node:24-alpine AS builder

WORKDIR /app

# Install dependencies first for layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY start.mjs ./

# Build stage: install DSH and prepare production
RUN npm i @deepseek-ai/dsh@0.1.2-rc.1

# Production stage
FROM node:24-alpine

WORKDIR /app

# Create non-root application user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy built artifacts from builder
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/start.mjs ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/.dockerignore ./.dockerignore 2>/dev/null || true

# Set persistent directories
ENV DSH_HOME=/data
ENV DSH_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Create persistent directories and set ownership
RUN mkdir -p /data /workspace && \
    chown -R appuser:appgroup /data /workspace && \
    # Clean npm cache and unnecessary files
    rm -rf /root/.npm /tmp/*

USER appuser

# Expose internal port
EXPOSE 3080

# Default command starts DSH Web
CMD ["node", "start.mjs"]