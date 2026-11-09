# DSH Coolify Deployment
## Repository: kcbdev/dsh-coolify

### Architecture Overview
This repository provides a Dockerfile-based deployment of DeepSeek Harness (DSH) on Coolify.
The application runs as a non-root Node.js container using the official `@deepseek-ai/dsh` npm package.

### Repository Structure
```
dsh-coolify/
├── Dockerfile      - Multi-stage Docker build
├── start.mjs       - DSH Web starter script
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
  -p 3080:3080 \
  -v dsh-data:/data \
  -v dsh-workspace:/workspace \
  --restart always \
  dsh-coolify
```

### Coolify Deployment Configuration
- **Git repository**: kcbdev/dsh-coolify
- **Branch**: main
- **Build pack**: Dockerfile
- **Dockerfile location**: ./Dockerfile
- **Domain**: https://dsh.kcb.ma
- **Internal port**: 3080
- **Restart policy**: Always
- **Persistent storage**: /data and /workspace

### Environment Variables
| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | production | Application mode |
| `DSH_HOME` | /data | Harness home directory |
| `DSH_TELEMETRY_DISABLED` | 1 | Disable telemetry (any non-empty value) |
| `DSH_PERMISSION_MODE` | workspace-write | Permission/sandbox mode |

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
1. After first startup, inspect DSH startup logs
2. Identify the launch URL containing the authentication token
3. Keep the token private - do not expose in public logs or documentation
4. Access the application at `https://dsh.kcb.ma/` through Cloudflare Access
5. Complete the launch-token authentication flow

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
- Check container logs: `docker logs dsh-container`
- Verify DSH binds to reachable container IP (not 0.0.0.0)
- Ensure Cloudflare Access is properly configured
- Check persistent volume permissions
- Review DSH startup errors in container logs