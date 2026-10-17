/**
 * PM2 Ecosystem Configuration for CoinMarketCap Trending Bot
 * Optimized for AWS EC2 & Linux production deployments
 */
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'cmc-bot',
      script: 'dist/server.cjs',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G', // Automatically recycles process if memory ever exceeds 1GB
      restart_delay: 3000,
      exp_backoff_restart_delay: 200,
      max_restarts: 15,
      time: true, // Prepends timestamps to all PM2 log lines
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3005,
        PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || './.cache/ms-playwright',
      },
      out_file: path.join(__dirname, 'logs', 'pm2-out.log'),
      error_file: path.join(__dirname, 'logs', 'pm2-err.log'),
      merge_logs: true,
      kill_timeout: 8000, // Allows graceful cleanup of open Playwright pages before termination
    },
  ],
};
