# 🚀 Production Redeployment Guide — CoinMarketCap Bot

This guide gives you the exact step-by-step commands to redeploy latest updates on your Ubuntu Linux server (`ip-172-31-10-96`) safely with zero downtime.

---

## ⚡ Quick Redeploy (Daily Routine)

Whenever you make updates or push new code, run these 4 commands inside your server terminal:

```bash
cd /home/cmcbot/cmc-bot
git pull
npm run build
pm2 restart cmc-bot --update-env
pm2 logs cmc-bot --lines 30
```

---

## 📋 Comprehensive Redeploy Workflow (Step-by-Step)

### Step 0: Connect to Your Server & Switch to `cmcbot` User
Log into your EC2 server and ensure you are working under the dedicated `cmcbot` user:

```bash
# Check your current user
whoami

# If you are logged in as 'ubuntu' or 'root', switch to 'cmcbot':
sudo -u cmcbot -i

# Navigate to your project directory
cd /home/cmcbot/cmc-bot
pwd
```
*(Expected output: `/home/cmcbot/cmc-bot`)*

---

### Step 1: Pre-Flight Check & Git Status
Check that your local repository has no conflicting unstaged edits:

```bash
git status
```

* **If git says "working tree clean"**: You are ready to pull.
* **If git reports modified files**: Stash or discard them so `git pull` runs cleanly:
  ```bash
  # Option A: Stash local changes safely
  git stash

  # Option B: Or discard local uncommitted file changes
  git reset --hard HEAD
  ```

---

### Step 2: Pull Latest Changes
Download the latest code from your repository:

```bash
git pull origin main
```
*(Or `git pull` if tracking branch is already configured)*

---

### Step 3: Install Dependencies (If `package.json` Changed)
If new npm dependencies were added:

```bash
npm install
```

---

### Step 4: Build Production Artifacts
Compile the Vite frontend client and bundle `server.ts` into `dist/server.cjs`:

```bash
npm run build
```

**Expected Output:**
```text
=== [1/2] Building Vite Frontend ===
✓ built in ...ms
=== [2/2] Bundling Node.js Server ===
✅ Build completed successfully (dist/server.cjs ready).
```

---

### Step 5: Check PM2 Process Health
Confirm your PM2 process list before restarting:

```bash
pm2 list
```

* **Healthy state**: You should only see:
  1. `cmc-bot` (online)
  2. `cmc-tunnel` (online)
* **If you see duplicate instances** (e.g. `cmc-trending-bot`): Remove the duplicate:
  ```bash
  pm2 delete cmc-trending-bot
  pm2 save
  ```

---

### Step 6: Restart the Bot Process
Restart `cmc-bot` and instruct PM2 to reload all new environment variables:

```bash
pm2 restart cmc-bot --update-env
```

---

### Step 7: Post-Deploy Verification (Live Logs & Status)
Inspect the startup logs to verify healthy initialization:

```bash
pm2 logs cmc-bot --lines 30
```

**What to look for in the logs:**
* `[INFO] Server running on port 3005` (or your configured PORT)
* `[STORAGE] Profiles synced successfully`
* `[SCHEDULER] Next cycle: ... Today's progress: 0/4 cycles.`
* `No critical errors or unhandled rejections`

To exit the live log stream, press: `Ctrl + C`.

---

### Step 8: Verify Tunnel & Health Check (Optional)
Test the local server endpoint directly from the command line:

```bash
# Check HTTP status endpoint
curl -s http://localhost:3005/api/status | grep -o '"status":"[^"]*"'

# Save PM2 process state so it automatically recovers after server reboots
pm2 save
```

---

## 🛠️ Common Troubleshooting

### 1. `EADDRINUSE` (Port Already in Use)
If port 3005 is busy:
```bash
sudo ss -tulpn | grep 3005
pm2 restart cmc-bot
```

### 2. Updating Daily Post Limit in `.env`
To check or update the daily posting limit directly in your server's `.env`:
```bash
# Check current value
grep "DAILY_POST_LIMIT" .env

# Set it to 300 in one command
sed -i 's/DAILY_POST_LIMIT=.*/DAILY_POST_LIMIT=300/' .env

# Apply the change to PM2
pm2 restart cmc-bot --update-env
```

### 3. Adjusting Posting Speed / Cooldown (`POST_COOLDOWN_SECONDS`)
The default pacing is **35–45s** between posts (safe human cadence). To increase speed:
```bash
# Set to 20s (Fast Turbo — ~50% faster, 40 coins in ~20 minutes)
grep -q "POST_COOLDOWN_SECONDS" .env && sed -i 's/POST_COOLDOWN_SECONDS=.*/POST_COOLDOWN_SECONDS=20/' .env || echo "POST_COOLDOWN_SECONDS=20" >> .env

# Or set to 12s (Maximum Turbo — 40 coins in ~15 minutes)
# sed -i 's/POST_COOLDOWN_SECONDS=.*/POST_COOLDOWN_SECONDS=12/' .env

# Apply to PM2
pm2 restart cmc-bot --update-env
```

### 4. Playwright Chromium Missing on Fresh Server
If Playwright logs say Chromium binary not found:
```bash
npx playwright install chromium
```

### 5. Session Cookies Not Loaded
If bot logs report `Session expired / missing cookies`:
1. Open the web UI in your browser via your Cloudflare tunnel URL.
2. Go to the **Profiles** tab.
3. Verify your active account is marked as `Active` and has valid cookies imported.
