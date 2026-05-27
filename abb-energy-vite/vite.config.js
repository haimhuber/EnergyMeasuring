import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import os from 'os'
import { execSync } from 'child_process'

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

function getGitCommit() {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'dev'; }
}

const SERVER_IP   = process.env.API_HOST || getLocalIp();
const SERVER_PORT = process.env.API_PORT || 8000;
const target      = `http://${SERVER_IP}:${SERVER_PORT}`;
const commitHash  = getGitCommit();

console.log(`🔗 Proxy target: ${target}`);
console.log(`📦 Version: ${commitHash}`);

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.VITE_APP_VERSION': JSON.stringify(commitHash),
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target,
        changeOrigin: true,
      }
    }
  }
});