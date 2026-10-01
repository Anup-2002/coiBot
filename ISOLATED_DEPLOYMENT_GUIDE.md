# 🛡️ Zero-Disturbance Isolated Deployment Guide

This guide explains how to deploy the **CoinMarketCap Bot** on a server that **already runs another project**, ensuring:
* **Zero downtime** or interference with your existing project.
* **Dedicated Linux User** (`cmcbot`) so file permissions, dependencies, and environment variables are strictly isolated.
* **Dedicated Port** (`3005` or custom) so there are no port collisions (`EADDRINUSE`).
* **Isolated PM2 Process** that operates independently from your other project's processes.

---

## 🔍 Step 0: Quick Verification (Run on your Server First)

Before doing anything, run these two read-only diagnostic commands on your server:

```bash
# 1. Check which ports are currently used by your other project
sudo ss -tulpn | grep LISTEN
# (Look at the port numbers on the right, e.g. :80, :443, :3000, :8080)

# 2. Check if PM2 is already running processes
pm2 list
```

Choose an unused port for this bot (for example: **`3005`**).

---

## 👤 Step 1: Create a Dedicated Linux User

Creating a new user guarantees that npm caches, Playwright Chromium binaries, and `.env` secrets remain completely separated in their own home directory:

```bash
# Create user 'cmcbot' with a home directory and bash shell
sudo useradd -m -s /bin/bash cmcbot

# (Optional) Set a password if you want direct SSH access
sudo passwd cmcbot
```

---

## 📦 Step 2: Clone & Build Under the New User

Switch to the new user and set up the project:

```bash
# Switch to the cmcbot user
sudo -u cmcbot -i

# Navigate to home directory
cd /home/cmcbot

# Clone your repository
git clone <YOUR_GIT_REPO_URL> cmc-bot
cd cmc-bot

# Install project dependencies
npm install
```

---

## ⚙️ Step 3: Configure Environment & Isolated Port

Create your `.env` file inside `/home/cmcbot/cmc-bot/.env`:

```bash
cat << 'EOF' > .env
# Set a unique port that does not collide with your other app
PORT=3005
NODE_ENV=production

# Your API Keys
OPENAI_API_KEY=your_openai_key_here
GEMINI_API_KEY=your_gemini_key_here

# Playwright path inside isolated user directory
PLAYWRIGHT_BROWSERS_PATH=/home/cmcbot/.cache/ms-playwright
EOF
```

---

## 🌐 Step 4: Install Chromium & System Libraries

Playwright needs Chromium and standard Linux graphics libraries:

```bash
# 1. Download Chromium binary to the isolated cache
npx playwright install chromium

# 2. Install required Linux shared libraries (run with sudo)
exit # temporarily exit cmcbot back to your admin user
sudo npx playwright install-deps chromium
```

> **Note on system libraries:** `playwright install-deps` only installs standard shared packages (like `libnss3`, `libatk`). These are standard operating system libraries and will **not** modify or break your existing apps.

---

## 🚀 Step 5: Build & Launch with PM2

Switch back to `cmcbot` and start the bot:

```bash
sudo -u cmcbot -i
cd /home/cmcbot/cmc-bot

# Build the frontend and backend bundle
npm run build

# Start with PM2 under a unique process name
pm2 start "npm run start" --name "cmc-trending-bot"

# Save PM2 state for this user
pm2 save
```

Verify it is running:
```bash
pm2 list
pm2 logs cmc-trending-bot --lines 20
```

---

## 🔀 Step 6: Route Web Traffic (Nginx Setup)

To access the dashboard without disturbing your other project's domain:

### Option A: Dedicated Subdomain (Recommended)
Point a subdomain (e.g. `cmc.yourdomain.com`) to your server IP, then create a new Nginx config file:

```bash
sudo nano /etc/nginx/sites-available/cmc-bot.conf
```

Paste this block:
```nginx
server {
    listen 80;
    server_name cmc.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and reload Nginx without dropping existing connections:
```bash
sudo ln -s /etc/nginx/sites-available/cmc-bot.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
*(Using `systemctl reload` reloads configuration smoothly without restarting or interrupting other websites).*

---

### Option B: Direct Port Access (No Nginx changes required)
If you don't want to touch Nginx at all:
1. In your **AWS EC2 Security Group**, add an **Inbound Rule**:
   * **Type:** Custom TCP
   * **Port:** `3005`
   * **Source:** `0.0.0.0/0` (or your specific IP)
2. Access your dashboard directly at:
   `http://YOUR_SERVER_PUBLIC_IP:3005`

---

## 🛡️ Summary of Isolation Safeguards

| Resource | Existing Project | CoinMarketCap Bot | Collision Risk |
| :--- | :--- | :--- | :--- |
| **System User** | `ubuntu` / `root` / `www-data` | `cmcbot` | **Zero** (Isolated home directory) |
| **Network Port** | e.g. `3000` / `8080` | `3005` | **Zero** (Distinct TCP port) |
| **Process Manager** | Existing PM2 / Systemd | `cmc-trending-bot` | **Zero** (Unique process name/user) |
| **Node Modules** | `/var/www/other-app` | `/home/cmcbot/cmc-bot/node_modules` | **Zero** (Completely separate trees) |
| **Nginx** | Existing `.conf` files untouched | Separate `cmc-bot.conf` or direct port | **Zero** (`reload` does not drop traffic) |
