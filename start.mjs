#!/usr/bin/env node
/**
 * start.mjs - DSH Web starter for Coolify deployment
 * 
 * Discovers the container's actual IPv4 address and starts DSH Web
 * binding to the reachable container IP (not 0.0.0.0).
 * 
 * This script:
 * 1. Uses os.networkInterfaces() to find the container's IP
 * 2. Selects a valid non-internal IPv4 address
 * 3. Starts dsh web with the verified host
 * 4. Handles SIGTERM/SIGINT gracefully
 */

const { spawn } = require('child_process');
const { networkInterfaces } = require('os');

const PORT = 3080;
const PUBLIC_URL = 'https://dsh.kcb.ma/';
const TRUSTED_HOST = 'dsh.kcb.ma';

// Get all network interfaces
const nets = networkInterfaces();
let containerIp = null;

// Find the first suitable IPv4 address for Docker/Coolify environment
// Priority: non-loopback, non-internal IPv4 addresses
// Avoid: 127.0.0.1, docker0, internal IPs not reachable from Traefik
//
// In Docker containers, eth0 typically has the container's reachable IP.
// Traefik on the same Docker network can reach this IP.

const ifaces = nets;

// Try to find a suitable IP in order of preference
let found = false;

// First pass: look for non-docker, non-loopback IPv4 addresses
for (const ifaceName of Object.keys(ifaces)) {
  const iface = ifaces[ifaceName];
  
  if (!iface) continue;

  for (const alias of iface) {
    // Must be IPv4
    if (alias.family !== 'IPv4') continue;
    // Must not be internal/loopback
    if (alias.internal) continue;
    // Must not be 127.0.0.1
    if (alias.address === '127.0.0.1') continue;
    // Skip docker0 (typically not reachable from Traefik on same network)
    if (ifaceName.toLowerCase() === 'docker0') continue;
    
    containerIp = alias.address;
    found = true;
    break;
  }
  
  if (found) break;
}

// Second pass: if no ideal interface found, use any non-loopback IPv4
if (!found) {
  for (const ifaceName of Object.keys(ifaces)) {
    const iface = ifaces[ifaceName];
    
    if (!iface) continue;

    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal && alias.address !== '127.0.0.1') {
        containerIp = alias.address;
        found = true;
        break;
      }
    }
    
    if (found) break;
  }
}

// Third pass: last resort - use 127.0.0.1 (DSH will reject 0.0.0.0 but 127.0.0.1 might work
// for local testing, though not recommended for production behind proxy)
if (!found) {
  console.error('WARNING: Could not determine container IPv4 address');
  console.error('Using 127.0.0.1 as fallback (may not be reachable via Coolify proxy)');
  containerIp = '127.0.0.1';
}

console.log('DSH Web starting with configuration:');
console.log(`  Host: ${containerIp}`);
console.log(`  Port: ${PORT}`);
console.log(`  Public URL: ${PUBLIC_URL}`);
console.log(`  Trusted host: ${TRUSTED_HOST}`);

// Start DSH Web process using spawn with argument array (not shell interpolation)
const dsh = spawn('dsh', [
  'web',
  '--host',
  containerIp,
  '--port',
  PORT.toString(),
  '--public-url',
  PUBLIC_URL,
  '--trusted-host',
  TRUSTED_HOST,
  '--no-open'
], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    DSH_HOME: '/data',
    DSH_TELEMETRY_DISABLED: '1',
    DSH_PERMISSION_MODE: 'workspace-write'
  }
});

// Track process output
let hasLoggedStartupError = false;
let startupCompleted = false;

dsh.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(`[dsh stdout]: ${output}`);
  
  const trimmed = output.trim();
  
  // Log relevant startup information
  if (/starting|listening|initialized|ready/.test(trimmed) || 
      trimmed.includes('DSH Web') || 
      trimmed.includes('Web UI') ||
      trimmed.includes('port 3080')) {
    console.log(`[DSH INFO]: ${trimmed}`);
  }
  
  // Mark startup as complete when we see the listening message
  if (!startupCompleted && /listening on /.test(trimmed)) {
    startupCompleted = true;
  }
});

dsh.stderr.on('data', (data) => {
  const output = data.toString();
  console.error(`[dsh stderr]: ${output}`);
  
  // Detect fatal startup errors (only log once)
  if (!hasLoggedStartupError && /fatal|error:|failed|panic|invalid host/.test(output)) {
    hasLoggedStartupError = true;
    console.error('[DSH ERROR] Fatal startup error detected in stderr');
  }
});

dsh.on('error', (err) => {
  console.error('[DSH] spawn error:', err);
});

dsh.on('exit', (code) => {
  console.log(`[DSH] Process exited with code ${code}`);
  if (!startupCompleted && code !== 0 && code !== null) {
    console.error('[DSH] Process exited with error; check logs above');
  }
  process.exit(code);
});

// Handle graceful shutdown
let shuttingDown = false;

process.on('SIGTERM', () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('[DSH] Received SIGTERM, shutting down...');
  if (dsh && typeof dsh.kill === 'function') {
    dsh.kill('SIGTERM');
  } else if (dsh && dsh.killSignal) {
    dsh.killSignal = 'SIGTERM';
  }
  setTimeout(() => {
    process.exit(0);
  }, 5000);
});

process.on('SIGINT', () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('[DSH] Received SIGINT, shutting down...');
  if (dsh && typeof dsh.kill === 'function') {
    dsh.kill('SIGINT');
  } else if (dsh && dsh.killSignal) {
    dsh.killSignal = 'SIGINT';
  }
  setTimeout(() => {
    process.exit(0);
  }, 5000);
});

// Startup completion message
setTimeout(() => {
  if (!shuttingDown && startupCompleted) {
    console.log(`DSH Web is running at http://${containerIp}:${PORT}`);
    console.log(`Public URL: ${PUBLIC_URL}`);
    console.log('Press Ctrl+C to stop');
  } else if (!shuttingDown) {
    console.log(`DSH process started (initializing)...`);
    console.log('Check logs for the actual URL once DSH is ready');
  }
}, 2500);