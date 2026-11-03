# 🚀 Production Redeployment Guide — CoinMarketCap Bot

This guide gives you the exact step-by-step commands to redeploy latest updates on your Ubuntu Linux server (`ip-172-31-10-96`) safely with zero downtime.

---

## 🔑 0. Command to Enter `cmcbot` User (From `ssm-user` / `ubuntu`)

```bash
sudo -u cmcbot -i
```

---

## ⚡ Quick Redeploy (Works From ANY User — Even Before Typing `sudo -u cmcbot -i`)

Paste this single block directly into your terminal (works whether you are in `ssm-user` or already in `cmcbot`):

```bash
sudo -u cmcbot -i bash -c '
  cd /home/cmcbot/cmc-bot &&
  git fetch origin &&
  git reset --hard origin/main &&
  rm -rf dist /home/cmcbot/.npm/_cacache /home/cmcbot/.npm/_logs &&
  npm run build &&
  PORT=3000 pm2 restart cmc-bot --update-env &&
  pm2 save &&
  pm2 logs cmc-bot --nostream --lines 20
'
```

*(Or if you already ran `sudo -u cmcbot -i`, you can also run:)*
```bash
cd /home/cmcbot/cmc-bot && \
git fetch origin && \
git reset --hard origin/main && \
rm -rf dist /home/cmcbot/.npm/_cacache /home/cmcbot/.npm/_logs && \
npm run build && \
PORT=3000 pm2 restart cmc-bot --update-env && \
pm2 save && \
pm2 logs cmc-bot --nostream --lines 20
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

---

## ⏪ Emergency Rollback to Previous Production Deploy (`925fdf7`)

- **Previous Live Production Commit on `ip-172-31-10-96`:** `925fdf7` (*build: remove system dependency installation step*, also saved in `~/previous_deploy_commit.txt`)
- **Rollback Command (run as `cmcbot`):**
```bash
sudo -u cmcbot -i bash -c '
  cd /home/cmcbot/cmc-bot &&
  git reset --hard 925fdf7 &&
  npm run build &&
  PORT=3000 pm2 restart cmc-bot --update-env &&
  pm2 save
'
```

---

## 📊 Server Resource Usage & Project Isolation (`ip-172-31-10-96`)

`cmc-bot` runs strictly under the isolated Linux user `cmcbot` inside `/home/cmcbot/cmc-bot` on port `3000` (`127.0.0.1:3000` -> `cmc-tunnel`). It does not touch any other user, folder, or port on the server.

### 1. Overall Server vs. `cmcbot` Footprint
| Resource | Server Total | Used by `cmcbot` | Free / Available | Impact on Other Projects |
| :--- | :--- | :--- | :--- | :--- |
| **RAM** | `3.8 GB` | **`~248 MB` (`6.4%`)** | **`2.6 GB` Available** | **None** (PM2 `1G` safety cap) |
| **CPU (Idle)** | `100%` | **`0.0% – 2.5%`** | **`~97.5%` Free** | **None** |
| **Disk (`/dev/root`)** | `77.0 GB` | **`1.4 GB` (`1.8%`)** *(cleaned from `3.3 GB`)* | **`~43.9 GB` Free (`57%`)** | **None** |
| **Peak RAM (1 Chromium Active)** | `3.8 GB` | **`~455 – 535 MB` (`12% – 13.8%`)** | **`> 2.15 GB` Free** | **None** (`PlaywrightLock` max 1 browser) |
| **Port** | All ports | **`3000` only** | All other ports free | **Zero port conflicts** |

### 2. Process & Disk Breakdown (`/home/cmcbot`)
| Component / Path | RAM / Disk Used | Notes |
| :--- | :--- | :--- |
| **`cmc-bot`** (`node dist/server.cjs`) | `165.5 MB` RAM | Single PM2 fork instance (no duplicates) |
| **`cmc-tunnel`** (`cloudflared`) | `34.7 MB` RAM | Forwards to `http://127.0.0.1:3000` |
| **`PM2 God Daemon`** (`cmcbot`) | `47.2 MB` RAM | Manages `cmc-bot` and `cmc-tunnel` |
| `/home/cmcbot/.cache/ms-playwright` | `~900 MB` Disk | Active Chromium `1248` binary cache (`1.9 GB` `.npm` & old browser caches cleaned) |
| `/home/cmcbot/cmc-bot/node_modules` | `442 MB` Disk | Node.js dependencies |
| `/home/cmcbot/cmc-bot/dist` + `output` + `public` | `~7.8 MB` Disk | Production bundle, cached data & images |

