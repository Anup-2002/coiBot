# Modular Split Plan (`server.ts` & `src/App.tsx`)

> **Goal:** Split the large monolithic files (`server.ts` at 9,628 lines and `src/App.tsx` at 9,178 lines) into small, single-purpose modules without changing any URLs, API responses, UI text, styling, colours, layout, or runtime behaviour.

---

## 1. Current Baseline Metrics (Before Split)

### 1.1 Source Files
| File | Lines | Size (Bytes) | Role |
|---|---:|---:|---|
| `server.ts` | 9,628 | 403,848 | Monolithic Express server, Playwright automation, scheduler, LLM, and routes |
| `src/App.tsx` | 9,178 | 502,268 | Monolithic React UI containing all 6 pages, modals, state, and polling |
| `src/api.ts` | 630 | 19,966 | Typed frontend API client and `apiFetch` timeout wrapper |
| `src/utils/scheduler.ts` | 606 | 22,785 | Pure scheduler due-time, ordering, and peak-session calculations |
| `src/storage.ts` | 533 | 15,974 | Unified dual-cloud storage facade (Firebase RTDB + MongoDB fallback) |
| `src/firebase-db.ts` | 406 | 15,254 | Firebase Realtime Database adapter |
| `src/mongo-db.ts` | 365 | 13,237 | MongoDB Atlas adapter |
| `src/utils/formatters.ts` | 258 | 11,148 | Comment cashtag cleaning, CSV escaping, and cookie validation |
| `src/index.css` | 176 | 4,283 | Tailwind CSS v4 imports, animations, and unified dark scrollbar styles |
| `src/main.tsx` | 13 | 293 | React DOM root mounting `<App />` inside `<ErrorBoundary>` |
| `src/env.ts` | 4 | 68 | Dotenv preload initializer |
| **Total Source** | **21,797** | **1,009,124** | **11 source files** |

### 1.2 Built Production Bundles
| Built Artifact | Size (Bytes) | Size (KB) |
|---|---:|---:|
| `dist/server.cjs` | 425,931 | 415.95 KB |
| `dist/assets/index-Dzxy9cJF.js` | 307,052 | 299.86 KB |
| `dist/assets/vendor-react-SaLnwSRd.js` | 223,207 | 217.98 KB |
| `dist/assets/vendor-lucide-CQ1v-6HI.js` | 20,365 | 19.89 KB |
| `dist/assets/index-D5TaX_Xy.css` | 95,853 | 93.61 KB |

---

## 2. Current Sections Inside Large Files

### 2.1 `server.ts` (9,628 lines)
| Line Range | Lines | Section Description |
|---|---:|---|
| `1–168` | 168 | Environment bootstrap, Playwright browser path detection (`resolvePlaywrightBrowsersPath`), `chromium` loading, `OUTPUT_DIR`/`AUTH_DIR` initialization |
| `169–303` | 135 | `isProfileSessionActive`, static `/output/*` security interceptors (`/output/last_trending.json`, `/output/generated_messages.json`, `/output/results.json`, `/api/results`), and `express.static` mounts |
| `304–366` | 63 | Marketing image selection helpers (`getAvailableMarketingImages`, `getNextSingleMarketingImage`) and `getLocalBotSettings` / `saveLocalBotSettings` |
| `367–452` | 86 | Telegram HTML escaping and throttled emergency alert sender (`sendTelegramAlert`) |
| `453–849` | 397 | Profile schedule normalization, active profile path switching (`updateActiveProfilePaths`), timestamps, `readBotProgress` / `saveBotProgress`, and log buffers (`addLog`, `triggerLogSync`) |
| `850–956` | 107 | Data retention and auto-compaction (`pruneOldAndCompletedData`) |
| `957–1129` | 173 | Playwright installation (`installPlaywrightChromium`) and resilient Chromium launcher with per-profile proxy routing (`launchBrowserResilient`) |
| `1130–1438` | 309 | Core data interfaces (`Coin`, `GeneratedMessage`, `PostResult`, `LoginSession`), runtime state variables, process mutex locks (`acquireProcessLock`, `releaseProcessLock`), and continuous automation loop timers (`triggerFullFlowExecution`, `scheduleNextAutomationCycle`) |
| `1439–1885` | 447 | Browser DOM helpers (`saveDebugScreenshot`, `removeBlockingOverlays`, `clickResiliently`, `fillInputResiliently`, `typeWithHumanRhythm`, `locateAndPrepareCommentEditor`, `setupPageResourceBlocking`, `extractFingerprintDetails`, `isEditorPostButtonRequiringLogin`) |
| `1886–2921` | 1,036 | Automated CoinMarketCap login & OTP verification engine (`checkLoginRealInternal`, `checkLoginReal`, `executeStartLogin`, `executeSubmitOtp`, `executeCancelLogin`) |
| `2922–3777` | 856 | Real browser comment posting & 4-point commit verification engine (`runRealPostingInternal`, `resolveToFirstPartyUrl`, `runRealPosting`) |
| `3778–4135` | 358 | Atomic JSON file I/O, SHA-1 deduplicated cloud sync (`writeJsonFile`, `syncLocalFromCloudIfStale`, `autoSyncSessionToProfiles`) |
| `4136–4614` | 479 | Session & Profile CRUD routes (`/api/get-session`, `/api/save-session`, `/api/clear-session`, `/api/profiles`, `/api/save-profile`, `/api/update-profile-limit`, `/api/update-profile-proxy`, `/api/activate-profile`, `/api/delete-profile`) |
| `4615–4905` | 291 | `/api/health`, `/api/status`, and `/api/set-run-mode` routes |
| `4906–5448` | 543 | Marketing image management helpers (`pruneMarketingImages`, `isValidImageBuffer`, `importImagesFromExternalSources`) and routes (`/api/marketing-images/*`, `/api/settings/image-upload`) |
| `5449–5703` | 255 | `/api/set-continuous-loop` route and system/database/env diagnostic routes (`runSystemDiagnosticsCheck`, `/api/check-system`, `/api/check-mongo`, `/api/verify-env`) |
| `5704–6003` | 300 | Interactive login routes (`/api/check-login`, `/api/start-login`, `/api/submit-otp`, `/api/cancel-login`, `/api/reset-login-state`) and `/api/retry-single` |
| `6004–6608` | 605 | Trending coins scraper & API fetcher (`fetchTrendingByScrape`, `executeFetchTrending`) and OpenAI/Gemini comment generator (`generateMessagesForCoins`, `executeGenerateMessages`) |
| `6609–7531` | 923 | Batch posting loop (`runPostingLoop`) and core bot workflow routes (`/api/fetch-trending`, `/api/generate-messages`, `/api/fetch-and-generate-fresh`, `/api/post-chat`, `/api/stop-posting`, `/api/full-flow`) |
| `7532–8096` | 565 | Storage reset, queue reset, retention routes, admin password auth routes (`/api/auth/*`), `/api/profiles/verify-all`, `/api/logs`, and CSV export download routes (`/api/download/*.csv`) |
| `8097–9269` | 1,173 | Multi-account sequential scheduler engine (`updateProfileLastRun`, `updateProfileSchedule`, `scheduleNextSchedulerCycle`, `runScheduledCycle`) and `/api/scheduler/*` + `/api/profile-schedule` routes |
| `9270–9628` | 359 | Telegram settings/test routes (`/api/telegram/*`), startup cloud hydration (`synchronizeSessionsAndProfilesOnStartup`, `hydrateLocalFromCloud`), `startServer()`, SPA static fallback, and exports |

### 2.2 `src/App.tsx` (9,178 lines)
| Line Range | Lines | Section Description |
|---|---:|---|
| `1–65` | 65 | Lucide icon imports and API client imports |
| `66–104` | 39 | `ErrorBoundary` class component |
| `105–252` | 148 | Frontend data interfaces (`Coin`, `GeneratedMessage`, `PostResult`, `LogEntry`, `Profile`) |
| `253–354` | 102 | Fast O(1) array equality helpers (`areLogsEqual`, `areCoinsEqual`, etc.) and `formatTimeAgo` |
| `355–568` | 214 | `CycleCountdown` memoized component and `CustomSelect` portal-style dark dropdown component |
| `569–2939` | 2,371 | `App` state declarations, URL routing (`currentView`), admin auth handlers, scheduler handlers, marketing image handlers, per-page polling `useEffect` hooks, profile switching, and bot command runners |
| `2940–3090` | 151 | Company Admin Access login gate view (`!isAdminAuthenticated`) |
| `3091–3289` | 199 | Global hidden file input and sticky top `<header>` navigation bar |
| `3290–3753` | 464 | `currentView === "admin"` (`Admin Settings` page: Team Security, Telegram Alerts, Data & Queue Cleanup) |
| `3754–4517` | 764 | `currentView === "scheduler"` (`Multi-Account Auto-Scheduler` page) |
| `4518–4899` | 382 | `currentView === "guide"` (`Quick Start & Operations Guide` page) |
| `4900–5110` | 211 | `currentView === "logs"` (`Live Activity and Posting History` page) |
| `5111–5355` | 245 | `currentView === "health"` (`System Health` page) |
| `5356–6260` | 905 | Dashboard Row 1: 24/7 Scheduler Spotlight banner, `Control Center` card, and `Progress` card |
| `6261–7112` | 852 | Dashboard Row 2 (Tabs 1–4): `Campaign Data, Reports & Image Library` header, Trending Coins, Generated Comments, Post Submissions, and CSV Exports & Analytics |
| `7113–7764` | 652 | Dashboard Row 2 (Tab 5): `5. Images Library` upload, rotation, search, grid/list gallery, and pagination |
| `7765–7983` | 219 | External Images Import modal, Full Lightbox Preview modal, and `<footer />` |
| `7984–8665` | 682 | `showSessionModal` (`CoinMarketCap Accounts` 3-tab modal: Email Login, Import Cookies, Saved Accounts) |
| `8666–9178` | 513 | Confirmation modals (Fetch, Generate, Reset Queue, Data Retention, Account Switch, Stale Warning), Floating Toast notification, and `inlineConfirmModal` |

---

## 3. Target Folder Structure & File Responsibilities

### 3.1 Backend (`server/` + `server.ts`)
Every backend module will stay under 900 lines (most between 150 and 550 lines):
- **`server/config.ts`** (~160 lines): Environment setup, `resolvePlaywrightBrowsersPath`, Playwright `chromium` export, `PORT`, `isOpenAiConfigured`, `isCmcConfigured`, and initial writable `OUTPUT_DIR` / `AUTH_DIR` resolution.
- **`server/state.ts`** (~280 lines): Shared backend TypeScript interfaces (`Coin`, `GeneratedMessage`, `PostResult`, `LogEntry`, `ProfileTimestamps`, `BotProgressData`, `LoginSession`, `SystemProcessType`, `PostingLoopOptions`, `PostingLoopSummary`) and the single mutable `state` object containing all file paths, bot flags, locks, login state, scheduler state, log buffers, and caches.
- **`server/sync.ts`** (~480 lines): Local/cloud file I/O (`readJsonFile`, `writeJsonFileSyncAtomic`, `writeJsonFile`, `syncLocalFromCloudIfStale`, `autoSyncSessionToProfiles`), profile path switching (`updateActiveProfilePaths`, `getActiveProfileId`, `getActiveProfile`, `isProfileSessionActive`, `getIsolatedResults`, `activateProfileInternal`), settings & timestamps (`getLocalBotSettings`, `saveLocalBotSettings`, `getRealTimestamps`, `readBotProgress`, `saveBotProgress`), logging (`addLog`, `triggerLogSync`), Telegram notifications (`sendTelegramAlert`), process mutex locks (`acquireProcessLock`, `releaseProcessLock`, `isBusy`, `isSchedulerRunning`), data retention (`pruneOldAndCompletedData`), and startup cloud hydration (`synchronizeSessionsAndProfilesOnStartup`, `hydrateLocalFromCloud`).
- **`server/browser.ts`** (~470 lines): Playwright browser launcher (`installPlaywrightChromium`, `launchBrowserResilient`, `withTimeout`) and resilient DOM helpers (`saveDebugScreenshot`, `removeBlockingOverlays`, `clickResiliently`, `fillInputResiliently`, `typeWithHumanRhythm`, `locateAndPrepareCommentEditor`, `setupPageResourceBlocking`, `extractFingerprintDetails`, `isEditorPostButtonRequiringLogin`).
- **`server/login.ts`** (~860 lines): CoinMarketCap browser authentication and OTP flow (`checkLoginRealInternal`, `checkLoginReal`, `executeStartLogin`, `executeSubmitOtp`, `executeCancelLogin`). *Note: Kept together in one module (~860 lines, well under the 1,000-line ceiling) because `executeStartLogin` and `executeSubmitOtp` share the live Playwright page and OTP modal recovery steps.*
- **`server/posting.ts`** (~860 lines): Single-coin Playwright comment submission and 4-point commit verification (`runRealPostingInternal`, `resolveToFirstPartyUrl`, `runRealPosting`). *Note: Kept together (~860 lines, under 1,000 lines) because `runRealPostingInternal` is a single linear Playwright page workflow.*
- **`server/posting-loop.ts`** (~580 lines): Batch posting loop (`runPostingLoop`), continuous automation cycle timers (`cancelNextAutomationCycle`, `scheduleNextAutomationCycle`, `triggerFullFlowExecution`), and marketing image rotation/import helpers (`getAvailableMarketingImages`, `getNextSingleMarketingImage`, `pruneMarketingImages`, `isValidImageBuffer`, `importImagesFromExternalSources`).
- **`server/fetch.ts`** (~310 lines): Trending coins scraping and CoinMarketCap/CoinGecko fallback (`fetchTrendingByScrape`, `executeFetchTrending`).
- **`server/generate.ts`** (~310 lines): OpenAI `gpt-4o-mini` and Gemini fallback comment generation (`generateMessagesForCoins`, `executeGenerateMessages`, `formatCommentWithCashtag`).
- **`server/scheduler.ts`** (~720 lines): Multi-account sequential scheduler engine (`updateProfileLastRun`, `updateProfileSchedule`, `cancelNextSchedulerCycle`, `scheduleNextSchedulerCycle`, `runScheduledCycle`).
- **`server/health.ts`** (~240 lines): System diagnostics runner (`runSystemDiagnosticsCheck`), admin session token helpers (`generateAdminToken`, `verifyAdminRequest`), and health status builder (`buildHealthResponse`).
- **`server/routes/output.ts`** (~110 lines): Security-intercepted `/output/last_trending.json`, `/output/generated_messages.json`, `/output/results.json`, `/api/results` routes + `express.static` mounts for `/output` and `/uploads/marketing_images`.
- **`server/routes/profiles.ts`** (~450 lines): Session and profile management routes (`/api/get-session`, `/api/save-session`, `/api/clear-session`, `/api/profiles`, `/api/save-profile`, `/api/update-profile-limit`, `/api/update-profile-proxy`, `/api/activate-profile`, `/api/delete-profile`, `/api/profiles/verify-all`).
- **`server/routes/status-health.ts`** (~360 lines): `/api/health`, `/api/status`, `/api/set-run-mode`, `/api/check-system`, `/api/check-mongo`, `/api/verify-env`, `/api/logs`.
- **`server/routes/images.ts`** (~310 lines): `/api/marketing-images/*` and `/api/settings/image-upload` routes.
- **`server/routes/login.ts`** (~200 lines): `/api/check-login`, `/api/start-login`, `/api/submit-otp`, `/api/cancel-login`, `/api/reset-login-state`.
- **`server/routes/bot-actions.ts`** (~490 lines): `/api/set-continuous-loop`, `/api/retry-single`, `/api/fetch-trending`, `/api/generate-messages`, `/api/fetch-and-generate-fresh`, `/api/post-chat`, `/api/stop-posting`, `/api/full-flow`.
- **`server/routes/admin-data.ts`** (~390 lines): `/api/clear-all`, `/api/queue/reset-daily`, `/api/data/prune`, `/api/data/retention-stats`, `/api/settings/data-retention`, `/api/download/*.csv`, `/api/auth/*`, `/api/settings/target-coins`, `/api/telegram/*`.
- **`server/routes/scheduler.ts`** (~460 lines): `/api/scheduler/*` and `/api/profile-schedule` routes.
- **`server.ts`** (~130 lines): Express app creation, route registration in exact original order, `startServer()`, graceful shutdown, and `{ app, startServer, formatCommentWithCashtag }` exports.

### 3.2 Frontend (`src/`)
Every frontend module will stay under 950 lines (most between 60 and 750 lines):
- **`src/types.ts`** (~170 lines): Shared interfaces (`Coin`, `GeneratedMessage`, `PostResult`, `LogEntry`, `Profile`, `CustomSelectOption`, `AppView`).
- **`src/utils/ui-helpers.ts`** (~110 lines): `areLogsEqual`, `areCoinsEqual`, `areMessagesEqual`, `areResultsEqual`, `areProfilesEqual`, `formatTimeAgo`.
- **`src/components/ErrorBoundary.tsx`** (~60 lines): `ErrorBoundary` class component.
- **`src/components/CycleCountdown.tsx`** (~55 lines): `CycleCountdown` memoized countdown timer.
- **`src/components/CustomSelect.tsx`** (~190 lines): `CustomSelect` portal-style dark dropdown menu.
- **`src/components/HeaderNavbar.tsx`** (~210 lines): Top sticky `<header>` navigation bar.
- **`src/components/AdminLoginGate.tsx`** (~165 lines): Company Admin Access login gate screen.
- **`src/components/SessionAccountModal.tsx`** (~690 lines): `CoinMarketCap Accounts` 3-tab modal (`showSessionModal`).
- **`src/components/ModalsLayer.tsx`** (~620 lines): All confirmation modals, external image import modal, full lightbox preview modal, floating toast notification, and inline confirm modal.
- **`src/pages/AdminPage.tsx`** (~470 lines): `/admin` (`Admin Settings` page).
- **`src/pages/SchedulerPage.tsx`** (~770 lines): `/scheduler` (`Multi-Account Auto-Scheduler` page).
- **`src/pages/GuidePage.tsx`** (~390 lines): `/guide` (`Quick Start & Operations Guide` page).
- **`src/pages/LogsPage.tsx`** (~220 lines): `/logs` (`Live Activity and Posting History` page).
- **`src/pages/HealthPage.tsx`** (~250 lines): `/health` (`System Health` page).
- **`src/pages/DashboardControlPanel.tsx`** (~900 lines): Dashboard Scheduler Spotlight banner + `Control Center` + `Progress` card.
- **`src/pages/DashboardDataExplorer.tsx`** (~860 lines): Dashboard `Campaign Data, Reports & Image Library` card (Tabs 1–4: Trending Coins, Generated Comments, Post Submissions, CSV & Analytics).
- **`src/pages/DashboardImageLibrary.tsx`** (~660 lines): Dashboard Tab 5 (`5. Images Library`).
- **`src/pages/DashboardPage.tsx`** (~80 lines): Dashboard `<main key="view-dashboard">` container composing `DashboardControlPanel`, `DashboardDataExplorer`, and `DashboardImageLibrary`.
- **`src/hooks/useDashboardPolling.ts`** (~360 lines): Polling `useEffect` hooks (header 30s poll, dashboard 3s poll, scheduler 3s poll, logs 3s poll, health 10s poll, system check auto-run, lazy tab loading, lightbox keyboard shortcuts, terminal auto-scroll, simulator typing effect).
- **`src/hooks/useAppController.ts`** (~900 lines): Central state & action handlers hook calling `useDashboardPolling` and returning the complete controller object consumed by `<App />` and page/modal components.
- **`src/App.tsx`** (~120 lines): Thin root shell wiring `useAppController()` to `AdminLoginGate`, `HeaderNavbar`, the active page view, footer, `SessionAccountModal`, and `ModalsLayer`, plus re-exporting `ErrorBoundary`.

---

## 4. Order of Moves (Smallest & Safest First, 1 Commit Per Move)

1. **Move 1 (Frontend Shared Types, UI Helpers & Standalone Components):**
   - Extract `src/types.ts`, `src/utils/ui-helpers.ts`, `src/components/ErrorBoundary.tsx`, `src/components/CycleCountdown.tsx`, and `src/components/CustomSelect.tsx` from `src/App.tsx`.
   - Verify `npm run lint`, `npm test`, `npm run build` and commit.
2. **Move 2 (Frontend Standalone Pages — Admin, Scheduler, Guide, Logs, Health):**
   - Extract `src/pages/AdminPage.tsx`, `src/pages/SchedulerPage.tsx`, `src/pages/GuidePage.tsx`, `src/pages/LogsPage.tsx`, and `src/pages/HealthPage.tsx` from `src/App.tsx`.
   - Verify `npm run lint`, `npm test`, `npm run build` and commit.
3. **Move 3 (Frontend Dashboard Sections & Page):**
   - Extract `src/pages/DashboardControlPanel.tsx`, `src/pages/DashboardDataExplorer.tsx`, `src/pages/DashboardImageLibrary.tsx`, and `src/pages/DashboardPage.tsx` from `src/App.tsx`.
   - Verify `npm run lint`, `npm test`, `npm run build` and commit.
4. **Move 4 (Frontend Header, Admin Gate & Modals):**
   - Extract `src/components/AdminLoginGate.tsx`, `src/components/HeaderNavbar.tsx`, `src/components/SessionAccountModal.tsx`, and `src/components/ModalsLayer.tsx` from `src/App.tsx`.
   - Verify `npm run lint`, `npm test`, `npm run build` and commit.
5. **Move 5 (Frontend State & Polling Hooks — `useDashboardPolling` & `useAppController`):**
   - Extract `src/hooks/useDashboardPolling.ts` and `src/hooks/useAppController.ts`, reducing `src/App.tsx` to a clean ~120-line root component.
   - Verify `npm run lint`, `npm test`, `npm run build` and commit.
6. **Move 6 (Backend Config, Shared State & Sync Layer):**
   - Extract `server/config.ts`, `server/state.ts`, and `server/sync.ts` from `server.ts`.
   - Verify `npm run lint`, `npm test`, `npm run build` and commit.
7. **Move 7 (Backend Browser Helpers, Fetch, Generate & Health):**
   - Extract `server/browser.ts`, `server/fetch.ts`, `server/generate.ts`, and `server/health.ts` from `server.ts`.
   - Verify `npm run lint`, `npm test`, `npm run build` and commit.
8. **Move 8 (Backend Login, Posting, Posting Loop & Scheduler Engines):**
   - Extract `server/login.ts`, `server/posting.ts`, `server/posting-loop.ts`, and `server/scheduler.ts` from `server.ts`.
   - Verify `npm run lint`, `npm test`, `npm run build` and commit.
9. **Move 9 (Backend Express Routes & Final `server.ts` Shell):**
   - Extract `server/routes/output.ts`, `server/routes/profiles.ts`, `server/routes/status-health.ts`, `server/routes/images.ts`, `server/routes/login.ts`, `server/routes/bot-actions.ts`, `server/routes/admin-data.ts`, and `server/routes/scheduler.ts`, reducing `server.ts` to a ~130-line entrypoint.
   - Verify `npm run lint`, `npm test`, `npm run build` and commit.

---

## 5. Risks & Mitigations

1. **Shared Mutable Server State:**
   - *Risk:* ES module `export let botStatus` creates read-only live bindings that cannot be reassigned by importing modules.
   - *Mitigation:* All mutable server state properties (`state.botStatus`, `state.isPostingRunning`, `state.OUTPUT_DIR`, `state.LAST_TRENDING_FILE`, etc.) live on a single exported `state` object in `server/state.ts`. Every module reads and mutates properties on `state` directly so all modules always see the exact same live values.
2. **Circular Imports:**
   - *Risk:* `posting-loop.ts`, `scheduler.ts`, `fetch.ts`, and `generate.ts` call one another (`triggerFullFlowExecution` calls `executeFetchTrending`, `executeGenerateMessages`, and `runPostingLoop`; `runScheduledCycle` calls `executeFetchTrending`, `generateMessagesForCoins`, and `runPostingLoop`).
   - *Mitigation:* Strict bottom-up dependency DAG:
     - Layer 0: `server/config.ts`, `server/state.ts` (depend on nothing in `server/`)
     - Layer 1: `server/sync.ts`, `server/browser.ts`, `server/health.ts` (depend only on Layer 0 + `src/storage.ts` / `src/utils/*`)
     - Layer 2: `server/login.ts`, `server/posting.ts`, `server/fetch.ts`, `server/generate.ts` (depend on Layers 0–1)
     - Layer 3: `server/posting-loop.ts` (depends on Layers 0–2)
     - Layer 4: `server/scheduler.ts` (depends on Layers 0–3)
     - Layer 5: `server/routes/*` (depend on Layers 0–4)
     - Layer 6: `server.ts` (mounts `server/routes/*`)
3. **Express Route Order & Static `/output/*` Interception:**
   - *Risk:* If `express.static(OUTPUT_DIR)` is mounted before `app.get("/output/last_trending.json", ...)`, inactive profiles could leak data from disk.
   - *Mitigation:* `registerOutputRoutes(app)` in `server/routes/output.ts` is mounted **first** right after `app.use(express.json({ limit: "50mb" }))`, registering `/output/last_trending.json`, `/output/generated_messages.json`, `/output/results.json`, and `/api/results` strictly before `app.use("/output", (req, res, next) => express.static(state.OUTPUT_DIR)(req, res, next))`.
4. **Potentially Unused / Legacy Code Noted (Kept Intact Per Rules):**
   - `handleUpdateSchedulerInterval` (`src/hooks/useAppController.ts`) and `handleMoveAccountOrder` (`src/hooks/useAppController.ts`) are alias references to `handleSaveInterval` and `handleMoveAccount`. Kept intact.
   - `formatCommentWithCashtag` (`server/generate.ts`) is defined in addition to `src/utils/formatters.ts`. Kept and re-exported from `server.ts` for compatibility.

---

## 6. Files Over 1,000 Lines (Noted Per Plan Constraint)

Out of 51 total source files, 49 files are under 1,000 lines (`server.ts` is 131 lines; `src/App.tsx` is 42 lines). Only 2 files exceed 1,000 lines for the following technical reasons:
1. **`server/login.ts` (1,055 lines):** Contains `checkLoginRealInternal`, `checkLoginReal`, `executeStartLogin`, `executeSubmitOtp`, and `executeCancelLogin`. Kept unified because `executeStartLogin` and `executeSubmitOtp` operate on the same live Playwright `st.activeLoginSession` page/context and share modal/OTP DOM recovery state.
2. **`src/hooks/useAppController.ts` (1,909 lines):** Contains the React `useState`/`useRef` declarations and action handlers for `<App />`. Kept unified in a single controller hook so that 80+ local state variables and setters are minified in one closure scope without an extra intermediate object wrapper—keeping `dist/assets/index-*.js` within `+0.93%` (`< 1%`) of the baseline bundle size.


