# Project Structure & Codebase Navigation Guide (`coiBot`)

This document is the primary architectural map and quick-lookup guide for developers and AI coding assistants working on the **CoinMarketCap Trending & Automated Posting Bot**.

---

## 1. Quick Navigation ("Where to Find What")

| If you want to modify or debug... | Go to these files |
| :--- | :--- |
| **Main Dashboard UI** (3-step workflow, data tabs, image library) | `src/pages/DashboardPage.tsx`, `src/pages/DashboardControlPanel.tsx`, `src/pages/DashboardDataExplorer.tsx`, `src/pages/DashboardImageLibrary.tsx` |
| **24/7 Multi-Account Scheduler UI** | `src/pages/SchedulerPage.tsx`, `src/components/CycleCountdown.tsx` |
| **System Health, Admin Settings, Logs, or Guide UI** | `src/pages/HealthPage.tsx`, `src/pages/AdminPage.tsx`, `src/pages/LogsPage.tsx`, `src/pages/GuidePage.tsx` |
| **Top Navbar, Account Switcher, or Account Login Modal** | `src/components/HeaderNavbar.tsx`, `src/components/SessionAccountModal.tsx`, `src/components/ModalsLayer.tsx` |
| **Frontend State, Actions, or Background Polling** | `src/hooks/useAppController.ts`, `src/hooks/useDashboardPolling.ts`, `src/api.ts` |
| **Trending Coin Scraping & CMC/CoinGecko Fallbacks** | `server/fetch.ts`, `server/routes/bot-actions.ts` |
| **AI Comment Generation (OpenAI `gpt-4o-mini` & Gemini `gemini-2.5-flash`)** | `server/generate.ts`, `src/utils/formatters.ts` |
| **Playwright Browser Launching & Per-Account Proxies** | `server/browser.ts`, `server/config.ts` |
| **Automated CoinMarketCap Login & 2FA/OTP Verification** | `server/login.ts`, `server/routes/login.ts` |
| **Playwright Comment Posting & 4-Point Commit Verification** | `server/posting.ts`, `server/posting-loop.ts` |
| **24/7 Sequential Multi-Account Scheduler Engine** | `server/scheduler.ts`, `src/utils/scheduler.ts`, `server/routes/scheduler.ts` |
| **Account Profiles, Cookie Validation & Per-Profile Isolation** | `server/profiles.ts`, `server/routes/profiles.ts`, `server/routes/output.ts` |
| **Cloud Sync (Firebase RTDB + MongoDB Atlas Fallback)** | `server/sync.ts`, `server/files.ts`, `src/storage.ts`, `src/firebase-db.ts`, `src/mongo-db.ts` |
| **Server State, Process Locks, Logging & Telegram Alerts** | `server/state.ts`, `server/locks.ts`, `server/logger.ts`, `server/alerts.ts`, `server/settings.ts` |
| **System Diagnostics, Image Validation & Admin Auth** | `server/health.ts`, `server/routes/status-health.ts`, `server/routes/images.ts`, `server/routes/admin-data.ts` |

---

## 2. Complete Directory Tree

```text
coiBot/
├── server.ts                         # Backend entrypoint (Line 1: import "./src/env", route registration, "*" fallback, startServer)
├── index.html                        # Vite HTML shell
├── package.json                      # NPM scripts, dependencies, and build commands
├── tsconfig.json                     # TypeScript configuration
├── vite.config.ts                    # Vite 6 + Tailwind CSS v4 + React 19 bundler config
│
├── PROJECT_STRUCTURE.md              # This file: architecture & navigation map for developers and AI agents
├── AGENTS.md                         # Core AI agent rules, invariants, and architectural guardrails
├── GEMINI.md                         # Quick developer invariants & local server requirements
├── AI_CONTEXT.md                     # Chronological engineering log and session history
├── README.md                         # Setup, deployment, Nginx, PM2, and proxy configuration guide
│
├── server/                           # Modular Express + Playwright backend (25 modules)
│   ├── config.ts                     # Layer 0: Env setup, PLAYWRIGHT_BROWSERS_PATH, chromium load, Express app, shared types
│   ├── state.ts                      # Layer 0: Centralized mutable `st` (`state`) object (all flags, timers, buffers, caches)
│   ├── logger.ts                     # Layer 1: Log ring-buffer (`addLog`), `getActiveProfileId`, debounced cloud log sync
│   ├── files.ts                      # Layer 1: Atomic JSON I/O (`readJsonFile`, `writeJsonFile`) & SHA-1 deduplicated cloud writes
│   ├── profiles.ts                   # Layer 2: Cookie validation, profile path isolation (`updateActiveProfilePaths`), activation
│   ├── settings.ts                   # Layer 2: Bot settings (`getLocalBotSettings`), timestamps, progress, image rotation
│   ├── locks.ts                      # Layer 2: Process mutex locks (`acquireProcessLock`), `isBusy`, `isSchedulerRunning`
│   ├── alerts.ts                     # Layer 2: Throttled Telegram HTML alert dispatcher (`sendTelegramAlert`)
│   ├── sync.ts                       # Layer 3: Cloud-to-local staleness sync, startup cloud hydration, data retention pruning
│   ├── browser.ts                    # Layer 3: Resilient Chromium launcher with per-profile proxy routing & DOM helpers
│   ├── health.ts                     # Layer 3: System diagnostics (`runSystemDiagnosticsCheck`), image import/pruning, admin auth
│   ├── login.ts                      # Layer 4: Automated CMC email/password login, session check (`checkLoginReal`), OTP flow
│   ├── posting.ts                    # Layer 4: Single-coin Playwright comment submission & 4-point commit verification
│   ├── fetch.ts                      # Layer 4: Trending coins Playwright scraper, DEX URL resolver, CMC/CoinGecko API fallbacks
│   ├── generate.ts                   # Layer 4: OpenAI (`gpt-4o-mini`) & Gemini (`gemini-2.5-flash`) comment generation
│   ├── posting-loop.ts               # Layer 5: Batch posting queue loop (`runPostingLoop`) & continuous automation cycle timers
│   ├── scheduler.ts                  # Layer 5: 24/7 sequential multi-account scheduler engine (`runScheduledCycle`)
│   └── routes/                       # Layer 6: Express route modules (imported in strict order by server.ts)
│       ├── output.ts                 # 1. Security-guarded `/output/*.json` interceptors & `express.static(OUTPUT_DIR)`
│       ├── profiles.ts               # 2. Session & account profile CRUD (`/api/profiles`, `/api/activate-profile`, proxies)
│       ├── status-health.ts          # 3. `/api/health`, `/api/status`, `/api/check-system`, `/api/check-mongo`, `/api/verify-env`
│       ├── images.ts                 # 4. `/api/marketing-images/*`, `/api/settings/image-upload`, `/api/set-continuous-loop`
│       ├── login.ts                  # 5. `/api/check-login`, `/api/start-login`, `/api/submit-otp`, `/api/cancel-login`
│       ├── bot-actions.ts            # 6. `/api/fetch-trending`, `/api/generate-messages`, `/api/post-chat`, `/api/full-flow`
│       ├── admin-data.ts             # 7. `/api/clear-all`, `/api/data/*`, `/api/download/*.csv`, `/api/auth/*`, `/api/logs`
│       └── scheduler.ts              # 8. `/api/scheduler/*`, `/api/profile-schedule`, `/api/telegram/*`
│
├── src/                              # Modular React 19 frontend + shared utilities (31 files)
│   ├── main.tsx                      # React DOM entry mounting `<App />` inside `<ErrorBoundary>`
│   ├── App.tsx                       # Root layout shell wiring `useAppController()` to pages, header, and modals
│   ├── index.css                     # Tailwind CSS v4 theme, animations, and custom scrollbar styles
│   ├── api.ts                        # Typed frontend HTTP client with 30s timeout handling
│   ├── types.ts                      # Shared frontend TypeScript interfaces (`Coin`, `GeneratedMessage`, `PostResult`, `Profile`)
│   ├── env.ts                        # Dotenv preload initializer (imported first by `server.ts`)
│   ├── storage.ts                    # Dual-cloud storage facade (Firebase RTDB primary + MongoDB Atlas fallback)
│   ├── firebase-db.ts                # Firebase Realtime Database client adapter
│   ├── mongo-db.ts                   # MongoDB Atlas client adapter
│   ├── pages/                        # Route page views
│   │   ├── DashboardPage.tsx         # `/` — Main Dashboard container composing the 3 dashboard sections below
│   │   ├── DashboardControlPanel.tsx # Dashboard Row 1: Scheduler Spotlight banner, Control Center, and Progress card
│   │   ├── DashboardDataExplorer.tsx # Dashboard Row 2 (Tabs 1–4): Coins, Comments, Submissions, and CSV Exports
│   │   ├── DashboardImageLibrary.tsx # Dashboard Row 2 (Tab 5): Marketing Image Library upload, rotation, and gallery
│   │   ├── SchedulerPage.tsx         # `/scheduler` — 24/7 Multi-Account Auto-Scheduler configuration & queue controls
│   │   ├── AdminPage.tsx             # `/admin` — Admin Settings (Team Security, Telegram Alerts, Data & Queue Cleanup)
│   │   ├── LogsPage.tsx              # `/logs` — Live Activity Logs & Scheduler Logs console with download
│   │   ├── HealthPage.tsx            # `/health` — System Health status cards & alert toggle
│   │   └── GuidePage.tsx             # `/guide` — Quick Start & Operations Guide for marketing teams
│   ├── components/                   # Shared UI components & modals
│   │   ├── HeaderNavbar.tsx          # Top navigation bar (Account selector, `Accounts` button, Admin gear, page links)
│   │   ├── SessionAccountModal.tsx   # 3-tab Account Manager modal (Email Login, Import Cookies, Switch Accounts)
│   │   ├── ModalsLayer.tsx           # Confirmation dialogs, External Image Import modal, Lightbox, and Toast notifications
│   │   ├── AdminLoginGate.tsx        # Password authentication screen for protected Admin access
│   │   ├── CustomSelect.tsx          # Portal-based dark dropdown select component
│   │   ├── CycleCountdown.tsx        # Memoized live countdown badge for scheduled cycles
│   │   ├── SafeImageDisplay.tsx      # Resilient image preview component with error fallback
│   │   └── ErrorBoundary.tsx         # React crash recovery boundary
│   ├── hooks/                        # React state & polling hooks
│   │   ├── useAppController.ts       # Central state & action handlers controller consumed by `<App />`
│   │   └── useDashboardPolling.ts    # Per-page background polling & UI synchronization effects
│   └── utils/                        # Pure shared helper utilities
│       ├── scheduler.ts              # Pure scheduler due-time (`isDue`), ordering (`orderDueAccounts`), and peak session logic
│       ├── formatters.ts             # Anti-spam comment sanitizer, cashtag formatter, CSV escaping, cookie helpers
│       └── ui-helpers.ts             # O(1) array equality comparators (`areLogsEqual`, `areCoinsEqual`, etc.) & `formatTimeAgo`
│
├── tests/                            # Vitest unit & integration test suites (`npm test`)
│   ├── routes.test.ts                # Supertest API route tests, route registration order, test isolation, `/api/check-system`
│   ├── scheduler.test.ts             # Sequential multi-account scheduler unit tests
│   ├── formatters.test.ts            # Comment sanitization, cashtag, CSV, and cookie helper tests
│   ├── daily-limit.test.ts           # Per-account daily post limit & rollover tests
│   └── api.test.ts                   # Frontend API client contract tests
│
├── docs/                             # Architecture plans & deployment documentation
│   ├── MODULAR_SPLIT_PLAN.md         # Detailed modular split architecture, dependency DAG, and verification plan
│   ├── ISOLATED_DEPLOYMENT_GUIDE.md  # Guide for running isolated container/server deployments
│   ├── OPTIMIZATION_AND_AWS_GUIDE.md # AWS EC2, memory tuning, and Playwright optimization guide
│   ├── REDEPLOY.md                   # Step-by-step production redeployment runbook
│   └── FUTURE_IMPLEMENTATION_PLAN.md # Roadmap and planned enhancements
│
├── scripts/                          # Build, validation, and operational scripts
│   ├── build-with-notify.cjs         # Production build wrapper (`vite build` + `esbuild dist/server.cjs`)
│   ├── login-local.js                # Local GUI Playwright login helper (`npm run login`)
│   ├── smoke.ts                      # Quick smoke test runner (`npm run smoke`)
│   ├── e2e-validate.ts               # End-to-end validation script (`npm run test:e2e`)
│   ├── test-cloud.ts                 # Cloud database connectivity verification script
│   ├── telegram-notify.cjs           # Deployment/build Telegram notification helper
│   ├── setup-ec2.sh                  # Ubuntu/EC2 environment provisioning script
│   └── deploy-isolated.sh            # Isolated deployment automation script
│
├── public/                           # Static public assets copied to `dist/`
│   ├── favicon.svg                   # Application icon
│   └── uploads/marketing_images/     # Default marketing images bundled with the app
│
├── auth/                             # Local runtime authentication & settings storage (git-ignored)
│   ├── profiles.json                 # Saved CoinMarketCap account profiles, cookies, proxies, and schedules
│   ├── state.json                    # Active profile's Playwright storageState cookies
│   └── settings.json                 # Bot & scheduler settings
│
└── output/                           # Local runtime bot output storage (git-ignored, profile-isolated)
    ├── <profile-id>/                 # Isolated per-account directory (`last_trending.json`, `generated_messages.json`, `results.json`, `post_progress.json`, `timestamps.json`)
    ├── marketing_images/             # Uploaded marketing images pool
    └── scheduler.log                 # Persistent chronological log of 24/7 scheduler runs
```

---

## 3. Backend Dependency Layers (Zero Circular Imports)

All backend files under `server/` follow a strict bottom-up hierarchy verified by `npx madge --circular --extensions ts server.ts`:

1. **Layer 0 (`server/config.ts` → `server/state.ts`)**: Environment variables, Playwright path resolution, Express `app` instance, shared types, and the single mutable `st` (`state`) object.
2. **Layer 1 (`server/logger.ts` → `server/files.ts`)**: Bottom-level logging (`addLog`, `getActiveProfileId`) and atomic JSON file I/O (`readJsonFile`, `writeJsonFile`).
3. **Layer 2 (`server/profiles.ts` → `server/settings.ts` → `server/locks.ts`, `server/alerts.ts`)**: Profile path isolation, bot settings, process mutex locks, and Telegram alerts.
4. **Layer 3 (`server/sync.ts`, `server/browser.ts` → `server/health.ts`)**: Cloud synchronization, Playwright Chromium launcher, and system health diagnostics.
5. **Layer 4 (`server/login.ts`, `server/posting.ts`, `server/fetch.ts`, `server/generate.ts`)**: Core automation and AI generation engines.
6. **Layer 5 (`server/posting-loop.ts` → `server/scheduler.ts`)**: Continuous batch posting loop and 24/7 sequential multi-account scheduler.
7. **Layer 6 (`server/routes/*.ts` → `server.ts`)**: Express route handlers and server entrypoint.

---

## 4. Essential Commands

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start live development server with Vite HMR on `http://localhost:3000` |
| `npm run lint` | Run TypeScript typechecker (`tsc --noEmit`) |
| `npm test` | Run Vitest unit & route integration tests (`38` tests across `5` suites) |
| `npm run build` | Build production frontend (`dist/assets/*`) and server bundle (`dist/server.cjs`) |
| `npx madge --circular --extensions ts server.ts` | Verify zero circular dependencies across backend modules |

