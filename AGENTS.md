# CoinMarketCap Trending Bot & Posting Agent - Developer Context

Welcome, future Agent! This document contains the full system context, architectural map, database schemas, and critical business rules for the **CoinMarketCap Trending & Posting Bot**. 

The system operates as a full-stack Node.js (Express + TypeScript) app paired with a React frontend (Vite) and cloud storage via Firestore.

---

## 🚀 1. Application Overview
This application is an automated agent that:
1. **Scrapes or fetches** the latest trending crypto coins from CoinMarketCap (or public fallback APIs).
2. **Generates tailored commentary/analysis** for these coins using LLMs:
   - **Primary Model**: OpenAI SDK (`gpt-4o-mini`) via `OPENAI_API_KEY`.
   - **Fallback Model**: Gemini SDK (`gemini-3.5-flash`) via `GEMINI_API_KEY` (or standard Google API key).
3. **Automates browser logins and posting workflows** using a customized real-browser engine (Puppeteer/Chromium) to submit comments directly to target web destinations, tracking success/failure in real time.
4. **Supports Multiple Profiles**: Active browser sessions, generated lists, and results are siloed by **active profiles** stored securely in Firestore and local configuration folders.

---

## 🛠️ 2. Critical State & Authentication Guardrails (IMPORTANT)

We resolved a major **data leakage and consistency bug** related to active accounts and sessions. You must preserve these strict invariants:

### The "No Account / No Session" Invariant
When no profile is active, or when no authenticated browser session is imported/active:
1. **No Data Leakage**: The frontend should display a clean, idle interface. No previous profile's coins list, generated messages, post-results, or logs should leak or persist in the UI.
2. **Static Endpoint Interception**:
   - `/output/last_trending.json` and `/output/generated_messages.json` are intercepted by the server. If `!activeId` or `!sessionExists`, they immediately return empty lists `[]`.
3. **Status Endpoint Guard**:
   - `/api/status` checks if `activeId` and `sessionExists` are valid. If either is missing, it returns a sanitized idle status object with empty arrays, `totalCoins: 0`, and `sessionStatus: "Session expired / Not found"`.
4. **CSV Download Safeguards**:
   - `/api/download/trending_coins.csv`, `/api/download/generated_comments.csv`, `/api/download/post_submissions.csv`, and `/api/download/overall_report.csv` check active states and return empty headers/records if no active account is loaded.

---

## 📂 3. Database & Profile Synced Architecture

The application uses **Firestore** (`ai-studio-coinmarketcapbot-6befefbd-71cd-4997-9a30-e9ebe7193378`) as its cloud backend. All profile settings, credentials, fetched coins, generated messages, and posting histories are synced bidirectionally between the cloud and the server container's local file systems.

### Local vs. Cloud Directory Structure
- **Local Data Directory**: `/output`
  - `last_trending.json` (Stores currently loaded active coins list)
  - `generated_messages.json` (Stores generated commentary)
  - `results.json` (Stores successful/failed post-submission results)
  - `post_progress.json` (Maintains progress index in continuous loop)
- **Authentication State**: `/auth`
  - Maintains Puppeteer browser cookies, local Storage tokens, and session contexts.
- **Sync Engine**:
  - Whenever a profile is switched, updated, or checked, `syncLocalFromCloudIfStale()` or `syncLocalToCloud()` are triggered in the background to keep the active state fully synchronized.

---

## 🧠 4. LLM API Diagnostics & Telemetry

The frontend features a dedicated **Secrets Directory Grid** that provides direct feedback on the credentials being used:
- **OpenAI Diagnostics**:
  - Checks if `OPENAI_API_KEY` is loaded.
  - If a quota error occurs, the server saves the detail into `lastOpenAiError`. The UI displays a `Quota Limit` warning with recommendations to top-up/upgrade.
- **Gemini Diagnostics**:
  - Serves as the primary backup if OpenAI fails or is missing.
  - If the Gemini API key is invalidated or compromised, the server catches the exception, updates `lastGeminiError`, and the UI renders a `Key Leaked` alert with troubleshooting guides.

---

## 📜 5. Technical Requirements for Future Edits
- **Do NOT bypass Express static route overrides**: Static assets inside `/output/*` are intercepted server-side to apply profile-level permissions and security filters. Do not change this routing layer.
- **Never expose private credentials to the client**: Always handle model configurations, API keys, and Chromium tasks server-side inside `server.ts`.
- **Compile & Lint Verification**: Always run `npm run lint` and `npm run build` after making modifications to ensure full compliance with the Vite + Node + CJS production bundle workflow.

Now you have the entire context! Treat these patterns as core design constraints and continue building with confidence!
