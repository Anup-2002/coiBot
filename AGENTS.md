# CoinMarketCap Trending Bot & Posting Agent - Developer Context

Welcome, future Agent! This document contains the full system context, architectural map, database schemas, and critical business rules for the **CoinMarketCap Trending & Posting Bot**. 

The system operates as a full-stack Node.js (Express + TypeScript) app paired with a React frontend (Vite) and cloud storage via Firestore.

---

## 🚀 1. Application Overview
This application is an automated agent that:
1. **Scrapes or fetches** the latest trending crypto coins from CoinMarketCap (or public fallback APIs).
2. **Generates tailored commentary/analysis** for these coins using LLMs:
   - **Primary Model**: OpenAI SDK (`gpt-4o-mini`) via `OPENAI_API_KEY`.
   - **Fallback Model**: Gemini SDK (`gemini-2.5-flash`) via `GEMINI_API_KEY` (or standard Google API key).
3. **Automates browser logins and posting workflows** using a customized real-browser engine (Playwright/Chromium) to submit comments directly to target web destinations, tracking success/failure in real time.
4. **Supports Multiple Profiles**: Active browser sessions, generated lists, and results are siloed by **active profiles** stored securely in Firestore and local configuration folders.

---

## 🛠️ 2. Critical State & Authentication Guardrails (IMPORTANT)

We resolved a major **data leakage and consistency bug** related to active accounts and sessions. You must preserve these strict invariants:

### The "No Account / No Session" Invariant
When no profile is active, or when no authenticated browser session is imported/active:
1. **No Data Leakage**: The frontend should display a clean, idle interface. No previous profile's coins list, generated messages, post-results, or logs should leak or persist in the UI.
2. **Static Endpoint Interception** (`server/routes/output.ts`):
   - `/output/last_trending.json`, `/output/generated_messages.json`, and `/output/results.json` are intercepted by the server before `express.static`. If `!activeId` or `!sessionExists`, they immediately return empty lists `[]`.
3. **Status Endpoint Guard** (`server/routes/status-health.ts`):
   - `/api/status` checks if `activeId` and `sessionExists` are valid. If either is missing, it returns a sanitized idle status object with empty arrays, `totalCoins: 0`, and `sessionStatus: "Login expired — please log in again"`.
4. **CSV Download Safeguards** (`server/routes/admin-data.ts`):
   - `/api/download/trending_coins.csv`, `/api/download/generated_comments.csv`, `/api/download/post_submissions.csv`, and `/api/download/overall_report.csv` check active states and return empty headers/records if no active account is loaded.

---

## 📂 3. Database, Profile Sync & Modular Codebase Architecture

The application uses **Firestore / Realtime Database** (`ai-studio-coinmarketcapbot-6befefbd-71cd-4997-9a30-e9ebe7193378`) and **MongoDB Atlas** as its cloud backend. All profile settings, credentials, fetched coins, generated messages, and posting histories are synced bidirectionally between the cloud and the server container's local file systems.

### Modular Codebase Structure
- **Backend Entrypoint & Modules (`server.ts` & `server/`)**:
  - `server.ts`: Application entrypoint, route module imports, Vite/static middleware, and graceful shutdown.
  - `server/config.ts`: Environment setup, Express `app` instance, Playwright `chromium` resolution, and shared backend interfaces.
  - `server/state.ts`: Centralized mutable server state (`st` / `state`), active profile path management, process locks, logging, and Telegram alerts.
  - `server/sync.ts`: Atomic JSON file I/O, SHA-1 deduplicated cloud sync (`syncLocalFromCloudIfStale`), data pruning, and startup cloud hydration.
  - `server/browser.ts`: Playwright Chromium launcher (`launchBrowserResilient`) with per-profile proxy routing and resilient DOM interaction helpers.
  - `server/login.ts`: Automated CoinMarketCap email/password login, session verification (`checkLoginReal`), and OTP submission (`executeStartLogin`, `executeSubmitOtp`).
  - `server/posting.ts`: Single-coin Playwright comment submission and 4-point commit verification (`runRealPostingInternal`, `runRealPosting`).
  - `server/posting-loop.ts`: Batch posting queue loop (`runPostingLoop`), profile activation (`activateProfileInternal`), and continuous automation loop timers.
  - `server/fetch.ts`: Trending coins Playwright scraper (`fetchTrendingByScrape`), DEX URL resolver (`resolveToFirstPartyUrl`), and CMC Pro / CoinGecko fallback (`executeFetchTrending`).
  - `server/generate.ts`: OpenAI (`gpt-4o-mini`) and Gemini (`gemini-2.5-flash`) comment generation (`generateMessagesForCoins`, `executeGenerateMessages`).
  - `server/scheduler.ts`: 24/7 sequential multi-account scheduler engine (`runScheduledCycle`, `scheduleNextSchedulerCycle`).
  - `server/health.ts`: System diagnostics check (`runSystemDiagnosticsCheck`), marketing image validation/import helpers, admin auth tokens, and CSV field escaping.
  - `server/routes/`: Express route modules mounted in strict order (`output.ts`, `profiles.ts`, `status-health.ts`, `images.ts`, `login.ts`, `bot-actions.ts`, `admin-data.ts`, `scheduler.ts`).
- **Frontend Entrypoint & Modules (`src/`)**:
  - `src/App.tsx`: Root application component wiring `useAppController()` to the layout, pages, and modals.
  - `src/pages/`: Page views (`DashboardPage.tsx`, `DashboardControlPanel.tsx`, `DashboardDataExplorer.tsx`, `DashboardImageLibrary.tsx`, `SchedulerPage.tsx`, `AdminPage.tsx`, `LogsPage.tsx`, `HealthPage.tsx`, `GuidePage.tsx`).
  - `src/components/`: Shared UI components (`HeaderNavbar.tsx`, `AdminLoginGate.tsx`, `SessionAccountModal.tsx`, `ModalsLayer.tsx`, `CustomSelect.tsx`, `CycleCountdown.tsx`, `SafeImageDisplay.tsx`, `ErrorBoundary.tsx`).
  - `src/hooks/`: State controller and per-page polling hooks (`useAppController.ts`, `useDashboardPolling.ts`).
  - `src/api.ts`: Typed frontend API client with 30s timeout handling.
  - `src/types.ts` & `src/utils/`: Shared frontend types, `scheduler.ts`, `formatters.ts`, and `ui-helpers.ts`.

### Local vs. Cloud Directory Structure
- **Local Data Directory**: `/output`
  - `last_trending.json` (Stores currently loaded active coins list)
  - `generated_messages.json` (Stores generated commentary)
  - `results.json` (Stores successful/failed post-submission results)
  - `post_progress.json` (Maintains progress index in continuous loop)
- **Authentication State**: `/auth`
  - Maintains Playwright browser cookies, local Storage tokens, and session contexts.
- **Sync Engine**:
  - Whenever a profile is switched, updated, or checked, `syncLocalFromCloudIfStale()` (`server/sync.ts`) is triggered in the background to keep the active state fully synchronized.

---

## 🧠 4. LLM API Diagnostics & Telemetry

The frontend features a dedicated **System Health** page (`/health` in `src/pages/HealthPage.tsx`) that provides direct feedback on the credentials and services being used:
- **OpenAI Diagnostics**:
  - Checks if `OPENAI_API_KEY` is loaded.
  - If a quota error occurs, the server saves the detail into `st.lastOpenAiError`. The UI displays an alert with recommendations to top-up/upgrade.
- **Gemini Diagnostics**:
  - Serves as the primary backup if OpenAI fails or is missing.
  - If the Gemini API key is invalidated or compromised, the server catches the exception, updates `st.lastGeminiError`, and the UI renders an alert with troubleshooting guides.

---

## 🌐 6. Per-Account Proxy Architecture (Anti-Ban & IP Isolation)

To eliminate cross-account ban cascades caused by shared server IP addresses, the bot features native Playwright proxy routing:
- **Profile-Bound**: Each profile object in `PROFILES_FILE` and Firestore supports an optional `proxy` string (`http://user:pass@ip:port` or `socks5://ip:port`).
- **Native Browser Routing**: When `launchBrowserResilient()` (`server/browser.ts`) spins up a Chromium instance, it checks the active profile's `proxy` property (or `process.env.DEFAULT_PROXY`). If present, it passes `options.proxy = { server, username, password }` directly to Playwright without requiring external plugins.
- **Direct Connection Fallback**: If `proxy` is empty or omitted, Playwright connects directly using the standard network interface.
- **API & UI Controls**: 
  - `POST /api/save-profile` accepts `proxy` (`server/routes/profiles.ts`).
  - `POST /api/update-profile-proxy` allows instantaneous updating or clearing of an account's proxy from the UI without modifying session cookies.
  - The Account modal (`src/components/SessionAccountModal.tsx`) displays a purple `🌐 ip:port` badge on each account card and offers an inline `Edit Proxy` / `Add Proxy` form.

---

## 📜 7. Technical Requirements for Future Edits
- **Do NOT bypass Express static route overrides**: Static assets inside `/output/*` are intercepted server-side in `server/routes/output.ts` before `express.static` to apply profile-level permissions and security filters. Do not change this routing order.
- **Never expose private credentials to the client**: Always handle model configurations, API keys, and Chromium tasks server-side inside `server/` and `server.ts`.
- **Compile & Lint Verification**: Always run `npm run lint`, `npm test`, and `npm run build` after making modifications to ensure full compliance with the Vite + Node + CJS production bundle workflow.

Now you have the entire context! Treat these patterns as core design constraints and continue building with confidence!
