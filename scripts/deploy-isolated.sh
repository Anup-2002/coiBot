#!/usr/bin/env bash
# ==============================================================================
# Isolated Deployment Helper for CoinMarketCap Trending Bot (AWS EC2 & Linux)
# Ensures zero collision with other projects already running on the server
# Preserves active sessions, cookies & profiles across code updates
# Sends instant Telegram failure & success notifications directly to you
# ==============================================================================

set -e

PORT=${1:-3005}
CURRENT_DIR=$(pwd)

# Helper function for Telegram alerts
send_alert() {
  local title="$1"
  local message="$2"
  local level="${3:-info}"
  node "$CURRENT_DIR/scripts/telegram-notify.cjs" "$title" "$message" "$level" 2>/dev/null || true
}

# Trap unexpected script errors
trap 'send_alert "Isolated Deployment Failed" "Deployment script failed unexpectedly on line $LINENO. Check server logs." error' ERR

echo "=== [1/5] Checking port availability for port :$PORT ==="
if sudo ss -tulpn 2>/dev/null | grep -q ":$PORT "; then
  # Check if the process occupying the port is already our own bot
  if sudo -u cmcbot pm2 list 2>/dev/null | grep -q "cmc-bot.*online"; then
    echo "ℹ️ Port $PORT is currently used by existing cmc-bot instance (will be cleanly updated)."
  else
    echo "⚠️ Port $PORT is already in use by another service!"
    echo "Please run this script with a different port, e.g.: ./scripts/deploy-isolated.sh 3006"
    send_alert "Deployment Blocked (Port In Use)" "Port :$PORT is currently occupied by another service on your server. Choose a different port." warning
    exit 1
  fi
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

echo "=== [3/5] Syncing project files with session preservation ==="
sudo mkdir -p /home/cmcbot/cmc-bot
sudo mkdir -p /home/cmcbot/cmc-bot/logs

# Safely back up live session cookies, active profiles, and output data before syncing
TEMP_BACKUP=$(mktemp -d)
if [ -d "/home/cmcbot/cmc-bot/auth" ]; then
  sudo cp -r /home/cmcbot/cmc-bot/auth "$TEMP_BACKUP/"
fi
if [ -d "/home/cmcbot/cmc-bot/output" ]; then
  sudo cp -r /home/cmcbot/cmc-bot/output "$TEMP_BACKUP/"
fi
if [ -f "/home/cmcbot/cmc-bot/.env" ]; then
  sudo cp /home/cmcbot/cmc-bot/.env "$TEMP_BACKUP/"
fi

# Copy updated codebase
sudo cp -r "$CURRENT_DIR"/* /home/cmcbot/cmc-bot/ 2>/dev/null || true
sudo cp -r "$CURRENT_DIR"/.* /home/cmcbot/cmc-bot/ 2>/dev/null || true

# Restore preserved live sessions & credentials
if [ -d "$TEMP_BACKUP/auth" ]; then
  sudo cp -r "$TEMP_BACKUP/auth"/* /home/cmcbot/cmc-bot/auth/ 2>/dev/null || true
fi
if [ -d "$TEMP_BACKUP/output" ]; then
  sudo cp -r "$TEMP_BACKUP/output"/* /home/cmcbot/cmc-bot/output/ 2>/dev/null || true
fi
if [ -f "$TEMP_BACKUP/.env" ]; then
  sudo cp "$TEMP_BACKUP/.env" /home/cmcbot/cmc-bot/.env
fi
rm -rf "$TEMP_BACKUP"

echo "=== [4/5] Configuring isolated .env on port $PORT ==="
if [ ! -f "/home/cmcbot/cmc-bot/.env" ]; then
  if [ -f "$CURRENT_DIR/.env" ]; then
    sudo cp "$CURRENT_DIR/.env" /home/cmcbot/cmc-bot/.env
  else
    sudo cp "$CURRENT_DIR/.env.example" /home/cmcbot/cmc-bot/.env
  fi
fi

# Ensure PORT and PLAYWRIGHT_BROWSERS_PATH are set correctly in .env
sudo -u cmcbot bash -c "
  grep -q '^PORT=' /home/cmcbot/cmc-bot/.env && sed -i 's/^PORT=.*/PORT=$PORT/' /home/cmcbot/cmc-bot/.env || echo 'PORT=$PORT' >> /home/cmcbot/cmc-bot/.env
  grep -q '^NODE_ENV=' /home/cmcbot/cmc-bot/.env && sed -i 's/^NODE_ENV=.*/NODE_ENV=production/' /home/cmcbot/cmc-bot/.env || echo 'NODE_ENV=production' >> /home/cmcbot/cmc-bot/.env
  grep -q '^PLAYWRIGHT_BROWSERS_PATH=' /home/cmcbot/cmc-bot/.env && sed -i 's|^PLAYWRIGHT_BROWSERS_PATH=.*|PLAYWRIGHT_BROWSERS_PATH=/home/cmcbot/.cache/ms-playwright|' /home/cmcbot/cmc-bot/.env || echo 'PLAYWRIGHT_BROWSERS_PATH=/home/cmcbot/.cache/ms-playwright' >> /home/cmcbot/cmc-bot/.env
  grep -q '^TELEGRAM_BOT_TOKEN=' /home/cmcbot/cmc-bot/.env || echo 'TELEGRAM_BOT_TOKEN=8698939017:AAHMbpwBznDWBLDJiW9-ogqvYODXbjA3wGU' >> /home/cmcbot/cmc-bot/.env
  grep -q '^TELEGRAM_CHAT_ID=' /home/cmcbot/cmc-bot/.env || echo 'TELEGRAM_CHAT_ID=1817931967' >> /home/cmcbot/cmc-bot/.env
"
sudo chown -R cmcbot:cmcbot /home/cmcbot/cmc-bot

echo "=== [5/5] Installing dependencies, compiling & launching with PM2 ==="
sudo -u cmcbot -i bash -c "
  cd /home/cmcbot/cmc-bot
  npm install
  (npx playwright install --with-deps chromium 2>/dev/null || npx playwright install chromium)
  npm run build
  if pm2 describe cmc-bot &>/dev/null; then
    pm2 reload ecosystem.config.cjs --update-env || pm2 restart cmc-bot
  else
    pm2 start ecosystem.config.cjs
  fi
  pm2 save
"

echo ""
echo "🎉 SUCCESS: CoinMarketCap Bot has been deployed in complete isolation on port $PORT!"
echo "Your existing projects were NOT touched."
echo "Active sessions and cookies were fully preserved."
echo "To view live logs: sudo -u cmcbot pm2 logs cmc-bot"
echo "To check status:   sudo -u cmcbot pm2 list"

send_alert "Deployment Succeeded" "🎉 CoinMarketCap Bot has deployed successfully in isolated mode on Port :$PORT!\nBot is running under PM2 service 'cmc-bot'." success
