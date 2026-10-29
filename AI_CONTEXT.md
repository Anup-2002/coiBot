# AI_CONTEXT.md — Central AI Assistant Handoff & Project State

> **MANDATORY WORKFLOW RULE:**
> 1. **Read First:** Every AI coding assistant MUST read this file at the start of a session before inspecting or modifying code.
> 2. **Single Source of Truth:** Do not create separate summary or handoff markdown files. Update this file (`AI_CONTEXT.md`) after every significant change and before ending any session.
> 3. **Verify Everything:** Never mark a task as completed unless `npm run lint`, `npm test`, and `npm run build` have been executed and verified.
> 4. **Always Keep Local Live Server Running with Real `.env`:** Always ensure the local server (`npm run dev` on `http://localhost:3000`) is running as a background daemon (`IsDaemon: true`) with all real `.env` credentials active (OpenAI, CoinMarketCap, Firebase RTDB, MongoDB Atlas, Playwright Chromium). Whenever a build or code change finishes—or if the server stops for any reason—immediately restart `npm run dev` and verify `http://localhost:3000/api/health` returns `"overall": "ok"`.

---

## 1. Repository & Branch Status

- **Repository URL:** `https://github.com/Anup-2002/coiBot.git`
- **Active Working Branch:** `staging` (tracks `origin/staging`)
- **Production Branch:** `main` (protected — do **NOT** test or commit directly on `main`; all changes happen on `staging` first)
- **Recent Commits on `staging`:**
  - `5b0d388` — `feat: isolate scheduler cycle fetch/partitions across accounts and persist scheduler logs`
  - `87d289b` — `docs: update AI_CONTEXT.md with process-lock safeguards and 1-click scheduler controls`
  - `04ac4e1` — `feat: lock Reset Storage during active processes, upgrade sequential scheduler & auto-loop controls, and polish zero-lag button transitions`
  - `2fbb78e` — `docs: update AI_CONTEXT.md with post verification and UI polish summary`
  - `9b034d4` — `feat: enforce real post verification, fix fake batch completion metrics, and polish UI transitions and image upload controls`
  - `87b2176` — `feat: open Automated Login (New) tab first when adding accounts and unify cookie import`
  - `047e741` — `feat: deep-clean UI modules, remove all duplicate sections/buttons, and isolate admin tabs`
  - `a2124e9` — `docs: enforce mandatory auto-start of live server on localhost:3000 in GEMINI.md`
  - `5f4aff7` — `docs: update AI_CONTEXT.md with UI placement and beginner guide verification`
  - `88e7626` — `feat: refine UI placement, remove duplicate sections, and upgrade beginner-friendly /guide`
  - `fbec426` — `fix: verify Playwright Chromium binary via headless launch on Windows`
  - `b4bf1c5` — `docs: create central AI_CONTEXT.md handoff file`
  - `204c38c` — `feat: add aria-label and title to all icon-only buttons (Step 7)`
  - `6b51a28` — `perf: deduplicate session/profile cloud saves and eliminate idle DB calls (Step 6)`
  - `0529bf9` — `feat: update header items and /health chips and messages (Step 3)`
  - `2a4b251` — `feat: fetch logs only on /logs and load scheduler logs from /api/scheduler/logs (Step 2)`
  - `f54f807` — `feat: finish text size scaling and fix lint errors (Step 1)`
  - `e817645` — `refactor: enhance app robustness and stability` (base commit from `main`)

---

## 2. Project Architecture & Core Files

- **`server.ts`**: Full-stack Node.js + Express backend, Playwright Chromium browser automation engine, multi-account sequential scheduler, REST endpoints (`/api/*`), static `/output/*` interception with profile isolation, and cloud synchronization.
- **`src/App.tsx`**: Single-file React 19 UI containing all views (`dashboard`, `scheduler`, `admin`, `logs`, `health`, `guide`), inline modals, `ErrorBoundary`, and state management.
  - **Strict Constraint:** Do NOT split `src/App.tsx` into `src/pages/` or `src/components/`. Keep components inline in `src/App.tsx`.
- **`src/api.ts`**: Typed frontend API client (`api` object + `apiFetch` wrapper with 30-second `AbortController` timeout). All network calls in `src/App.tsx` go through `src/api.ts` (zero raw `fetch()` calls in `src/App.tsx`).
- **`src/main.tsx`**: React entry point wrapping `<App />` inside `<ErrorBoundary>`.
- **`src/storage.ts` / `src/firebase-db.ts` / `src/mongo-db.ts`**: Dual-cloud persistence layer (Firebase Realtime Database primary + MongoDB Atlas fallback) synced with local `/output` and `/auth` directories.
- **`src/utils/scheduler.ts` & `src/utils/formatters.ts`**: Scheduler due-time calculations, peak trading windows, and anti-spam comment formatting.
- **`tests/`**: Vitest unit and route integration tests (`tests/routes.test.ts`, `tests/scheduler.test.ts`, `tests/daily-limit.test.ts`, `tests/formatters.test.ts`, `tests/api.test.ts`).

---

## 3. Environment & Critical Runtime Notes

- **`.env` Configuration**:
  - `.env` sets `PORT=3000` and `NODE_ENV=production` along with real credentials for OpenAI, CoinMarketCap, Firebase RTDB, and MongoDB Atlas.
  - **CRITICAL UI PREVIEW NOTE:** Because `.env` sets `NODE_ENV=production` and `server.ts` calls `dotenv.config({ override: true })`, `server.ts` runs in **PRODUCTION** mode and serves static assets from `dist/`.
  - Therefore, whenever you modify `src/App.tsx` or any frontend file, you **MUST** run `npm run build` (and restart the server if `server.ts` changed) so `http://localhost:3000` serves the newly compiled `dist/` bundle!
- **Critical Data Isolation Invariant**:
  - When no profile is active (`!activeId`) or no valid session exists (`!sessionExists`), `/api/status`, `/output/last_trending.json`, `/output/generated_messages.json`, and `/api/download/*.csv` MUST return empty arrays/headers (`[]`) with zero data leakage across accounts.
- **Important Commands**:
  - `npm run lint` — Runs `tsc --noEmit` (must exit 0 with zero errors).
  - `npm test` — Runs `vitest run` (all 5 test suites / 35 tests must pass).
  - `npm run build` — Builds Vite production bundle into `dist/` and bundles `server.ts` into `dist/server.cjs`.
  - `npm run dev` — Starts live server on `http://localhost:3000`.

---

## 4. Work Completed & Verified (Current State)

All follow-up tasks (Tasks 1–11 / Steps 0–7) are **COMPLETED** and **VERIFIED** on branch `staging`:

1. **Step 0 — Clean Up (`PASS`)**:
   - Confirmed no `src/pages/` or `src/components/` directories exist. All UI lives in `src/App.tsx`.
2. **Step 1 — Text Size Scaling & Lint Fixes (`PASS`, commit `f54f807`)**:
   - Converted remaining `text-xs` body text, labels, inputs, and buttons in `src/App.tsx` to `text-sm` (`text-sm` → `text-base` preserved), leaving badges and the logs console untouched.
   - Fixed all 4 TypeScript errors in `src/App.tsx` (`systemCheckResult.success` optional property and `currentView` type narrowing).
3. **Step 2 — Move Logs (`PASS`, commit `2a4b251`)**:
   - Activity logs card is located on `/logs` (removed from Dashboard).
   - Header includes the `Logs` button (`navigateTo("logs")`).
   - Second tab on `/logs` fetches scheduler logs from `/api/scheduler/logs` (`api.getSchedulerLogs()`) and has the single `/api/scheduler/logs/download` link.
   - `fetchLogs()` checks `if (currentView !== "logs") return;` so logs are fetched only while `/logs` is open.
4. **Step 3 — Health Tab & Header (`PASS`, commit `0529bf9`)**:
   - Header items are strictly ordered: Title, Account button, Active account selector, Scheduler badge, Admin, Logs, Health (with green/red status dot), Guide.
   - `/health` displays `"Everything is working"` or `"Needs attention"` at the top, renders the 5 original header chips (`Server`, `OpenAI`, `CMC`, `DB`, and `Alerts` toggle calling `toggleNotifications`), and displays one plain sentence from `/api/health` under any check whose status is not `"ok"`.
5. **Step 4 — Guide Text (`PASS`)**:
   - `/guide` displays 25 short one-line bullets under the 5 required headings (*Getting started*, *Adding an account*, *Running the scheduler (start, pause, stop, resume)*, *Images*, *If something goes wrong*).
6. **Step 5 — Per-Page Polling (`PASS`)**:
   - `/api/scheduler` polled on `/scheduler` (3s) and header (30s).
   - Logs polled only on `/logs` (3s).
   - `/api/health` polled on `/health` (10s) and header (30s).
   - Dashboard polls `/api/status` (3s) and fetches coins/messages/results only when a run is active.
   - All intervals are cleaned up via `useEffect` return functions on `currentView` change.
7. **Step 6 — Database Call Deduplication (`PASS`, commit `6b51a28`)**:
   - Removed local→cloud write branches in `syncLocalFromCloudIfStale`.
   - Added `hydratedProfiles` tracking so idle `/api/status` polling triggers **zero** cloud database reads once a profile is hydrated.
   - Added SHA-1 payload hashing (`lastCloudSavedHash`) in `writeJsonFile`, `saveSessionStateCloudIfChanged`, and `saveProfilesCloudIfChanged` (stripping transient `updatedAt`/`updated_at` timestamps) to skip redundant cloud writes after posts and login checks.
8. **Step 7 — Robustness (`PASS`, commit `204c38c`)**:
   - `0` direct `fetch()`, `0` `alert()`, `0` `confirm()` calls in `src/App.tsx`.
   - `ErrorBoundary` exported from `src/App.tsx` and wrapping `<App />` in `src/main.tsx`.
   - Every icon-only button in `src/App.tsx` has both `title` and `aria-label`.
9. **Playwright Chromium-1248 & `/api/check-system` Windows Fix (`PASS`, commit `fbec426`)**:
   - Installed Playwright `1.61.1` browser bundle (`chromium-1248` / Chrome for Testing `156.0.8078.4`) into `./.cache/ms-playwright`.
   - Updated `/api/check-system` in `server.ts` so on Windows (`process.platform === "win32"`), it verifies the binary via headless Playwright launch (`chromium.launch({ headless: true, chromiumSandbox: false, args: ["--no-sandbox"] })`) instead of `chrome.exe --version` (which hangs in Windows AppContainer sandbox). Verified `/api/check-system` returns `success: true` and `launchStatus: "success"`.
10. **UI Module Placement, Deduplication & Beginner-Friendly `/guide` (`PASS`, commits `88e7626` & `047e741`)**:
    - **Header & Navigation**:
      - Made the brand logo/title clickable (`navigateTo("dashboard")`).
      - Eliminated duplicate active email text in the header when `profilesList.length > 1` (`#navbar-login-btn` shows `Accounts (${profilesList.length})` when the `Active: [email ✓]` dropdown is visible next to it).
      - Standardized the `Admin` header button so its label stays `"Admin"` with active ring highlight, and standardized the `Back to Dashboard` button across `/admin`, `/scheduler`, `/logs`, `/health`, and `/guide`.
    - **Isolated `/admin` Modules (No Longer "Everything on One Page")**:
      - Removed the `"all"` (`All Admin Tools`) mega-page mode and the duplicate `Configured Account Profiles` tab on `/admin`. `/admin` now displays **one focused tab at a time** (`1. System Diagnostics`, `2. API Keys & Storage`, `3. Emergency Alerts`, `4. Security & Sharing`), defaulting to `diagnostics`.
      - Added a `Manage Profiles (${profilesList.length})` shortcut button inside `Auth & Cache Storage Maintenance`.
    - **`/health` Cross-Navigation**:
      - Added a `Runtime Diagnostics` button (`navigateTo("admin", "diagnostics")`) in the `/health` header bar next to `Back to Dashboard`.
    - **Dashboard `Control Center`, `Progress` & `Storage & Report Explorer` Deduplication**:
      - Moved `Reset Storage` (`#btn-clear-stats`) out of the `Continuous Automation Loop` box and into the `Control Center` top header bar next to the status badge.
      - Removed duplicate timestamp text inside `Get trending coins` (`#btn-fetch`) and `Write comments` (`#btn-generate`) subtitles, removed duplicate `{continuousInterval}m` text next to the cooldown input, and removed duplicate `Coins: Xm ago / Comments: Xm ago` footer at the bottom of `Progress`.
      - Made `Gallery (N)` button in `Marketing Image Upload` scroll smoothly to `#storage-explorer`.
      - Added a single unified `Refresh Data` button in the `Storage & Report Explorer` header bar and removed the 4 duplicate per-tab refresh buttons inside Tabs 1, 2, 3, and 4.
      - Replaced the duplicate `Active Automated Posting Queue` + `Failed / Unsuccessful Submissions` tables in **Tab 2 (`2. Generated Comments`)** with a single clean table of all **Generated AI Comments** (`messagesList`), eliminating duplication with Tab 3 (`3. Post Submissions`).
      - Removed the redundant `Prune >7d` button in Tab 3 (since `Retention & Prune (7d)` opens the Retention modal with `Prune Now`).
      - Removed the redundant `6. Accounts Schedule` tab from `Storage & Report Explorer` and reorganized Tab 5 (`Images Library`) toolbar.
    - **Account & Session Modal (`showSessionModal`)**:
      - Widened modal from `max-w-lg` to `max-w-2xl` so tabs and profile buttons never wrap or overlap, standardized the `<X />` close button with `title` and `aria-label`, and removed the redundant raw `Active state.json Cookies Content` `<textarea>` from Tab 3 (`3. Switch Accounts`).
    - **Destructive Action Safeguards**: Wrapped `Delete state.json`, `/admin` `Reset Storage`, `/logs` `Clear console`, and Dashboard `Reset Storage` (`#btn-clear-stats`) with `setInlineConfirmModal` confirmation dialogs.
    - **Beginner-Friendly `/guide` Page**: Added a 3-step visual workflow roadmap banner (*Step 1: Add a CoinMarketCap Account* ➔ *Step 2: Fetch Coins & Write AI Comments* ➔ *Step 3: Start Posting or Enable Scheduler*) with 1-click action buttons, numbered step circles (`1`–`5`), beginner tips, and direct navigation buttons on each of the 5 guide cards while preserving the 5 required headings and 25 plain-word bullets.
11. **Strict Post Verification, Anti-Fake-Completion Metrics & UI Smoothness (`PASS`, commit `9b034d4`)**:
    - **Eliminated False-Positive ("Fake") Post Successes (`server.ts`, `runRealPostingInternal`)**:
      - Added an image upload completion wait loop after `setInputFiles()` so Playwright waits until any image upload spinner or disabled `Post` button clears before clicking submit.
      - Attached a live `page.on("response")` listener during `Post` submission to inspect CoinMarketCap's post API responses (`HTTP 429`, `401/403`, or non-zero `error_code` in JSON body).
      - Verified that the comment editor actually clears its typed text after clicking `Post` (retrying the `Post` click once if the text is still sitting in the editor) and checks whether the comment snippet appeared in the live community feed (`postedInFeedAfterClick`).
      - If the comment text remains unsubmitted in the editor and neither the API nor the community feed confirms publication, `runRealPostingInternal` returns `status: "retry"` (triggering the 180s rate-limit cooldown) instead of falsely logging `"success"`.
    - **Eliminated Fake 100% Batch Completion Metrics (`server.ts` & `src/App.tsx`)**:
      - Scoped `/api/status` `postedCount` and `failedCount` to the current batch (`commentsGeneratedAt`) instead of lifetime history.
      - Updated `runPostingLoop` so `saveBotProgress({ next_index: 0 })` only resets the queue pointer when `runFailed === 0`, preserving partial-failure visibility.
      - Updated the Dashboard `Progress` card (`Verified Posted`, `Unposted / Left`, `X% Verified`, `Run Finished (21/30 Posted • 9 Unposted)`) and `/scheduler` `Last Run` column (`21 verified posted, 9 failed/unposted`) to calculate completion strictly from verified `"success"` submissions rather than the attempted loop index (`progressIndex`).
    - **Smooth Transitions & Global Image Upload Controls (`src/App.tsx`)**:
      - Mounted the hidden `<input type="file" ref={imageFileInputRef} />` globally at the root of `<App />` so `+ Upload Images` works from Dashboard, `/scheduler`, `/guide`, and `5. Images Library`.
      - Added `Scheduled Cycle Image Attachment` controls (`Pause / Enable Image Upload`, `+ Upload Images`, `Open Image Library`) directly inside `/scheduler` and ordered `Marketing Image Upload` buttons (`1. Upload Images`, `2. Import Drive / S3`, `3. Image Library`).
      - Upgraded `/admin` (4-card module selector deck), `/guide` (interactive topic filter stepper), and `/health` (5-card service diagnostics grid) and improved table/account-list font sizes.
12. **Process-Locked Storage Safeguards, Prominent Start Controls & Zero-Lag Button Transitions (`PASS`, commit `04ac4e1`)**:
    - **Strict Process Locks for `Reset Storage` & Destructive Queue/Image Actions (`server.ts` & `src/App.tsx`)**:
      - Guarded `POST /api/clear-all` and `POST /api/queue/reset-daily` in `server.ts` so they return `409 Conflict` if any posting, fetching, generating, continuous loop, or scheduler cycle is currently running (unless `force: true` is passed by the explicit Refetch modal when idle).
      - Locked `#btn-clear-stats` (`Reset Storage` in Dashboard `Control Center`) whenever `isBusy || isPostingActive || isContinuousLoopActive || isSchedulerRunning`, displaying a `<Lock /> Reset Locked` state while a process is active.
      - Removed the duplicate `Reset Storage` button from `/admin` -> `Auth & Cache Storage Maintenance` so `Reset Storage` lives in a single canonical location, and locked `Archive & Restart`, `Delete Selected`, `Clear All`, `Delete state.json`, `Configure Cookies`, and `Verify Login` while processes are active.
    - **High-Visibility, 1-Click Process & Scheduler Controls (`src/App.tsx`)**:
      - Upgraded `Run accounts in sequence` on `/scheduler` from a small switch into a prominent action card with a live status badge (`ENABLED • 24/7 ACTIVE` vs `DISABLED`) and a bold `Enable Sequential Mode` / `Sequential Mode ON (Disable)` button that locks while a cycle is running.
      - Updated `Run cycle now` on `/scheduler` so it is always clickable in 1 click when idle (`handleRunSchedulerNow` automatically enables sequential mode first if needed before starting the cycle).
      - Upgraded `Continuous Automation Loop` on the Dashboard `Control Center` with a live status badge (`ACTIVE • Xm GAP` vs `OFF`) and a prominent `Enable Auto-Loop` / `Stop Auto-Loop` button, and added live state labels to `Run Full Automated Bot Cycle`.
      - Added optimistic UI state updates (`handleToggleScheduler`, `handleRunSchedulerNow`, `toggleContinuousLoop`), instant view navigation (`behavior: "instant"`), and `transition-all duration-150 active:scale-[0.98]` feedback across buttons for zero-lag transitions.
    - **Multi-Account Scheduler Cycle Isolation, Balanced Coin Partitioning & Persistent Scheduler Logs (`PASS`)**:
      - Updated `executeFetchTrending({ skipSaveToActiveProfile: true })` and `runScheduledCycle` in `server.ts` so fetching ~85–90 coins (after DEX filtering) and generating comments once per cycle saves into dedicated `output/scheduler_cycle_coins.json`, `output/scheduler_cycle_messages.json`, and `output/scheduler_cycle_partitions.json` files without overwriting the manual single-account queue or losing partitions across Pause/Resume.
      - Implemented balanced coin partitioning across due accounts (`basePerAccount + remainder`, e.g., 85 coins across 3 accounts → `29`, `28`, `28` coins sequentially) with detailed partition logs (`[SCHEDULER] Partitioned X coins across Y accounts...`) and avoided double-slicing inside `runPostingLoop` when `isSchedulerCall` is `true`.
      - Added a dedicated `schedulerLogsBuffer` (backed by `output/scheduler.log`) so `GET /api/scheduler/logs` retains all scheduler cycle, turn, partition, and coin submission logs even when Playwright logs hundreds of browser lines.
      - Enabled automatic background verification for **System Environment Diagnostics** (`/api/check-system`) on both server startup warm-up (`runSystemDiagnosticsCheck`) and frontend mount / `/admin` navigation (`checkSystemHealth`), eliminating the need to manually click `Re-Run Diagnostics` on first load.

### Verification Status
- `npm run lint`: **PASS** (0 errors)
- `npm test`: **PASS** (5/5 test files, 35/35 tests passed)
- `npm run build`: **PASS** (`dist/` and `dist/server.cjs` built cleanly)
- Live Server (`http://localhost:3000`): **RUNNING** on `staging` with latest build.

---

## 5. Next Steps for Future Sessions

1. **Before making any changes**: Read this `AI_CONTEXT.md` file and check `git status` / `git log -n 5 --oneline` to confirm you are on the `staging` branch.
2. **Pending User Review / Next Instructions**:
   - Await user testing and feedback on `http://localhost:3000` (on branch `staging`).
   - When the user approves the `staging` commits (`f54f807..204c38c`), push `staging` (`git push origin staging`) or merge `staging` into `main` only when explicitly instructed by the user.
3. **After any future code change**:
   - Run `npm run lint`, `npm test`, and `npm run build`.
   - Update this `AI_CONTEXT.md` file with the latest state and commit hashes.

