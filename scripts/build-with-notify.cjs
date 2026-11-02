#!/usr/bin/env node
/**
 * Build runner with automated Telegram failure notification
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { sendTelegramAlert } = require('./telegram-notify.cjs');

// Ensure Linux x64 native optional packages are installed if package-lock.json was generated on Windows/macOS (npm issue #4828)
if (process.platform === 'linux' && process.arch === 'x64') {
  const nativePairs = [
    { parent: 'rollup', nativePkg: '@rollup/rollup-linux-x64-gnu' },
    { parent: '@tailwindcss/oxide', nativePkg: '@tailwindcss/oxide-linux-x64-gnu' },
    { parent: 'lightningcss', nativePkg: 'lightningcss-linux-x64-gnu' },
    { parent: 'esbuild', nativePkg: '@esbuild/linux-x64' },
  ];
  const missingSpecs = [];
  for (const { parent, nativePkg } of nativePairs) {
    const nativeDir = path.join(process.cwd(), 'node_modules', ...nativePkg.split('/'));
    if (!fs.existsSync(nativeDir)) {
      try {
        const parentPkgPath = path.join(process.cwd(), 'node_modules', ...parent.split('/'), 'package.json');
        const parentVersion = JSON.parse(fs.readFileSync(parentPkgPath, 'utf-8')).version;
        missingSpecs.push(`${nativePkg}@${parentVersion}`);
      } catch (_) {
        missingSpecs.push(nativePkg);
      }
    }
  }
  if (missingSpecs.length > 0) {
    console.log(`=== [0/2] Installing missing Linux native build binaries: ${missingSpecs.join(', ')} ===`);
    spawnSync('npm', ['install', '--no-save', '--no-package-lock', '--no-audit', '--no-fund', ...missingSpecs], {
      stdio: 'inherit',
      shell: true,
    });
  }
}

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
