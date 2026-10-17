#!/usr/bin/env node
/**
 * Build runner with automated Telegram failure notification
 */
const { spawnSync } = require('child_process');
const path = require('path');
const { sendTelegramAlert } = require('./telegram-notify.cjs');

console.log("=== [1/2] Building Vite Frontend ===");
const viteRes = spawnSync('npx', ['vite', 'build'], { stdio: 'inherit', shell: true });
if (viteRes.status !== 0) {
  const errMsg = "Vite frontend build failed. Check terminal or deployment logs.";
  console.error("❌", errMsg);
  sendTelegramAlert("Build Failure (Frontend)", errMsg, "error").then(() => {
    process.exit(viteRes.status || 1);
  });
  return;
}

console.log("=== [2/2] Bundling Node.js Server ===");
const esbuildArgs = [
  'esbuild',
  'server.ts',
  '--bundle',
  '--platform=node',
  '--format=cjs',
  '--packages=external',
  '--sourcemap',
  '--outfile=dist/server.cjs'
];
const esbuildRes = spawnSync('npx', esbuildArgs, { stdio: 'inherit', shell: true });
if (esbuildRes.status !== 0) {
  const errMsg = "Server esbuild bundling failed. Check server.ts for compilation errors.";
  console.error("❌", errMsg);
  sendTelegramAlert("Build Failure (Server)", errMsg, "error").then(() => {
    process.exit(esbuildRes.status || 1);
  });
  return;
}

console.log("✅ Build completed successfully (dist/server.cjs ready).");
process.exit(0);
