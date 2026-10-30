# CoinMarketCap Automation Bot & Analytics Dashboard

A highly optimized, production-ready full-stack application designed to automate trend tracking, contextual social commentary generation, and automated posting on CoinMarketCap. The system features an interactive, real-time React 19 control center powered by a robust Express backend, utilizing Playwright headless browser automation, OpenAI/Gemini capabilities, and persistent Firestore data synchronizations.

---

## Table of Contents
1. [System Architecture Overview](#1-system-architecture-overview)
2. [Key Features & Capabilities](#2-key-features--capabilities)
3. [Dual-Environment Pipeline](#3-dual-environment-pipeline)
4. [Project Directory Structure](#4-project-directory-structure)
5. [Prerequisites & Local Installation](#5-prerequisites--local-installation)
6. [Subpath Deployment Behind Nginx (AWS EC2)](#6-subpath-deployment-behind-nginx-aws-ec2)
7. [Running in Production with PM2](#7-running-in-production-with-pm2)
8. [API Reference & Data Exporters](#8-api-reference--data-exporters)
9. [Troubleshooting & Environment Tuning](#9-troubleshooting--environment-tuning)
10. [Proxy Configuration Guide (Per-Account IP Isolation)](#10-proxy-configuration-guide-per-account-ip-isolation)

---

## 1. System Architecture Overview

The system employs a unified **full-stack monolithic architecture** running React 19 on the frontend and Express on the backend, tightly integrated via Vite 6. 

```
┌────────────────────────────────────────────────────────┐
│                    Nginx Reverse Proxy                 │
│                 (Subpath Routing: /anup)               │
└──────────────────────────┬─────────────────────────────┘
                           │ proxy_pass
                           ▼
┌────────────────────────────────────────────────────────┐
│                     Express Backend                    │
│                        (Port 3000)                     │
├──────────────────────────┬─────────────────────────────┤
│   API Route Handlers     │  Static Production Assets   │
│   (Logs, Session, etc.)  │  (Built via Vite to /dist)  │
└────────────┬─────────────┴───────────────┬─────────────┘
             │                             │
             ▼                             ▼
┌──────────────────────────┐ ┌───────────────────────────┐
│ Playwright Core Engine   │ │ React 19 Dashboard        │
│ (CoinMarketCap 2FA Flow) │ │ (Interactive & Responsive)│
└──────────────────────────┘ └───────────────────────────┘
```

---

## 2. Key Features & Capabilities

* **Playwright Browser Automation**: Simulates secure, human-like browser sessions on CoinMarketCap, including automated form fills, multi-factor OTP (One-Time Password) synchronization, and continuous cookie management.
* **Trend Gathering**: Scrapes and indexes hot, new, and high-velocity trending crypto assets on CoinMarketCap.
* **AI-Generated Social Comments**: Interfaces with large language models to construct contextually relevant, compliant social commentaries on specific crypto tokens.
* **Dynamic Data Syncing**: Writes and reads configurations, task states, and log files seamlessly to client-side panels and secure long-term databases.
* **Granular Exporters**: Allows quick downloads of historical trend data, commentaries, submission logs, and overall bot productivity in clean CSV formats.

---

## 3. Dual-Environment Pipeline

The application features complete isolation between **Development** and **Production** environments, avoiding any Vite compilation runtime overhead in staging or production.

### Development Mode (`npm run dev`)
* Vite runs dynamically as a **middleware agent** inside Express (`createViteServer()`).
* Serves `/src/main.tsx` and loads assets directly from the source.
* Activates Hot Module Replacement (HMR) and real-time React Fast Refresh.

### Production Mode (`npm start`)
* High-speed production assets are pre-built into static directories (`/dist`).
* Express completely **bypasses the Vite compilation engine** and serves pre-minimized, hashed files using `express.static()`.
* Routes fallback SPA paths (like `/dashboard` or `/settings`) securely to `/dist/index.html`.
* Avoids standard developer socket issues or unexpected `/@vite/client` injection errors.

---

## 4. Project Directory Structure

> For a complete file-by-file navigation table ("Where to Find What") and backend dependency layer map, see **[PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)**.

```text
├── .cache/ms-playwright/      # Playwright browser binary cache
├── dist/                      # Compiled production frontend & bundled server (dist/server.cjs)
├── docs/                      # Architecture plans & deployment guides (MODULAR_SPLIT_PLAN.md, REDEPLOY.md, etc.)
├── output/                    # Local profile-isolated storage for coins, comments, and results
├── auth/                      # Local storage for account profiles, session cookies, and settings
├── server/                    # Modular Express + Playwright backend (config, state, logger, files, profiles, sync, etc.)
│   └── routes/                # Express route modules (output, profiles, status-health, images, login, bot-actions, admin-data, scheduler)
├── src/                       # Modular React 19 frontend application
│   ├── pages/                 # Page views (Dashboard, Scheduler, Admin, Logs, Health, Guide)
│   ├── components/            # Shared UI components, HeaderNavbar, and modals
│   ├── hooks/                 # Central state controller (useAppController) & polling hooks (useDashboardPolling)
│   └── utils/                 # Shared scheduler, formatter, and UI helpers
├── tests/                     # Vitest unit & Supertest route integration tests
├── scripts/                   # Build, smoke test, login, and EC2 deployment scripts
├── PROJECT_STRUCTURE.md       # Complete codebase map & quick navigation guide
├── AGENTS.md                  # AI developer rules & architectural invariants
├── server.ts                  # Express entrypoint & SPA fallback router
├── vite.config.ts             # Vite bundler, alias, and subpath configurations
├── package.json               # Dependency declarations & automation scripts
└── tsconfig.json              # TypeScript compilation specifications
```

---

## 5. Prerequisites & Local Installation

### System Prerequisites
* **Node.js**: `v22.x` or higher (LTS versions highly recommended)
* **NPM**: `v10.x` or higher
* **Operating System**: Linux (Ubuntu/Debian), macOS, or Windows

### Step 1: Clone and Install Dependencies
```bash
# Install core packages
npm install
```

### Step 2: Install Playwright Browser Binaries
Playwright requires specialized chromium runtimes to successfully automate headless/headful scraping.
```bash
# Automatically install compliant Chromium runtimes into the designated cache
npx playwright install chromium
```

### Step 3: Run in Development Mode
```bash
npm run dev
```
The application will start on `http://localhost:3000`. In development mode, the Vite server middleware will automatically capture changes and refresh the dashboard.

---

## 6. Subpath Deployment Behind Nginx (AWS EC2)

When hosting this app alongside other applications on an AWS EC2 instance, you can safely deploy it under a subpath (e.g., `/anup/`).

### Step 1: Set Environment Variables
Create or append to your environment configuration (`.env` or PM2 variables) the following values:
```env
PORT=3000
NODE_ENV=production
BASE_PATH=/anup
```

### Step 2: Build the Production Artifacts
Vite uses the `BASE_PATH` env variable during compile time to rewrite production import assets so they resolve safely.
```bash
# Cleans existing builds, bundles client files, compiles server, and prepares Playwright
npm run build
```

### Step 3: Configure Nginx Reverse Proxy
Add the following location block to your active server configuration (typically in `/etc/nginx/sites-available/default`):

```nginx
location /anup/ {
    # Set proxy headers to support websockets, dynamic routing, and real client IPs
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Adjust file size limit for configuration inputs or CSV downloads if required
    client_max_body_size 10M;
}
```

Test and reload Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 7. Running in Production with PM2

To ensure the server runs persistently in the background, survives terminal disconnects, and auto-restarts on unexpected system crashes, utilize PM2.

### Step 1: Install PM2 Globally
```bash
sudo npm install -g pm2
```

### Step 2: Create a PM2 ecosystem file (`ecosystem.config.cjs`)
Create this file in your project root to manage environments easily:
```javascript
module.exports = {
  apps: [{
    name: 'cmc-automation-bot',
    script: './dist/server.cjs',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      BASE_PATH: '/anup',
      PLAYWRIGHT_BROWSERS_PATH: './.cache/ms-playwright'
    }
  }]
};
```

### Step 3: Start and Manage the Application
```bash
# Start the application
pm2 start ecosystem.config.cjs

# Check active application logs
pm2 logs cmc-automation-bot

# Monitor real-time memory and CPU utilization
pm2 monit

# Save PM2 state to recover on server reboot
pm2 save
pm2 startup
```

---

## 8. API Reference & Data Exporters

All dynamic API communications occur through highly responsive, JSON-compliant Express routes. If a `BASE_PATH` (such as `/anup`) is specified, it serves as the base prefix for all requests:

* **System Status & Health Check**
  * `GET /api/status` - Returns current activity state (e.g., Idle, Processing, Authenticating).
  * `GET /api/check-system` - Tests local directories, Playwright instance integrity, and credentials.
* **CoinMarketCap Session Pipeline**
  * `POST /api/start-login` - Submits credentials and initiates Chromium headless agent.
  * `POST /api/submit-otp` - Delivers MFA code received by the user.
  * `POST /api/cancel-login` - Safe shutdown of any currently running browser threads.
* **Exporter Routes (CSV Outputs)**
  * `GET /api/download/trending_coins.csv`
  * `GET /api/download/generated_comments.csv`
  * `GET /api/download/post_submissions.csv`
  * `GET /api/download/overall_report.csv`

---

## 9. Troubleshooting & Environment Tuning

### Problem: 502 Bad Gateway / Connection Refused
* **Resolution**: Check if the Express app is actively running on port 3000. Run `pm2 status` or `netstat -tulnp | grep 3000` to verify. Ensure Nginx's `proxy_pass` matches your application's port exactly.

### Problem: Assets fail to load or result in 404
* **Resolution**: Ensure you ran `npm run build` after changing the `BASE_PATH` variable. The frontend router and asset linker require compile-time injection of the base path. Verify that `dist/index.html` references assets under `<base_path>/assets/` (e.g., `/anup/assets/`).

### Problem: Playwright fails with "Executable not found" on Linux
* **Resolution**: Run `npx playwright install-deps` on your EC2 instance. This installs required native system dependencies (X11, fontconfig, etc.) needed for Chromium to run under headless environments.

---

## 10. Proxy Configuration Guide (Per-Account IP Isolation)

To protect your CoinMarketCap accounts from simultaneous IP rate-limits, shadowbans, or Cloudflare challenges, the bot supports **per-profile native proxy routing**.

### 10.1 Why Use Proxies?
By default, all accounts run through the server's main IP. If one account posts too quickly and CoinMarketCap blocks or throttles that IP, all other accounts on that server are affected. Setting a unique proxy per profile gives each account its own dedicated residential/datacenter IP address.

### 10.2 Where to Get Proxies
You can purchase or test proxies from reputable proxy providers:
* **Webshare** ([webshare.io](https://www.webshare.io)) — Offers 10 free proxies to test immediately.
* **IPRoyal** ([iproyal.com](https://iproyal.com)) — Inexpensive residential and datacenter proxies with custom credentials.
* **Proxy-Seller** ([proxy-seller.com](https://proxy-seller.com)) — Dedicated private IPv4/IPv6 and SOCKS5 proxies.
* **BrightData** or **Smartproxy** — High-end rotating residential proxies.

### 10.3 Proxy URL Format
Combine your provider's credentials into a standard URL string:

* **Authenticated HTTP Proxy (Standard)**:
  ```text
  http://username:password@ip-address:port
  ```
  *Example:* `http://user123:secret456@185.199.229.15:8080`

* **IP-Whitelisted Proxy (No credentials needed)**:
  ```text
  http://ip-address:port
  ```
  *Example:* `http://185.199.229.15:8080`

* **SOCKS5 Proxy**:
  ```text
  socks5://username:password@ip-address:port
  ```
  *Example:* `socks5://user123:secret456@185.199.229.15:1080`

### 10.4 How to Add a Proxy in the Dashboard

#### Option A: For an Existing Account
1. Open the dashboard and click the **Profiles** tab.
2. Locate your account card.
3. Next to the daily limit badge, click the purple **`+ Set Proxy`** button (or **`Edit Proxy`**).
4. Paste your proxy string (e.g., `http://user:pass@ip:port`).
5. Click **Save**. A purple `🌐 ip:port` badge will appear on the card.

#### Option B: When Creating a New Account
1. In the **Profiles** tab, click **`+ Add Profile`**.
2. Enter the profile name, cookies JSON (`state.json`), and daily limit.
3. In the **`Proxy (Optional)`** field, paste your proxy URL.
4. Click **`Save Account Profile`**.

#### Option C: Global Fallback (.env)
You can set a default fallback proxy for all accounts that don't have an individual proxy by adding this to your `.env` file:
```env
DEFAULT_PROXY=http://username:password@ip-address:port
```

### 10.5 How to Remove or Clear a Proxy
To revert an account back to standard direct connection:
1. Click **`Edit Proxy`** on the account card.
2. Clear the text input box completely.
3. Click **`Save`**. The account immediately switches back to the direct server connection.

