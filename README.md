# DSH Coolify Deployment
## Repository: kcbdev/dsh-coolify

### Architecture Overview
This repository provides a Dockerfile-based deployment of DeepSeek Harness (DSH) on Coolify.
The application runs as a non-root Node.js container using the official `@deepseek-ai/dsh` npm package.

### Repository Structure
```
dsh-coolify/
├── Dockerfile      - Multi-stage Docker build
├── entrypoint.sh   - Container entrypoint (profile seed + socat forwarder)
├── start.mjs       - DSH Web launcher (loopback bind, trusted host)
├── .dockerignore   - Docker build context filters
├── README.md       - This documentation
└── .env.example    - Environment variables example
```

### Docker Build Instructions
```bash
# From the dsh-coolify directory
docker build -t dsh-coolify .
docker run -d \
  --name dsh-container \
  -p 3000:3000 \
  -v dsh-data:/data \
  -v dsh-workspace:/workspace \
  --restart always \
  dsh-coolify
```

> **Port note:** the container listens on **3000** (`PORT`), which is what Coolify's
> `ports_exposes` targets. DSH itself binds `127.0.0.1:3080` and `socat` forwards
> `0.0.0.0:3000 -> 127.0.0.1:3080` inside the container. DSH cannot bind `0.0.0.0`
> (the launcher rejects it, and the host schema allows only `127.0.0.1`/`0.0.0.0`),
> so the forwarder is what makes the service reachable from Traefik.

### Runtime Constraints (learned the hard way)
1. `--host` may only be `127.0.0.1` or `0.0.0.0`; the launcher rejects `0.0.0.0`.
   Never pass a container IP — it fails schema validation and crash-loops.
2. The shipped `web` profile defaults to `patchReload: "live"`, which boots the
   Cordis HMR watcher and aborts boot in a container
   (`dsh: user patch-layer watching requires the Cordis HMR service`).
   `entrypoint.sh` seeds `<DSH_HOME>/profiles/web/package.json` with
   `patchReload: "startup"`.
3. There is no `--public-url` flag. Use `--trusted-host <domain>` for the fence.

### Coolify Deployment Configuration
- **Git repository**: kcbdev/dsh-coolify
- **Branch**: master
- **Build pack**: Dockerfile
- **Dockerfile location**: /Dockerfile
- **Domain**: https://dsh.kcb.ma
- **Internal port (ports_exposes)**: 3000
- **Restart policy**: Always
- **Persistent storage**: none configured currently; `/data` and `/workspace`
  live inside the container, so a redeploy resets DSH state

### Environment Variables

**No Coolify environment variables are required.** The image bakes in everything
it needs (`ENV` in the Dockerfile), so the app is self-contained and no secrets
live in Coolify. These are the effective defaults:

| Variable | Default (from image) | Description |
|---|---|---|
| `NODE_ENV` | production | Application mode |
| `DSH_HOME` | /data | Harness home (profile, settings, sessions, credentials) |
| `DSH_TELEMETRY_DISABLED` | 1 | Disable telemetry (any non-empty value) |
| `DSH_PERMISSION_MODE` | workspace-write | Sandbox policy: `read-only`, `workspace-write`, `danger-full-access` |
| `PORT` | 3000 | Forwarded port; **must equal Coolify `ports_exposes`** |
| `DSH_PUBLIC_HOST` | dsh.kcb.ma | Value passed to `--trusted-host`; only change if the domain changes |
| `DSH_WORKSPACE` | /workspace | Agent working directory (sandbox root = `process.cwd()`) |

Only set these in Coolify to **override** a default — e.g. `DSH_PERMISSION_MODE=read-only`
to harden the sandbox. Provider/model credentials are **not** environment
variables: they are configured in the DSH Web UI and stored under `/data`.

### DNS and Cloudflare Access Configuration
1. **DNS**: Ensure `kcb.ma` is managed by Cloudflare
2. **DNS record**: Create `dsh.kcb.ma` A record pointing to the VPS IP
3. **Cloudflare proxy**: Enable proxy for `dsh.kcb.ma`
4. **Cloudflare Zero Trust**: Configure `dsh.kcb.ma` as self-hosted application
5. **Access restriction**: Allow explicitly authorized email identities only
6. **SSL/TLS**: Full (strict) mode
7. **DSH authentication**: Retain native launch-token and browser-session authentication

### Persistent Storage
- **/data**: DSH profiles, settings, credentials, and sessions
- **/workspace**: Agent working files and projects
- Both directories are writable by the `appuser` non-root user
- Host bind mounts require proper ownership configuration on the VPS

### Initial DSH Authentication
1. After first startup, inspect DSH startup logs (Coolify UI → app → Logs)
2. Copy the `dsh web:` launch URL carrying the per-process token
3. Replace the loopback host: `https://dsh.kcb.ma/?token=<token>`
4. Keep the token private - do not paste it into tickets, docs, or chat
5. Opening that URL sets a signed session cookie and redirects to the clean root
6. The token is regenerated on every container restart/redeploy

### OpenRouter Configuration
- Provider: OpenRouter
- API endpoint: https://openrouter.ai/api/v1
- API key: supplied manually by the owner through the DSH Web UI
- Model: selected manually from available compatible models
- The application starts without an API key; configuration is done post-deployment

### Backup and Restore
- Regular backups of `/data` directory
- `/workspace` directory should also be backed up periodically
- To restore: copy backup data to the respective Docker volumes or host paths

### Update and Rollback
- Pull latest changes from the repository
- Rebuild and redeploy: `docker pull/new image` or use Coolify's redeploy feature
- Rollback: use Coolify's previous version rollback capability
- Data persistence is maintained across redeployments via mounted volumes

### Security Considerations
- Non-root container execution (appuser)
- Cloudflare Access as first authentication layer
- DSH native authentication (launch-token + browser session)
- No public port 3080 exposure beyond reverse proxy
- No Docker socket mount (`/var/run/docker.sock`)
- No host root filesystem mount
- Persistent storage permissions restricted to appuser
- API credentials stored outside Git (in /data or Coolify secrets)
- No hardcoded secrets
- API keys and secrets never committed to repository

### Troubleshooting
- Check container logs in the Coolify UI (Logs tab) or `docker logs <container>`
- Expected healthy startup, in order:
  1. `[entrypoint] socat TCP-LISTEN:3000 -> 127.0.0.1:3080`
  2. `[dsh] launching: bin=... host=127.0.0.1 port=3080 trusted=dsh.kcb.ma`
  3. `dsh web: http://127.0.0.1:3080/?token=...`
- `401 dsh web authentication required; reopen the URL printed by dsh web.`
  is **normal**: the browser must first open the tokenized URL from the logs
  (swap the loopback host for `https://dsh.kcb.ma`) to receive its session cookie.
  The token is per-process, so it changes on every restart/redeploy.
- Crash-looping with no logs: a "crash loop" hides runtime output; temporarily
  wrap the command so the process output is flushed before the container exits.
- Verify the reverse proxy path: `curl -I https://dsh.kcb.ma/` should be `401`,
  not `502`/`404` (502 = container not listening, 404 = wrong port).
- Ensure Cloudflare Access does not block the tokenized URL before DSH sees it
- Check persistent volume permissions (uid/gid of `appuser`)