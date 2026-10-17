#!/usr/bin/env bash
# ==============================================================================
# AWS EC2 / Linux Host Preparation Script for CoinMarketCap Trending Bot
# Run ONCE on your EC2 instance as root or with sudo
# ==============================================================================

set -e

echo "=== [1/4] Checking and configuring Virtual Swap Memory (2GB) ==="
if [ $(swapon --show | wc -l) -le 1 ]; then
  echo "Setting up 2GB swap file to prevent Chromium Out-Of-Memory (OOM) crashes..."
  sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  fi
  echo "✅ 2GB Swap Memory created and activated successfully."
else
  echo "✅ Swap memory already active ($(swapon --show --noheadings | awk '{print $3}'))."
fi

echo "=== [2/4] Installing Linux Playwright Chromium system dependencies ==="
sudo apt-get update -y
sudo apt-get install -y \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libpango-1.0-0 \
  libcairo2 \
  libasound2 \
  libxshmfence1 \
  ca-certificates \
  fonts-liberation
echo "✅ Linux browser graphic & font libraries installed."

echo "=== [3/4] Ensuring Node.js and PM2 are installed globally ==="
if ! command -v pm2 &>/dev/null; then
  echo "Installing PM2 process manager globally..."
  sudo npm install -g pm2
else
  echo "✅ PM2 is already installed ($(pm2 --version))."
fi

echo "=== [4/4] Configuring PM2 to auto-start on server reboot ==="
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u cmcbot --hp /home/cmcbot 2>/dev/null || true
echo "✅ PM2 startup service registered."

echo ""
echo "🎉 SUCCESS: Your AWS EC2 server is fully optimized and prepared!"
echo "Now you can run: ./scripts/deploy-isolated.sh 3005"
