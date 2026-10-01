#!/usr/bin/env bash
# ==============================================================================
# Isolated Deployment Helper for CoinMarketCap Trending Bot
# Ensures zero collision with other projects already running on the server
# ==============================================================================

set -e

PORT=${1:-3005}

echo "=== [1/5] Checking port availability for port :$PORT ==="
if sudo ss -tulpn | grep -q ":$PORT "; then
  echo "⚠️ Port $PORT is already in use by another service!"
  echo "Please run this script with a different port, e.g.: ./scripts/deploy-isolated.sh 3006"
  exit 1
else
  echo "✅ Port $PORT is free to use."
fi

echo "=== [2/5] Creating isolated system user 'cmcbot' (if not already existing) ==="
if ! id "cmcbot" &>/dev/null; then
  sudo useradd -m -s /bin/bash cmcbot
  echo "✅ Created system user: cmcbot"
else
  echo "✅ User 'cmcbot' already exists."
fi

echo "=== [3/5] Setting up project directory under /home/cmcbot/cmc-bot ==="
CURRENT_DIR=$(pwd)
sudo mkdir -p /home/cmcbot/cmc-bot
sudo cp -r "$CURRENT_DIR"/* /home/cmcbot/cmc-bot/ 2>/dev/null || true
sudo cp -r "$CURRENT_DIR"/.* /home/cmcbot/cmc-bot/ 2>/dev/null || true
sudo chown -R cmcbot:cmcbot /home/cmcbot/cmc-bot

echo "=== [4/5] Configuring isolated .env on port $PORT ==="
sudo -u cmcbot bash -c "cat << EOF > /home/cmcbot/cmc-bot/.env
PORT=$PORT
NODE_ENV=production
PLAYWRIGHT_BROWSERS_PATH=/home/cmcbot/.cache/ms-playwright
EOF"

echo "=== [5/5] Building and launching with PM2 under 'cmcbot' user ==="
sudo -u cmcbot -i bash -c "cd /home/cmcbot/cmc-bot && npm install && npm run build && pm2 start 'npm run start' --name 'cmc-trending-bot' && pm2 save"

echo ""
echo "🎉 SUCCESS: CoinMarketCap Bot has been deployed in complete isolation on port $PORT!"
echo "Your existing project was NOT touched."
echo "To view logs: sudo -u cmcbot pm2 logs cmc-trending-bot"
echo "To check status: sudo -u cmcbot pm2 list"
