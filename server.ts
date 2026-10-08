import "./src/env";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

// Auto-detect production mode if running from bundled dist/server.cjs or process.env.NODE_ENV is not explicitly set
if (!process.env.NODE_ENV) {
  const isCjs = typeof __filename !== "undefined";
  const isBundled = isCjs && (__filename.endsWith("server.cjs") || __filename.includes("dist"));
  const hasSrcDir = fs.existsSync(path.join(process.cwd(), "src"));
  if (isBundled || !hasSrcDir) {
    process.env.NODE_ENV = "production";
  } else {
    process.env.NODE_ENV = "development";
  }
}
console.log(`[SERVER] Detected environment: NODE_ENV=${process.env.NODE_ENV}`);

// Configure Playwright to use a consistent local cache directory inside the project folder
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const localCachePath = path.join(process.cwd(), ".cache", "ms-playwright");
  const rootCachePath = "/root/.cache/ms-playwright";
  let chosenPlaywrightPath = localCachePath;
  if (!fs.existsSync(localCachePath) && fs.existsSync(rootCachePath)) {
    chosenPlaywrightPath = rootCachePath;
  }
  process.env.PLAYWRIGHT_BROWSERS_PATH = chosenPlaywrightPath;
}
console.log(`[PLAYWRIGHT] Configured PLAYWRIGHT_BROWSERS_PATH to: ${process.env.PLAYWRIGHT_BROWSERS_PATH}`);

import {
  getSessionStateCloud,
  saveSessionStateCloud,
  getTrendingCoinsCloud,
  saveTrendingCoinsCloud,
  getGeneratedMessagesCloud,
  saveGeneratedMessagesCloud,
  getPostResultsCloud,
  savePostResultsCloud,
  getBotProgressCloud,
  saveBotProgressCloud,
  getSystemLogsCloud,
  saveSystemLogsCloud,
  getProfilesCloud,
  saveProfilesCloud,
  getActiveStoreName,
  isMongoEnabled
} from "./src/storage";

import express from "express";
import OpenAI from "openai";
import dotenv from "dotenv";
import { createRequire } from "module";
const customRequire = typeof require !== "undefined" ? require : createRequire(typeof process !== "undefined" && process.cwd ? "file://" + process.cwd() + "/server.js" : "file:///app/server.js");
const { chromium } = customRequire("playwright") as typeof import("playwright");
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config({ override: true });

const app = express();
app.set("trust proxy", true);
const PORT = Number(process.env.PORT) || 3000;

let OUTPUT_DIR = path.join(process.cwd(), "output");
let AUTH_DIR = path.join(process.cwd(), "auth");

try {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  const testFile = path.join(OUTPUT_DIR, ".write-test");
  fs.writeFileSync(testFile, "test");
  fs.unlinkSync(testFile);
} catch (err) {
  console.warn("[SERVER] Root output directory is not writable. Falling back to /tmp/bot-output for AWS/Serverless compatibility.");
  OUTPUT_DIR = "/tmp/bot-output";
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

try {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }
  const testFile = path.join(AUTH_DIR, ".write-test");
  fs.writeFileSync(testFile, "test");
  fs.unlinkSync(testFile);
} catch (err) {
  console.warn("[SERVER] Root auth directory is not writable. Falling back to /tmp/bot-auth for AWS/Serverless compatibility.");
  AUTH_DIR = "/tmp/bot-auth";
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }
}

app.use(express.json({ limit: "50mb" }));

// Intercept specific static file requests to guarantee up-to-date cloud synchronization
app.get("/output/last_trending.json", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  const activeId = getActiveProfileId();
  const sessionExists = fs.existsSync(AUTH_STATE_FILE);
  if (!activeId || !sessionExists) {
    return res.json([]);
  }

  updateActiveProfilePaths();

  if (fs.existsSync(LAST_TRENDING_FILE)) {
    return res.sendFile(LAST_TRENDING_FILE);
  }
  res.json([]);
});

app.get("/output/generated_messages.json", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  const activeId = getActiveProfileId();
  const sessionExists = fs.existsSync(AUTH_STATE_FILE);
  if (!activeId || !sessionExists) {
    return res.json([]);
  }

  updateActiveProfilePaths();

  if (fs.existsSync(GENERATED_MESSAGES_FILE)) {
    return res.sendFile(GENERATED_MESSAGES_FILE);
  }
  res.json([]);
});

app.get("/output/results.json", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  const activeId = getActiveProfileId();
  const sessionExists = fs.existsSync(AUTH_STATE_FILE);
  if (!activeId || !sessionExists) {
    return res.json([]);
  }

  updateActiveProfilePaths();

  if (fs.existsSync(RESULTS_FILE)) {
    return res.sendFile(RESULTS_FILE);
  }
  res.json([]);
});

app.use("/output", express.static(OUTPUT_DIR));

// Define File Paths matching Python project structure
let LAST_TRENDING_FILE = path.join(OUTPUT_DIR, "last_trending.json");
let GENERATED_MESSAGES_FILE = path.join(OUTPUT_DIR, "generated_messages.json");
let RESULTS_FILE = path.join(OUTPUT_DIR, "results.json");
let POST_PROGRESS_FILE = path.join(OUTPUT_DIR, "post_progress.json");
let TIMESTAMPS_FILE = path.join(OUTPUT_DIR, "timestamps.json");
let AUTH_STATE_FILE = path.join(AUTH_DIR, "state.json");
let PROFILES_FILE = path.join(AUTH_DIR, "profiles.json");

// Ensure PROFILES_FILE exists
if (!fs.existsSync(PROFILES_FILE)) {
  try {
    fs.writeFileSync(PROFILES_FILE, JSON.stringify([], null, 2), "utf-8");
  } catch (err) {
    console.error("[SERVER] Error creating initial profiles file:", err);
  }
}

function getActiveProfileId(): string | null {
  try {
    if (fs.existsSync(PROFILES_FILE)) {
      const profiles = JSON.parse(fs.readFileSync(PROFILES_FILE, "utf-8"));
      const active = profiles.find((p: any) => p.isActive);
      return active ? active.id : null;
    }
  } catch (_) {}
  return null;
}

function getNextImportedAccountName(profiles: any[]): string {
  for (let i = 1; i <= 5; i++) {
    const name = `Imported Account ${i}`;
    if (!profiles.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      return name;
    }
  }
  return `Imported Account ${profiles.length + 1}`;
}

interface ProfileTimestamps {
  coinsFetchedAt: number | null;
  coinsFetchedTime: string | null;
  commentsGeneratedAt: number | null;
  commentsGeneratedTime: string | null;
}

function getRealTimestamps(): ProfileTimestamps {
  return readJsonFile<ProfileTimestamps>(TIMESTAMPS_FILE, {
    coinsFetchedAt: null,
    coinsFetchedTime: null,
    commentsGeneratedAt: null,
    commentsGeneratedTime: null,
  });
}

function updateRealFetchTime(): void {
  const ts = getRealTimestamps();
  ts.coinsFetchedAt = Date.now();
  ts.coinsFetchedTime = new Date().toISOString();
  writeJsonFile(TIMESTAMPS_FILE, ts);
}

function updateRealGenerateTime(): void {
  const ts = getRealTimestamps();
  ts.commentsGeneratedAt = Date.now();
  ts.commentsGeneratedTime = new Date().toISOString();
  writeJsonFile(TIMESTAMPS_FILE, ts);
}

function clearRealTimestamps(): void {
  writeJsonFile(TIMESTAMPS_FILE, {
    coinsFetchedAt: null,
    coinsFetchedTime: null,
    commentsGeneratedAt: null,
    commentsGeneratedTime: null,
  });
}

function updateActiveProfilePaths() {
  const activeId = getActiveProfileId();
  if (activeId) {
    const dir = path.join(OUTPUT_DIR, activeId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    LAST_TRENDING_FILE = path.join(dir, "last_trending.json");
    GENERATED_MESSAGES_FILE = path.join(dir, "generated_messages.json");
    RESULTS_FILE = path.join(dir, "results.json");
    POST_PROGRESS_FILE = path.join(dir, "post_progress.json");
    TIMESTAMPS_FILE = path.join(dir, "timestamps.json");
  } else {
    LAST_TRENDING_FILE = path.join(OUTPUT_DIR, "last_trending.json");
    GENERATED_MESSAGES_FILE = path.join(OUTPUT_DIR, "generated_messages.json");
    RESULTS_FILE = path.join(OUTPUT_DIR, "results.json");
    POST_PROGRESS_FILE = path.join(OUTPUT_DIR, "post_progress.json");
    TIMESTAMPS_FILE = path.join(OUTPUT_DIR, "timestamps.json");
  }
  console.log(`[PATHS] Dynamic paths updated. Active profile: ${activeId || "None"}`);
}

// Initial update of paths
updateActiveProfilePaths();

// Item 15: Per-Account Daily Post Limit and Progress Structure
interface BotProgressData {
  next_index: number;
  daily_post_count?: number;
  last_post_date?: string;
  daily_post_limit?: number;
  updated_at?: string;
}

function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function getActiveProfile(): any | null {
  try {
    if (fs.existsSync(PROFILES_FILE)) {
      const profiles = JSON.parse(fs.readFileSync(PROFILES_FILE, "utf-8"));
      return profiles.find((p: any) => p.isActive) || null;
    }
  } catch (_) {}
  return null;
}

function getAccountDailyPostLimit(profileId?: string | null): number {
  if (profileId) {
    try {
      if (fs.existsSync(PROFILES_FILE)) {
        const profiles = JSON.parse(fs.readFileSync(PROFILES_FILE, "utf-8"));
        const target = profiles.find((p: any) => p.id === profileId);
        if (target && typeof target.dailyPostLimit === "number" && target.dailyPostLimit > 0) {
          return target.dailyPostLimit;
        }
      }
    } catch (_) {}
  } else {
    const active = getActiveProfile();
    if (active && typeof active.dailyPostLimit === "number" && active.dailyPostLimit > 0) {
      return active.dailyPostLimit;
    }
  }
  const envVal = Number(process.env.DAILY_POST_LIMIT);
  if (!isNaN(envVal) && envVal > 0) {
    return envVal;
  }
  return 500; // Configurable daily posting limit default: 500 posts/day
}

function readBotProgress(): BotProgressData {
  const todayStr = getTodayDateString();
  const limit = getAccountDailyPostLimit();
  const data = readJsonFile<BotProgressData>(POST_PROGRESS_FILE, {
    next_index: 0,
    daily_post_count: 0,
    last_post_date: todayStr,
    daily_post_limit: limit,
  });

  if (typeof data.next_index !== "number") {
    data.next_index = 0;
  }

  // Roll over daily post count if date stamp is from previous calendar day
  if (!data.last_post_date || data.last_post_date !== todayStr) {
    data.daily_post_count = 0;
    data.last_post_date = todayStr;
  } else if (typeof data.daily_post_count !== "number") {
    data.daily_post_count = 0;
  }

  data.daily_post_limit = limit;
  return data;
}

function saveBotProgress(updates: Partial<BotProgressData>): BotProgressData {
  const current = readBotProgress();
  const merged: BotProgressData = {
    ...current,
    ...updates,
    daily_post_limit: updates.daily_post_limit || getAccountDailyPostLimit(),
    updated_at: new Date().toISOString()
  };
  writeJsonFile(POST_PROGRESS_FILE, merged);
  return merged;
}

// In-Memory Logs to display in the UI console
interface LogEntry {
  timestamp: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
  profileId?: string | null;
}
let logs: LogEntry[] = [];

let logSyncTimeout: NodeJS.Timeout | null = null;
function triggerLogSync() {
  if (logSyncTimeout) return;
  logSyncTimeout = setTimeout(() => {
    logSyncTimeout = null;
    saveSystemLogsCloud(logs).catch(err => {
      console.error("[FIREBASE] Error syncing logs to cloud:", err.message);
    });
  }, 15000); // Debounce to 15 seconds to prevent excessive write operations during long posting runs
}

function addLog(level: "info" | "success" | "warning" | "error", message: string, profileId?: string | null) {
  if (!message || !message.trim()) return;
  // Deduplicate consecutive identical logs to prevent clutter
  if (logs.length > 0 && logs[logs.length - 1].message === message) {
    return;
  }
  const timestamp = new Date().toLocaleTimeString();
  const targetProfileId = profileId !== undefined ? profileId : getActiveProfileId();
  const entry: LogEntry = { timestamp, level, message, profileId: targetProfileId };
  logs.push(entry);
  console.log(`[${level.toUpperCase()}] ${message}`);
  // Strictly enforce max 200 logs cap (ring-buffer) to prevent unbounded memory growth
  while (logs.length > 200) {
    logs.shift();
  }
  triggerLogSync();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

let isInstallingPlaywright = false;
async function installPlaywrightChromium(): Promise<void> {
  if (isInstallingPlaywright) {
    while (isInstallingPlaywright) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return;
  }
  isInstallingPlaywright = true;
  try {
    addLog("info", "Missing Playwright browser or launch timed out. Automatically downloading chromium and system dependencies...");
    const envStr = process.env.PLAYWRIGHT_BROWSERS_PATH ? `PLAYWRIGHT_BROWSERS_PATH=${process.env.PLAYWRIGHT_BROWSERS_PATH} ` : '';
    
    addLog("info", `Executing command: ${envStr}npx playwright install chromium`);
    execSync(`${envStr}npx playwright install chromium`, { stdio: "inherit" });
    
    addLog("info", `Executing command to install system dependencies (best-effort): ${envStr}npx playwright install-deps chromium`);
    try {
      execSync(`${envStr}npx playwright install-deps chromium`, { stdio: "inherit" });
      addLog("success", "Playwright system dependencies installation complete!");
    } catch (depsErr) {
      addLog("warning", `Note: non-root or standard container system dependencies install returned: ${(depsErr as Error).message}. Proceeding resiliently...`);
    }

    addLog("success", "Playwright chromium browser successfully installed!");
  } catch (err) {
    addLog("error", `Failed to automatically run playwright install: ${(err as Error).message}`);
  } finally {
    isInstallingPlaywright = false;
  }
}

class PlaywrightLock {
  private static queue: Promise<any> = Promise.resolve();

  static async acquire<T>(task: () => Promise<T>): Promise<T> {
    const nextTask = this.queue.then(async () => {
      return await task();
    });
    this.queue = nextTask.catch(() => {});
    return nextTask;
  }
}

async function launchBrowserResilient(options: any = {}): Promise<any> {
  // Inject highly aggressive memory-saving flags suitable for low-RAM containers like Render (512MB limit)
  const memoryArgs = [
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-setuid-sandbox",
    "--no-sandbox",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-extensions",
    "--disable-sync",
    "--disable-default-apps",
    "--mute-audio",
    "--disable-notifications",
    "--disable-popup-blocking",
    "--disable-blink-features=AutomationControlled",
    "--no-zygote",
    "--disable-software-rasterizer",
    '--js-flags="--max-old-space-size=128"'
  ];

  if (!options.args) {
    options.args = [];
  }
  for (const arg of memoryArgs) {
    if (!options.args.includes(arg)) {
      options.args.push(arg);
    }
  }

  if (options.chromiumSandbox === undefined) {
    options.chromiumSandbox = false;
  }
  if (options.headless === undefined) {
    options.headless = true;
  }

  try {
    // Wrap chromium launch in a 30s timeout so hangs are caught and handled
    return await withTimeout(
      chromium.launch(options),
      30000,
      "Chromium launch timed out after 30 seconds"
    );
  } catch (err) {
    const errMsg = (err as Error).message;
    if (
      errMsg.includes("shared libraries") ||
      errMsg.includes("cannot open shared object file") ||
      errMsg.includes("libglib-2.0.so") ||
      errMsg.includes("exitCode=127")
    ) {
      throw new Error(
        "Playwright requires missing system shared libraries (like libglib-2.0.so.0) which are not pre-installed in this environment (root/sudo access is required to install them). However, these packages are fully configured to be installed automatically in production/AWS/Railway environments via our nixpacks.toml/railway.toml configurations!"
      );
    }
    if (
      errMsg.includes("Executable doesn't exist") || 
      errMsg.includes("playwright install") || 
      errMsg.includes("Looks like Playwright was just installed or updated") ||
      errMsg.includes("timed out")
    ) {
      addLog("warning", `Playwright browser launch failed or timed out: ${errMsg}. Re-installing chromium and setting up system dependencies...`);
      await installPlaywrightChromium();
      
      // Try again on second attempt with a slightly longer timeout
      return await withTimeout(
        chromium.launch(options),
        45000,
        "Chromium launch timed out after 45 seconds on second attempt"
      );
    }
    throw err;
  }
}

// Initial System Logs
addLog("info", "CoinMarketCap Bot Server initialized.");
addLog("info", "Ready to process trending coins and execute automation.");

// Auto-initialize auth/state.json if missing, or update from env var
if (process.env.AUTH_STATE_JSON) {
  addLog("info", "Detected AUTH_STATE_JSON environment variable. Syncing session storage state...");
  try {
    const parsed = JSON.parse(process.env.AUTH_STATE_JSON);
    fs.writeFileSync(AUTH_STATE_FILE, JSON.stringify(parsed, null, 2), "utf-8");
    addLog("success", "Successfully initialized auth/state.json from AUTH_STATE_JSON environment variable!");
  } catch (err) {
    addLog("error", `Failed to parse AUTH_STATE_JSON environment variable: ${(err as Error).message}`);
  }
} else if (!fs.existsSync(AUTH_STATE_FILE)) {
  addLog("info", "No active auth/state.json session file found on startup. Waiting for profile restoration or login.");
} else {
  addLog("info", "Found existing auth/state.json session storage state.");
}

// Interfaces
interface Coin {
  name: string;
  symbol: string;
  price: number;
  change_1h?: number;
  change_24h: number;
  change_7d?: number;
  market_cap: number;
  volume_24h: number;
  cmc_rank?: number;
  slug: string;
  url: string;
}

interface GeneratedMessage {
  name: string;
  symbol: string;
  url: string;
  message: string;
  sentiment?: "bullish" | "bearish" | "neutral";
}

interface PostResult {
  name: string;
  symbol: string;
  url: string;
  status: "success" | "captcha" | "expired" | "failed" | "retry" | "skipped";
  message: string;
  timestamp: string;
  sentiment?: "bullish" | "bearish" | "neutral";
}

// Global State
let botStatus = "Idle"; // "Idle" | "Fetching" | "Generating" | "Posting" | "Stopping" | "Completed"
let currentCoinName = "N/A";
let activePostingTimeout: NodeJS.Timeout | null = null;
let currentPostingIndex = 0;
let isPostingRunning = false;
let isGeneratingRunning = false;
let isStopping = false;
const runMode = "Real Browser";

let lastOpenAiError: string | null = null;
let lastGeminiError: string | null = null;

let isContinuousLoopActive = false;
let isFullFlowAborted = false;
let nextCycleStartTime: number | null = null;
let nextCycleTimeout: NodeJS.Timeout | null = null;
let continuousLoopIntervalMinutes = 20; // Customizable, default 20 minutes

async function interruptibleSleep(ms: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (!isPostingRunning) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}

function cancelNextAutomationCycle() {
  isContinuousLoopActive = false;
  isFullFlowAborted = true;
  nextCycleStartTime = null;
  if (nextCycleTimeout) {
    clearTimeout(nextCycleTimeout);
    nextCycleTimeout = null;
    addLog("info", "Scheduled continuous bot cycle has been cancelled.");
  }
  
  // Stop currently running posting loop or steps if any
  if (isPostingRunning) {
    isPostingRunning = false;
    addLog("warning", "Automated posting sequence has been stopped because the Continuous Automation Loop was disabled.");
  }
  if (isGeneratingRunning) {
    isGeneratingRunning = false;
    addLog("warning", "Automated generation process has been stopped.");
  }
  if (botStatus === "Fetching" || botStatus === "Generating" || botStatus === "Posting" || botStatus === "Completed") {
    botStatus = "Idle";
  }
}

async function triggerFullFlowExecution() {
  const activeId = getActiveProfileId();
  const sessionExists = fs.existsSync(AUTH_STATE_FILE);

  if (!activeId || !sessionExists) {
    addLog("error", "[AUTOMATION] Cannot run continuous cycle: No active account profile or authenticated session found. Disabling loop.");
    cancelNextAutomationCycle();
    botStatus = "Idle";
    return;
  }

  if (isBusy() || isPostingRunning || isGeneratingRunning) {
    addLog("warning", "Could not trigger automated continuous cycle: an automated process is still currently running. Postponing cycle by 1 minute...");
    if (isContinuousLoopActive && !nextCycleTimeout) {
      nextCycleStartTime = Date.now() + 60000;
      nextCycleTimeout = setTimeout(async () => {
        nextCycleTimeout = null;
        if (isContinuousLoopActive) {
          await triggerFullFlowExecution();
        }
      }, 60000);
    }
    return;
  }

  isFullFlowAborted = false;

  addLog("info", "========================================");
  addLog("info", "Starting Continuous Loop - Running Full Bot Cycle...");
  addLog("info", "========================================");

  // Clear previous results and progress for the new run
  await writeJsonFile(RESULTS_FILE, []);
  saveBotProgress({ next_index: 0 });

  try {
    // Step 1: Fetch
    addLog("info", "[FLOW STEP 1/3] Fetching latest trending coins...");
    botStatus = "Fetching";
    await executeFetchTrending();

    if (isFullFlowAborted) {
      addLog("warning", "Full automated sequence aborted by user during Fetching phase.");
      botStatus = "Idle";
      return;
    }

    // Step 2: Generate
    addLog("info", "[FLOW STEP 2/3] Generating custom community comments...");
    botStatus = "Generating";
    isGeneratingRunning = true;
    try {
      await executeGenerateMessages();
    } finally {
      isGeneratingRunning = false;
    }

    if (isFullFlowAborted) {
      addLog("warning", "Full automated sequence aborted by user during Generation phase.");
      botStatus = "Idle";
      return;
    }

    // Step 3: Post
    addLog("info", "[FLOW STEP 3/3] Launching automated comment submitter...");
    isPostingRunning = true;
    botStatus = "Posting";
    currentPostingIndex = 0;
    runPostingLoop();
  } catch (error) {
    addLog("error", `Scheduled continuous full cycle failed: ${(error as Error).message}`);
    botStatus = "Idle";
    isPostingRunning = false;
    isGeneratingRunning = false;
    // Schedule next one anyway if continuous loop is still active
    if (isContinuousLoopActive) {
      scheduleNextAutomationCycle();
    }
  }
}

function scheduleNextAutomationCycle() {
  if (nextCycleTimeout) {
    clearTimeout(nextCycleTimeout);
  }
  
  const gapMs = continuousLoopIntervalMinutes * 60 * 1000;
  nextCycleStartTime = Date.now() + gapMs;
  addLog("info", `Next automated bot cycle is scheduled to start in ${continuousLoopIntervalMinutes} minutes (at ${new Date(nextCycleStartTime).toLocaleTimeString()}).`);
  
  nextCycleTimeout = setTimeout(async () => {
    nextCycleTimeout = null;
    nextCycleStartTime = null;
    if (isContinuousLoopActive) {
      await triggerFullFlowExecution();
    }
  }, gapMs);
}

interface LoginSession {
  browser: any;
  context: any;
  page: any;
  email: string;
}
let activeLoginSession: LoginSession | null = null;
let loginState: {
  status: "idle" | "authenticating" | "requires_otp" | "success" | "failed";
  message: string;
} = { status: "idle", message: "" };

function isBusy(): boolean {
  return (
    botStatus === "Fetching" ||
    botStatus === "Generating" ||
    botStatus === "Posting" ||
    botStatus === "Stopping" ||
    botStatus === "Authenticating" ||
    botStatus === "Verifying Code" ||
    botStatus === "Checking Login" ||
    isPostingRunning ||
    isGeneratingRunning
  );
}

// Playwright Real Automation Helpers

async function saveDebugScreenshot(page: any, name: string) {
  // Screenshot capture disabled to optimize CPU, memory, and disk space usage
}

// Robust click helper to prevent timeouts on elements blocked by overlays or slow actionability checks
async function removeBlockingOverlays(page: any) {
  try {
    await page.evaluate(() => {
      const selectors = [
        '.modal-backdrop',
        '.modalOpened',
        '[class*="backdrop" i]',
        '[class*="overlay" i]',
        '[class*="modalOpened" i]',
        '[class*="dialog-container" i]',
        '.sc-acb6320-0',
        '.jPvGvf',
        '#onetrust-banner-sdk',
        '#onetrust-accept-btn-handler',
        '.optanon-allow-all',
        '#accept-cookie-policy',
        '.cmc-cookie-policy-banner__close',
        '.cmc-cookie-policy-banner',
        '[id*="cookie" i]',
        '[class*="cookie" i]'
      ];
      for (const sel of selectors) {
        try {
          const elements = document.querySelectorAll(sel);
          elements.forEach(el => {
            el.remove();
          });
        } catch {}
      }
      if (document.body) {
        document.body.style.overflow = "auto";
        document.body.style.pointerEvents = "auto";
      }
    }).catch(() => {});
  } catch {}
}

async function clickResiliently(page: any, element: any, selectorDescription: string) {
  try {
    // Purge any blocking overlays/modals before attempting clicks
    await removeBlockingOverlays(page).catch(() => {});

    // Try to scroll the element into view first so actionability is easier to pass
    await element.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
    
    // Attempt normal click with a short timeout of 500ms so it doesn't hang
    await element.click({ timeout: 500 });
  } catch (err) {
    addLog("warning", `Standard click failed on ${selectorDescription}: ${(err as Error).message}. Trying forced click fallback...`);
    try {
      // Attempt click with force: true and 500ms timeout
      await element.click({ force: true, timeout: 500 });
    } catch (err2) {
      addLog("warning", `Forced click failed on ${selectorDescription}: ${(err2 as Error).message}. Using dispatchEvent click fallback...`);
      // Fallback to dispatchEvent click (bypasses all visibility, hover, and actionability checks)
      await element.dispatchEvent("click").catch(async (err3) => {
        addLog("warning", `dispatchEvent click failed on ${selectorDescription}: ${(err3 as Error).message}. Trying evaluate click fallback...`);
        // Final fail-safe: evaluate element.click() in browser context
        await element.evaluate((el: any) => (el as HTMLElement).click()).catch((err4) => {
          addLog("error", `All click attempts failed on ${selectorDescription}: ${(err4 as Error).message}`);
          throw err4;
        });
      });
    }
  }
}

async function fillInputResiliently(page: any, input: any, value: string) {
  try {
    await input.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
    await input.click({ timeout: 2000 }).catch(() => {});
    await input.focus().catch(() => {});
    
    // Clear any existing text
    await input.fill("").catch(() => {});
    
    // Use fill
    await input.fill(value).catch(() => {});
    
    // Double-check if the value matches. If not, use keyboard.type
    const currentVal = await input.inputValue().catch(() => "");
    if (currentVal !== value) {
      await input.focus().catch(() => {});
      await page.keyboard.press("Control+A").catch(() => {});
      await page.keyboard.press("Backspace").catch(() => {});
      await page.keyboard.type(value, { delay: 30 }).catch(() => {});
    }
    
    // Dispatch 'input' and 'change' events via evaluate to absolutely force React state update
    await input.evaluate((el: HTMLInputElement, val: string) => {
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value).catch(() => {});
  } catch (err) {
    addLog("warning", `Error during resilient fill: ${(err as Error).message}`);
  }
}

async function locateAndPrepareCommentEditor(page: any): Promise<any> {
  // 1. Purge all blocking overlays/cookie banners immediately via extremely fast DOM script
  await removeBlockingOverlays(page).catch(() => {});

  // Robust combined CSS selector covering all possible variants of the editor
  const robustSelector = 'div[contenteditable="true"], [data-test="base-editor-editable"], .public-DraftEditor-content, textarea[placeholder*="thoughts" i], textarea[placeholder*="comment" i], [placeholder*="thoughts" i], [placeholder*="comment" i], [role="textbox"]';

  // 2. CHECK IF EDITOR IS ALREADY VISIBLE. If yes, return immediately!
  try {
    const el = await page.$(robustSelector);
    if (el && await el.isVisible()) {
      addLog("info", "Comment editor is already visible on initial page load. Skipping tab activation and scrolling!");
      return el;
    }
  } catch {}

  // 3. If not visible, check and click the Community/Social/Discussion tab
  addLog("info", "Comment editor not immediately visible. Activating Community/Social section tab...");
  const communityTabs = [
    'a:has-text("Community")',
    'button:has-text("Community")',
    'span:has-text("Community")',
    'a:has-text("Social")',
    'button:has-text("Social")',
    'span:has-text("Social")',
    'a:has-text("Discussion")',
    'button:has-text("Discussion")',
    'span:has-text("Discussion")',
    'a:has-text("Feed")',
    'button:has-text("Feed")',
    'span:has-text("Feed")',
    '[data-test="community-tab"]'
  ];
  for (const selector of communityTabs) {
    try {
      const tab = await page.$(selector);
      if (tab && await tab.isVisible()) {
        addLog("info", `Clicking tab trigger to activate community section: "${selector}"`);
        await clickResiliently(page, tab, `community tab button: ${selector}`);
        await page.waitForTimeout(1000);
        
        // Dynamic verification: check if editor became visible after clicking this tab
        const el = await page.$(robustSelector);
        if (el && await el.isVisible()) {
          addLog("success", `Comment editor became visible after clicking tab "${selector}"! Skipping remaining tabs/scrolls.`);
          return el;
        }
      }
    } catch {}
  }

  // 4. Scroll down in incremental steps to trigger lazy loading of comments / editor section
  addLog("info", "Executing incremental scrolling loops to trigger CoinMarketCap lazy loaders...");
  for (let step = 1; step <= 6; step++) {
    try {
      const el = await page.$(robustSelector);
      if (el && await el.isVisible()) {
        addLog("success", `Successfully found comment editor during scroll-step ${step}!`);
        return el;
      }
    } catch {}

    const scrollAmount = 700;
    addLog("info", `Scroll-step ${step}/6: Scrolling page down by ${scrollAmount}px...`);
    await page.evaluate((amt: number) => window.scrollBy(0, amt), scrollAmount).catch(() => {});
    await page.waitForTimeout(1200); // Allow lazy components to fetch and load
  }

  // 5. Use a final, highly efficient wait-for-selector strategy
  try {
    addLog("info", "Waiting for comment editor to load using our robust selector strategy...");
    const editor = await page.waitForSelector(robustSelector, { state: "visible", timeout: 6000 });
    if (editor) {
      addLog("success", "Successfully located comment editor using robust selector!");
      return editor;
    }
  } catch (err) {
    addLog("warning", `Comment editor not visible via main selector: ${(err as Error).message}`);
  }

  // 6. Check frames as a fallback
  try {
    for (const frame of page.frames()) {
      const frameEl = await frame.$(robustSelector);
      if (frameEl && await frameEl.isVisible()) {
        addLog("info", "Located comment editor inside frame.");
        return frameEl;
      }
    }
  } catch {}

  return null;
}

async function setupPageResourceBlocking(page: any): Promise<void> {
  try {
    await page.route("**/*", async (route: any) => {
      const request = route.request();
      const resourceType = request.resourceType();
      const url = request.url();
      
      // Minimum safe optimization: only block heavy media (video/audio) and third-party trackers.
      // KEEP images and fonts enabled so login captchas, slide puzzles, and UI buttons render properly!
      const blockedTypes = ["media"];
      const blockedDomains = [
        "google-analytics.com",
        "googletagmanager.com",
        "doubleclick.net",
        "facebook.net",
        "hotjar.com",
        "clarity.ms",
        "scorecardresearch.com"
      ];
      
      const shouldBlock = blockedTypes.includes(resourceType) || 
                          blockedDomains.some(domain => url.includes(domain));
                          
      if (shouldBlock) {
        await route.abort().catch(() => {});
      } else {
        await route.continue().catch(() => {});
      }
    });
  } catch (err) {
    console.error("Resource routing error:", err);
  }
}

function normalizeStateJson(stateJsonStr: string): string {
  try {
    if (!stateJsonStr || !stateJsonStr.trim()) return stateJsonStr;
    const state = JSON.parse(stateJsonStr);
    let changed = false;
    
    // Normalize Authorization cookie: CoinMarketCap expects 'BearereyJ...' WITHOUT any space.
    // If a space exists (e.g. "Bearer eyJ..."), we MUST remove it to ensure the cookie format is correct.
    if (state && Array.isArray(state.cookies)) {
      const farFuture = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year in the future
      state.cookies = state.cookies.map((c: any) => {
        if (!c || typeof c !== "object") return c;

        if (c.name === "Authorization" && typeof c.value === "string") {
          if (c.value.startsWith("Bearer eyJ")) {
            c.value = "Bearer" + c.value.substring(7); // "Bearer " is 7 characters
            changed = true;
            addLog("info", "Automatically normalized 'Authorization' cookie value (removed space to match CoinMarketCap's BearereyJ standard).");
          }
        }
        
        // Push cookie expiration far into the future (1 year) so Playwright/Chromium never discards them
        if (typeof c.expires !== "number" || c.expires < farFuture) {
          c.expires = farFuture;
          changed = true;
        }

        return c;
      });
    }
    
    return changed ? JSON.stringify(state, null, 2) : stateJsonStr;
  } catch (err) {
    console.error("Error during state.json cookie normalization:", (err as Error).message);
    return stateJsonStr;
  }
}

function extractFingerprintDetails(stateFilePath: string) {
  let userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
  let timezoneId = "America/New_York";
  let locale = "en-US";

  try {
    if (fs.existsSync(stateFilePath)) {
      const state = JSON.parse(fs.readFileSync(stateFilePath, "utf-8"));
      
      let bncFvInfoStr = "";
      
      // Check cookies
      if (Array.isArray(state.cookies)) {
        const cookie = state.cookies.find((c: any) => c.name === "BNC_FV_INFO" || c.name === "__BNC_FP_INFO__");
        if (cookie && cookie.value) {
          bncFvInfoStr = decodeURIComponent(cookie.value);
        }
      }
      
      // Check localStorage if not found in cookies
      if (!bncFvInfoStr && Array.isArray(state.origins)) {
        for (const origin of state.origins) {
          if (Array.isArray(origin.localStorage)) {
            const item = origin.localStorage.find((l: any) => l.name === "BNC_FV_INFO" || l.name === "__BNC_FP_INFO__" || l.name === "BNC_FV_KEY");
            if (item && item.value) {
              bncFvInfoStr = item.value;
            }
          }
        }
      }
      
      if (bncFvInfoStr) {
        let parsedInfo: any = null;
        try {
          const outer = JSON.parse(bncFvInfoStr);
          if (outer && typeof outer === "object" && typeof outer.value === "string") {
            parsedInfo = JSON.parse(outer.value);
          } else {
            parsedInfo = outer;
          }
        } catch {
          try {
            parsedInfo = JSON.parse(bncFvInfoStr);
          } catch {}
        }
        
        if (parsedInfo && typeof parsedInfo === "object") {
          if (parsedInfo.ua) {
            userAgent = parsedInfo.ua;
          } else if (parsedInfo.user_agent) {
            userAgent = parsedInfo.user_agent;
          }
          
          if (parsedInfo.webTimezone) {
            timezoneId = parsedInfo.webTimezone;
          } else if (parsedInfo.web_timezone) {
            timezoneId = parsedInfo.web_timezone;
          }
          
          if (parsedInfo.sysLanguage) {
            locale = parsedInfo.sysLanguage;
          } else if (parsedInfo.system_lang) {
            locale = parsedInfo.system_lang;
          }
        }
      }
    }
  } catch (err) {
    console.error("Error extracting fingerprint details from storage state:", (err as Error).message);
  }

  return { userAgent, timezoneId, locale };
}

function hasRealAuthCookies(cookies: any[]): boolean {
  if (!Array.isArray(cookies) || cookies.length === 0) return false;
  return cookies.some((c: any) => {
    const n = (c.name || "").trim().toLowerCase();
    const v = (c.value || "").trim();
    if (n === "authorization" && v.length > 20) return true;
    if (n === "u-prod" && v.length > 20) return true;
    if ((n === "token" || n === "access_token" || n === "auth_token") && v.length > 30) return true;
    return false;
  });
}

async function isEditorPostButtonRequiringLogin(page: any): Promise<boolean> {
  try {
    const postButtonSelectors = [
      '[data-test="editor-post-button"]',
      'button:has-text("Post")',
      'button:has-text("Submit")',
      'button:has-text("Comment")',
      'button.editor-post-button',
      '.editor-post-button'
    ];
    for (const sel of postButtonSelectors) {
      const btn = await page.$(sel);
      if (btn) {
        const text = (await btn.innerText().catch(() => "")).trim().toLowerCase();
        if (text.includes("log in") || text.includes("login") || text.includes("sign in") || text.includes("signin")) {
          return true;
        }
      }
    }
  } catch {}
  return false;
}

async function checkLoginRealInternal(): Promise<{ status: "success" | "expired" | "captcha" | "failed"; message: string }> {
  addLog("info", "Playwright launching headlessly with stealth configurations...");
  let browser: any = null;
  try {
    browser = await launchBrowserResilient({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
      ]
    });
    
    // Extract fingerprint details from user's state.json to maximize session authenticity
    const { userAgent, timezoneId, locale } = extractFingerprintDetails(AUTH_STATE_FILE);
    
    addLog("info", `Loading browser context storage state from auth/state.json with fingerprint settings (User-Agent: ${userAgent.substring(0, 40)}..., Timezone: ${timezoneId}, Locale: ${locale})...`);
    const context = await browser.newContext({
      storageState: AUTH_STATE_FILE,
      userAgent,
      viewport: { width: 1366, height: 768 },
      locale,
      timezoneId,
    });

    // Stealth: hide webdriver property
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    const page = await context.newPage();
    await setupPageResourceBlocking(page);
    addLog("info", "Navigating to CoinMarketCap Bitcoin page: https://coinmarketcap.com/currencies/bitcoin/");
    
    try {
      await page.goto("https://coinmarketcap.com/currencies/bitcoin/", {
        waitUntil: "domcontentloaded",
        timeout: 45000
      });
    } catch (gotoErr) {
      addLog("warning", `Initial page navigation timeout/warning (continuing anyway to check elements): ${(gotoErr as Error).message}`);
    }
    
    // Wait for the page to settle down
    await page.waitForTimeout(2000);
    
    const currentUrl = page.url();
    if (currentUrl.includes("/login") || currentUrl.includes("/signin") || currentUrl.includes("/auth")) {
      addLog("error", `Session expired: Redirected to login page (${currentUrl})`);
      await saveDebugScreenshot(page, "login_expired");
      return { status: "expired", message: "Session expired: Redirected to login page" };
    }
    
    // Also check if any header Log In buttons are visible on the page
    let isHeaderLoginVisible = false;
    const headerLoginSelectors = [
      'button:has-text("Log In")',
      'button:has-text("Log in")',
      'a:has-text("Log In")',
      'a:has-text("Log in")',
      '[data-testid="header-login-button"]'
    ];
    for (const sel of headerLoginSelectors) {
      try {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          isHeaderLoginVisible = true;
          break;
        }
      } catch {}
    }

    // 1. Cookie Check: We check if core authorization cookies are present in the context.
    const cookies = await context.cookies().catch(() => []);
    const hasAuthCookie = cookies.some((c: any) => c.name === "Authorization" && c.value && c.value.length > 20);
    const hasUprodCookie = cookies.some((c: any) => c.name === "u-prod" && c.value && c.value.length > 20);

    // Scan page for the comment editor
    const editor = await locateAndPrepareCommentEditor(page);

    if (!hasAuthCookie && !hasUprodCookie && !editor) {
      addLog("error", "Login validation failed: Missing core 'Authorization' or 'u-prod' cookies in context, and comment editor is missing.");
      return { status: "expired", message: "Logged out (Missing auth cookies)" };
    }

    // We only fail if the comment editor is missing.
    // If the comment editor is fully visible and prepared, we are functionally logged in!
    // We treat isHeaderLoginVisible as a non-blocking indicator because of high false-positives
    // (such as mobile menus, footers, promo links, or slow-loading profile headers).
    if (!editor) {
      await saveDebugScreenshot(page, "editor_failed");
      
      // Let's check for specific Cloudflare captcha elements first
      const title = await page.title().catch(() => "");
      const hasCfTitle = title.includes("Cloudflare") || title.includes("Just a moment");
      const hasCfSelectors = await page.$('#challenge-running, #challenge-stage, .cf-turnstile').catch(() => null);
      
      if (hasCfTitle || hasCfSelectors) {
        addLog("error", "CRITICAL: Cloudflare Turnstile human challenge detected on page!");
        return { status: "captcha", message: "Cloudflare Turnstile captcha block" };
      }

      if (isHeaderLoginVisible) {
        addLog("error", "Login validation failed: Comment editor is missing and active 'Log In' button is visible in the page header.");
        return { status: "expired", message: "Logged out (Log In button is visible)" };
      }

      // Check if button text indicates "Log In" is required
      const loginBtn = await page.$('button:has-text("Log In"), button:has-text("Sign Up")');
      if (loginBtn) {
        addLog("error", "Login validation failed: Session expired or invalid cookies. Detected Log In button.");
        return { status: "expired", message: "Logged out (Log In button found)" };
      }

      addLog("error", "Login validation failed: Could not locate the comment editor input box.");
      return { status: "expired", message: "Comment editor input missing or session inactive" };
    }
    
    // Now check the actual text on the post submit button if available to be 100% sure we are not prompted to login
    const postButtonSelectors = [
      '[data-test="editor-post-button"]',
      'button:has-text("Post")',
      'button:has-text("Submit")',
      'button:has-text("Comment")',
      'button.editor-post-button',
      '.editor-post-button'
    ];
    let postBtn = null;
    for (const selector of postButtonSelectors) {
      postBtn = await page.$(selector);
      if (postBtn) break;
    }
    if (postBtn) {
      const buttonText = await postBtn.innerText().catch(() => "");
      if (buttonText.toLowerCase().includes("log in") || buttonText.toLowerCase().includes("signin")) {
        addLog("error", "Login validation failed: Found comment editor, but submit button text is 'Log In' instead of 'Post'.");
        await saveDebugScreenshot(page, "login_required_post_btn");
        return { status: "expired", message: "Logged out (Post button requires Log In)" };
      }
    }

    addLog("success", "Successfully found and verified comment editor and active session state!");
    addLog("success", "Session active! Authentication is fully verified.");

    // Save refreshed storageState back to maintain session longevity
    try {
      await context.storageState({ path: AUTH_STATE_FILE });
      if (fs.existsSync(AUTH_STATE_FILE)) {
        const cookiesStr = fs.readFileSync(AUTH_STATE_FILE, "utf-8");
        const activeId = getActiveProfileId();
        await saveSessionStateCloud(cookiesStr, activeId || undefined);
        autoSyncSessionToProfiles(cookiesStr);
      }
    } catch (e) {
      console.error("Failed to update and sync storage state after successful session check:", (e as Error).message);
    }

    return { status: "success", message: "Session active" };
  } catch (error) {
    addLog("error", `Playwright login check execution failed: ${(error as Error).message}`);
    return { status: "failed", message: (error as Error).message };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function checkLoginReal(): Promise<{ status: "success" | "expired" | "captcha" | "failed"; message: string }> {
  return PlaywrightLock.acquire(async () => {
    const attempts = 2;
    let lastResult: { status: "success" | "expired" | "captcha" | "failed"; message: string } = { status: "failed", message: "Not started" };
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        if (attempt > 1) {
          addLog("warning", `[SESSION CONNECT RETRY] Session check or connection failed. Retrying connect (Attempt ${attempt}/${attempts}) in 3s...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        lastResult = await withTimeout(
          checkLoginRealInternal(),
          120000,
          "Playwright launch or session check timed out after 120 seconds"
        );
        if (lastResult.status === "success" || lastResult.status === "expired" || lastResult.status === "captcha") {
          return lastResult;
        }
        addLog("warning", `[SESSION CONNECT] Attempt ${attempt}/${attempts} returned status: ${lastResult.status} (${lastResult.message})`);
      } catch (err) {
        const errMsg = (err as Error).message;
        addLog("error", `[SESSION CONNECT] Exception on attempt ${attempt}: ${errMsg}`);
        lastResult = { status: "failed", message: errMsg };
      }
    }
    return lastResult;
  });
}

async function executeStartLogin(email: string, password: string): Promise<{ status: "success" | "requires_otp" | "captcha" | "failed"; message: string }> {
  loginState = { status: "authenticating", message: "Starting automated credentials login flow..." };
  return PlaywrightLock.acquire(async () => {
    if (activeLoginSession) {
      addLog("warning", "An active login session exists in memory. Closing it before starting a new one...");
      await activeLoginSession.browser.close().catch(() => {});
      activeLoginSession = null;
    }

    addLog("info", `Starting automated credentials login flow for email: ${email}...`);
    loginState = { status: "authenticating", message: `Initializing secure headless browser for email: ${email}...` };
    let browser: any = null;
    try {
      browser = await launchBrowserResilient({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-blink-features=AutomationControlled",
        ]
      });

      const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        viewport: { width: 1366, height: 768 },
        locale: "en-US",
        timezoneId: "America/New_York",
      });

      await context.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", {
          get: () => undefined,
        });
      });

      const page = await context.newPage();
      await setupPageResourceBlocking(page);

      let loginFormLoadedDirectly = false;
      addLog("info", "Attempting direct navigation to CoinMarketCap Login page...");
      loginState = { status: "authenticating", message: "Attempting direct navigation to CoinMarketCap Login page..." };
      try {
        await page.goto("https://coinmarketcap.com/login/", {
          waitUntil: "domcontentloaded",
          timeout: 30000
        });
        await page.waitForTimeout(3000);
        
        // Fast pre-verification: check if login fields are present
        const hasEmail = await page.$('input[type="email"], input[placeholder*="email" i], input[name="email"], #email');
        const hasPass = await page.$('input[type="password"], input[placeholder*="password" i], input[name="password"], #password');
        if (hasEmail && hasPass) {
          addLog("success", "Successfully loaded CoinMarketCap Login page directly!");
          loginFormLoadedDirectly = true;
        } else {
          addLog("warning", "Direct login page did not present login input boxes. Redirecting to home page workflow...");
        }
      } catch (directErr) {
        addLog("warning", `Direct login page navigation timed out or failed: ${(directErr as Error).message}. Using Home page workflow...`);
      }

      if (!loginFormLoadedDirectly) {
        addLog("info", "Navigating to CoinMarketCap Home page...");
        loginState = { status: "authenticating", message: "Navigating to CoinMarketCap Home page workflow..." };
        await page.goto("https://coinmarketcap.com/", {
          waitUntil: "domcontentloaded",
          timeout: 45000
        }).catch((err) => {
          addLog("warning", `Failed to load home page: ${err.message}. Retrying with Bitcoin page...`);
          return page.goto("https://coinmarketcap.com/currencies/bitcoin/", {
            waitUntil: "domcontentloaded",
            timeout: 45000
          });
        });

        await page.waitForTimeout(4000);

        // Dismiss any cookie banners, trading disclaimers, or overlays that might block clicking the Log in button
        addLog("info", "Checking for cookie banners or overlay pop-ups to dismiss...");
        const dismissButtons = [
          'button:has-text("Start Trading")',
          'button:has-text("Skip")',
          'button:has-text("Continue")',
          'button:has-text("Next")',
          'button:has-text("Accept All")',
          'button:has-text("Accept Cookies")',
          'button:has-text("Accept")',
          'button:has-text("Allow All")',
          'button:has-text("Got it")',
          'button:has-text("I agree")',
          '#onetrust-accept-btn-handler',
          '.optanon-allow-all',
          '#accept-cookie-policy',
          '.cmc-cookie-policy-banner__close',
          'button[aria-label="Close"]',
          '.close-btn',
          '.close'
        ];
        for (const selector of dismissButtons) {
          try {
            const btn = await page.$(selector);
            if (btn && await btn.isVisible()) {
              await btn.click({ timeout: 2000 }).catch(() => {});
              addLog("info", `Dismissed banner/pop-up using: ${selector}`);
              await page.waitForTimeout(500);
            }
          } catch {}
        }

        addLog("info", "Searching for the 'Log In' button/link on the page header...");
        let headerLoginBtn = null;
        const loginButtonSelectors = [
          'button:has-text("Log In")',
          'button:has-text("Log in")',
          'a:has-text("Log In")',
          'a:has-text("Log in")',
          'span:has-text("Log In")',
          'span:has-text("Log in")',
          '[data-testid="header-login-button"]',
          '[class*="login" i]',
          '[class*="log-in" i]',
          'div:has-text("Log In")',
          'div:has-text("Log in")'
        ];
        for (const sel of loginButtonSelectors) {
          try {
            const el = await page.$(sel);
            if (el && await el.isVisible()) {
              headerLoginBtn = el;
              addLog("info", `Found Log in trigger element using selector: "${sel}"`);
              break;
            }
          } catch {}
        }

        if (!headerLoginBtn) {
          // Robust heuristic fallback for finding the header/navigation login button
          const clickables = await page.$$("button, a, div[role='button'], span");
          for (const item of clickables) {
            try {
              if (await item.isVisible()) {
                const text = (await item.innerText().catch(() => "")).trim().toLowerCase();
                if (text === "log in" || text === "login" || text === "sign in" || text === "signin") {
                  headerLoginBtn = item;
                  addLog("info", `Found Log in trigger via innerText heuristic match: "${text}"`);
                  break;
                }
              }
            } catch {}
          }
        }

        if (headerLoginBtn) {
          addLog("info", "Clicking the 'Log In' button/link to launch login popup...");
          await clickResiliently(page, headerLoginBtn, "header login button");
          addLog("info", "Waiting for login modal popup to open...");
          await page.waitForTimeout(4000);
        } else {
          addLog("warning", "Could not locate a visible Log In button. Proceeding directly in case the modal/form is already present.");
        }
      }

      // Ensure the "Log In" tab is active inside the modal (CoinMarketCap sometimes defaults to "Sign Up" or "Create an account")
      try {
        const modalContainer = await page.$('div[role="dialog"], [class*="modal" i]');
        if (modalContainer) {
          const loginTab = await modalContainer.$('[data-test="user-modal__login-tab"], div[data-test="user-modal__login-tab"], button:has-text("Log In"), [role="tab"]:has-text("Log In"), span:has-text("Log In"), div:has-text("Log In")');
          if (loginTab && await loginTab.isVisible()) {
            await loginTab.click().catch(() => {});
            await page.waitForTimeout(600);
          }
        }
      } catch {}

      // Scan for email and password inputs specifically targeting visible inputs
      let emailInput = null;
      let passwordInput = null;

      // Retry finding elements up to 5 times with delay
      for (let i = 0; i < 5; i++) {
        const emailSelectors = [
          '[data-test="email-input"]',
          'input.email-input',
          '.email-input',
          'div[role="dialog"] input[type="email"]',
          'div[role="dialog"] input[placeholder*="email" i]',
          'input[type="email"]',
          'input[placeholder*="email" i]',
          'input[placeholder*="Email" i]',
          'input[name="email"]',
          '#email',
          '#username'
        ];
        for (const sel of emailSelectors) {
          try {
            const els = await page.$$(sel);
            for (const el of els) {
              if (await el.isVisible()) {
                emailInput = el;
                break;
              }
            }
            if (emailInput) break;
          } catch {}
        }

        const passwordSelectors = [
          '[data-test="password-input"]',
          'input.password-input',
          '.password-input',
          'div[role="dialog"] input[type="password"]',
          'div[role="dialog"] input[placeholder*="password" i]',
          'input[type="password"]',
          'input[placeholder*="password" i]',
          'input[placeholder*="Password" i]',
          'input[name="password"]',
          '#password'
        ];
        for (const sel of passwordSelectors) {
          try {
            const els = await page.$$(sel);
            for (const el of els) {
              if (await el.isVisible()) {
                passwordInput = el;
                break;
              }
            }
            if (passwordInput) break;
          } catch {}
        }

        if (emailInput && passwordInput) {
          break;
        }
        
        addLog("info", `Waiting for email/password input boxes to load (Attempt ${i + 1}/5)...`);
        loginState = { status: "authenticating", message: `Waiting for email/password input boxes to load (Attempt ${i + 1}/5)...` };
        await page.waitForTimeout(2000);
      }

      // Subframe fallback scanning
      if (!emailInput || !passwordInput) {
        addLog("info", "Inputs not found on main frame. Scanning subframes...");
        loginState = { status: "authenticating", message: "Inputs not found on main frame. Scanning subframes..." };
        for (const frame of page.frames()) {
          try {
            const elEmail = await frame.$('[data-test="email-input"], input.email-input, .email-input, input[type="email"], input[placeholder*="email" i]');
            const elPass = await frame.$('[data-test="password-input"], input.password-input, .password-input, input[type="password"], input[placeholder*="password" i]');
            if (elEmail && elPass && await elEmail.isVisible() && await elPass.isVisible()) {
              emailInput = elEmail;
              passwordInput = elPass;
              addLog("info", "Located login inputs inside a subframe!");
              break;
            }
          } catch {}
        }
      }

      if (!emailInput || !passwordInput) {
        addLog("error", "Failed to locate login credentials input boxes.");
        await browser.close().catch(() => {});
        return { status: "failed", message: "Login form inputs (email/password) not found on page." };
      }

      addLog("info", "Entering email and password securely...");
      loginState = { status: "authenticating", message: "Entering email and password securely..." };
      await fillInputResiliently(page, emailInput, email);
      await page.waitForTimeout(400);
      await fillInputResiliently(page, passwordInput, password);
      await page.waitForTimeout(400);

      // Locate the submit button strictly inside the login dialog/modal or enclosing form
      let loginBtn = null;
      try {
        const modalContainer = await page.$('div[role="dialog"], [class*="modal" i], form:has(input[type="password"])');
        if (modalContainer) {
          // Priority 1: Explicit type="submit" or specific login data-test attributes (NEVER tab headers)
          const explicitSubmit = await modalContainer.$('button[type="submit"], form button[type="submit"], [data-test="user-modal__login-btn"], [data-test="login-btn"], [data-test="login-button"]');
          if (explicitSubmit && await explicitSubmit.isVisible()) {
            loginBtn = explicitSubmit;
          } else {
            // Priority 2: Scan candidate buttons, strictly skipping Tab elements
            const candidateBtns = await modalContainer.$$('button, div[role="button"]');
            for (const btn of candidateBtns) {
              if (await btn.isVisible()) {
                const isTab = await btn.evaluate((el: HTMLElement) => {
                  const role = el.getAttribute('role');
                  const dt = el.getAttribute('data-test') || '';
                  const ariaSel = el.getAttribute('aria-selected');
                  const cl = el.className || '';
                  return role === 'tab' || dt.includes('tab') || ariaSel !== null || (typeof cl === 'string' && cl.includes('tab'));
                }).catch(() => false);
                if (isTab) continue; // Skip tab headers!

                const text = (await btn.innerText().catch(() => "")).trim().toLowerCase();
                if (text === "log in" || text === "login" || text === "sign in" || text === "signin") {
                  loginBtn = btn;
                  break;
                }
              }
            }
          }
        }
      } catch {}

      if (!loginBtn) {
        const btnSelectors = [
          'button[type="submit"]',
          'form button[type="submit"]',
          '[data-test="user-modal__login-btn"]',
          '[data-test="login-btn"]',
          '[data-test="login-button"]',
          '.cmc-login-btn',
        ];
        for (const sel of btnSelectors) {
          loginBtn = await page.$(sel);
          if (loginBtn && await loginBtn.isVisible()) break;
        }
      }

      // Check if button is disabled by React and force event dispatch if needed
      if (loginBtn) {
        try {
          const isBtnDisabled = await loginBtn.evaluate((b: HTMLElement) => b.hasAttribute('disabled') || b.classList.contains('BaseButton_disabled__t5Wcr'));
          if (isBtnDisabled) {
            addLog("info", "Re-triggering focus events to ensure form validation...");
            await emailInput.focus().catch(() => {});
            await page.keyboard.press("End").catch(() => {});
            await page.keyboard.press("Space").catch(() => {});
            await page.keyboard.press("Backspace").catch(() => {});
            await passwordInput.focus().catch(() => {});
            await page.keyboard.press("End").catch(() => {});
            await page.keyboard.press("Space").catch(() => {});
            await page.keyboard.press("Backspace").catch(() => {});
            await page.waitForTimeout(400);
          }
        } catch {}
      }

      // Listen for network API responses to capture exact backend error messages
      let apiErrorMsg = "";
      const apiResponseListener = async (response: any) => {
        try {
          const u = response.url();
          if (u.includes("login") || u.includes("auth") || u.includes("user")) {
            const status = response.status();
            const body = await response.json().catch(() => null);
            if (body) {
              if (body.status && body.status.error_message) {
                apiErrorMsg = body.status.error_message;
              } else if (body.message) {
                apiErrorMsg = body.message;
              } else if (body.error) {
                apiErrorMsg = typeof body.error === "string" ? body.error : JSON.stringify(body.error);
              }
            }
            if (status >= 400) {
              addLog("warning", `CoinMarketCap Auth API returned HTTP ${status}: ${apiErrorMsg || response.statusText()}`);
            }
          }
        } catch {}
      };
      page.on("response", apiResponseListener);

      addLog("info", "Submitting login form...");
      loginState = { status: "authenticating", message: "Submitting login form..." };

      // Submit form via both click and Enter key for maximum resilience
      try {
        if (loginBtn) {
          await loginBtn.click({ timeout: 5000 });
        } else {
          addLog("info", "Submit button not found directly, submitting via Enter key on password input...");
          await passwordInput.focus().catch(() => {});
          await passwordInput.press("Enter").catch(() => {});
        }
      } catch (clickErr) {
        addLog("warning", `Standard click failed, attempting Enter key submission: ${(clickErr as Error).message}`);
        await passwordInput.focus().catch(() => {});
        await passwordInput.press("Enter").catch(() => {});
      }
    
      addLog("info", "Processing credentials with CoinMarketCap...");
      loginState = { status: "authenticating", message: "Processing credentials with CoinMarketCap..." };

      let isSuccessEarly = false;
      let isOtpEarly = false;

      // Poll up to 35 seconds (70 x 500ms) for authentication cookies, localStorage, or OTP challenge
      for (let p = 0; p < 70; p++) {
        await page.waitForTimeout(500);

        const currentCookies = await context.cookies().catch(() => []);
        const hasAuthCookies = hasRealAuthCookies(currentCookies);

        const hasAvatar = await page.evaluate(() => {
          return document.querySelector('[data-test="header-avatar"], .user-avatar, img[alt*="avatar" i], [class*="avatar" i], a[href*="/account/"], [class*="user-icon" i]') !== null;
        }).catch(() => false);

        const isRedirectedHome = await page.evaluate(() => {
          const url = window.location.href;
          return !url.includes("/login") && !url.includes("/signin") && !url.includes("/auth");
        }).catch(() => false);

        const isModalGone = await page.evaluate(() => {
          const modal = document.querySelector('div[role="dialog"]');
          return !modal || (modal as HTMLElement).offsetParent === null;
        }).catch(() => false);

        const hasOtpField = await page.evaluate(() => {
          const inp = document.querySelector('input[placeholder*="code" i], input[placeholder*="verification" i], input[maxlength="6"], [data-test*="otp" i], [data-test*="verification" i]');
          const bodyText = (document.body.innerText || "").toLowerCase();
          return !!inp || bodyText.includes("verification code") || bodyText.includes("6-digit") || bodyText.includes("check your email");
        }).catch(() => false);

        if (hasOtpField) {
          isOtpEarly = true;
          break;
        }

        // Only declare early success if real auth cookies are confirmed AND either avatar appeared or modal closed and user redirected (with p >= 4 to allow network requests to settle)
        if (hasAuthCookies && (hasAvatar || (isModalGone && isRedirectedHome)) && p >= 4) {
          isSuccessEarly = true;
          break;
        }

        if (p % 10 === 0 && p > 0) {
          loginState = { status: "authenticating", message: `Processing authentication with CoinMarketCap (${Math.round((p / 70) * 100)}%)...` };
        }
      }

      if (isSuccessEarly) {
        addLog("success", "Authentication verified directly after credentials submission!");
        await context.storageState({ path: AUTH_STATE_FILE });
        addLog("success", `Saved login cookies session to ${AUTH_STATE_FILE}`);

        try {
          const cookiesStr = fs.readFileSync(AUTH_STATE_FILE, "utf-8");
          const activeId = getActiveProfileId();
          await saveSessionStateCloud(cookiesStr, activeId || undefined);
          await autoSyncSessionToProfiles(cookiesStr, email);
        } catch (e) {
          console.error("Failed to save session cookies to Firestore cloud or update profiles:", (e as Error).message);
        }

        await browser.close().catch(() => {});
        loginState = { status: "success", message: "Login successful! Session cookies saved and account profile activated." };
        botStatus = "Idle";
        return { status: "success", message: "Login successful! Session cookies saved and account profile activated." };
      }

      if (isOtpEarly) {
        addLog("warning", "CoinMarketCap requests 6-digit security verification code!");
        activeLoginSession = { browser, context, page, email };
        loginState = { status: "requires_otp", message: "A 6-digit verification code has been sent to your email. Please enter it to authorize." };
        return { status: "requires_otp", message: "A 6-digit code has been sent to your email. Please enter it to authorize." };
      }

      // Check if visible error is present inside modal with strict validation (must be genuine error text, not generic form labels)
      let modalErrorMessage = "";
      try {
        const errorSelectors = [
          '.error-message',
          '.errorMessage',
          '[class*="error-message" i]',
          '[class*="errorMessage" i]',
          '[class*="form-error" i]',
          '[class*="FormError" i]',
          '[role="alert"]',
        ];
        for (const sel of errorSelectors) {
          const errorEls = await page.$$(sel);
          for (const errorEl of errorEls) {
            const isVisible = await errorEl.isVisible().catch(() => false);
            if (!isVisible) continue;

            const rect = await errorEl.boundingBox().catch(() => null);
            if (!rect || rect.height < 5 || rect.width < 10) continue;

            const text = (await errorEl.innerText().catch(() => "")).trim();
            const lower = text.toLowerCase();
            // Filter out common false positives and non-error UI texts
            if (
              text &&
              !lower.includes("at least") &&
              !lower.includes("sign up") &&
              !lower.includes("log in") &&
              !lower.includes("forgot password") &&
              !lower.includes("continue with") &&
              !lower.includes("terms") &&
              !lower.includes("cookie") &&
              (lower.includes("wrong") || lower.includes("incorrect") || lower.includes("invalid") || lower.includes("failed") || lower.includes("not match") || lower.includes("error") || lower.includes("does not exist") || lower.includes("disabled") || lower.includes("locked"))
            ) {
              modalErrorMessage = text;
              addLog("warning", `Detected verified error message: "${text}"`);
              break;
            }
          }
          if (modalErrorMessage) break;
        }
      } catch {}

      // Pre-check cookies right now before navigating away
      const midCheckCookies = await context.cookies().catch(() => []);
      const midHasAuth = hasRealAuthCookies(midCheckCookies);

      if (midHasAuth) {
        addLog("success", "Verified authentic CoinMarketCap authorization cookies in browser context!");
        await context.storageState({ path: AUTH_STATE_FILE });
        addLog("success", `Saved login cookies session to ${AUTH_STATE_FILE}`);

        try {
          const cookiesStr = fs.readFileSync(AUTH_STATE_FILE, "utf-8");
          const activeId = getActiveProfileId();
          await saveSessionStateCloud(cookiesStr, activeId || undefined);
          await autoSyncSessionToProfiles(cookiesStr, email);
        } catch (e) {
          console.error("Failed to save session cookies to Firestore cloud or update profiles:", (e as Error).message);
        }

        await browser.close().catch(() => {});
        loginState = { status: "success", message: "Login successful! Session cookies saved and account profile activated." };
        botStatus = "Idle";
        return { status: "success", message: "Login successful! Session cookies saved and account profile activated." };
      }

      // Secondary verification on bitcoin community page
      addLog("info", "Performing secondary verification on community page...");
      loginState = { status: "authenticating", message: "Verifying live session cookies on CoinMarketCap community..." };
      try {
        await page.goto("https://coinmarketcap.com/currencies/bitcoin/", { waitUntil: "domcontentloaded", timeout: 25000 });
      } catch (_) {}
      await page.waitForTimeout(3000);

      const secondaryCookies = await context.cookies().catch(() => []);
      const hasSecondaryAuth = hasRealAuthCookies(secondaryCookies);

      const secondaryAvatar = await page.evaluate(() => {
        return document.querySelector('[data-test="header-avatar"], .user-avatar, img[alt*="avatar" i], [class*="avatar" i], a[href*="/account/"], [class*="user-icon" i]') !== null;
      }).catch(() => false);

      const secondaryEditor = await locateAndPrepareCommentEditor(page).catch(() => null);
      const editorRequiresLogin = await isEditorPostButtonRequiringLogin(page);

      if (!editorRequiresLogin && (hasSecondaryAuth || (secondaryAvatar && secondaryEditor))) {
        addLog("success", "Successfully authenticated and verified community access!");
        await context.storageState({ path: AUTH_STATE_FILE });
        addLog("success", `Saved login cookies session to ${AUTH_STATE_FILE}`);

        try {
          const cookiesStr = fs.readFileSync(AUTH_STATE_FILE, "utf-8");
          const activeId = getActiveProfileId();
          await saveSessionStateCloud(cookiesStr, activeId || undefined);
          await autoSyncSessionToProfiles(cookiesStr, email);
        } catch (e) {
          console.error("Failed to save session cookies to Firestore cloud or update profiles:", (e as Error).message);
        }

        await browser.close().catch(() => {});
        loginState = { status: "success", message: "Login successful! Session cookies saved and account profile activated." };
        botStatus = "Idle";
        return { status: "success", message: "Login successful! Session cookies saved and account profile activated." };
      }

      await saveDebugScreenshot(page, "credentials_login_failed");
      await browser.close().catch(() => {});
      
      const finalMsg = modalErrorMessage 
        ? `Login failed: ${modalErrorMessage}` 
        : (editorRequiresLogin ? "Login incomplete: CoinMarketCap still prompts to Log In on the community page. Please verify your credentials or check for an email verification code." : "Credentials submitted, but CoinMarketCap did not establish an active session. Please check your email and password, or paste your state.json cookies directly.");
      loginState = { status: "failed", message: finalMsg };
      botStatus = "Idle";
      return { status: "failed", message: finalMsg };

  } catch (error) {
    const errMsg = (error as Error).message;
    addLog("error", `Exception in interactive login flow: ${errMsg}`);
    if (browser) {
      await browser.close().catch(() => {});
    }
    loginState = { status: "failed", message: errMsg };
    return { status: "failed", message: errMsg };
  }
  });
}

async function executeSubmitOtp(otp: string): Promise<{ status: "success" | "failed"; message: string }> {
  loginState = { status: "authenticating", message: "Submitting verification code..." };
  return PlaywrightLock.acquire(async () => {
  if (!activeLoginSession) {
    addLog("error", "No active login session in memory to submit verification code.");
    loginState = { status: "failed", message: "No active login session in progress." };
    return { status: "failed", message: "No active login session in progress." };
  }

  const { browser, context, page, email } = activeLoginSession;
  if (browser && !browser.isConnected()) {
    addLog("error", "Active login session browser has been disconnected or closed. Please restart the login process.");
    activeLoginSession = null;
    loginState = { status: "failed", message: "Login session expired or browser disconnected. Please start login again." };
    return { status: "failed", message: "Login session expired or browser disconnected. Please start login again." };
  }

  addLog("info", `Submitting 6-digit verification code: ${otp} for email: ${email}...`);
  loginState = { status: "authenticating", message: `Submitting 6-digit verification code: ${otp}...` };

  try {
    const cleanOtp = otp.trim();
    let codeInput = null;

    // Check if CoinMarketCap renders segmented single-digit boxes (e.g. 6 separate inputs)
    const segmentedBoxes = await page.$$('input[maxlength="1"], input[data-index], input[name*="code" i], input[type="tel"]');
    const visibleBoxes: any[] = [];
    for (const box of segmentedBoxes) {
      if (await box.isVisible()) {
        visibleBoxes.push(box);
      }
    }

    if (visibleBoxes.length >= 4) {
      addLog("info", `Detected ${visibleBoxes.length} segmented OTP digit boxes. Filling each digit individually...`);
      for (let i = 0; i < Math.min(visibleBoxes.length, cleanOtp.length); i++) {
        await visibleBoxes[i].click().catch(() => {});
        await visibleBoxes[i].focus().catch(() => {});
        await visibleBoxes[i].fill(cleanOtp[i]).catch(() => {});
        await page.waitForTimeout(60);
      }
      codeInput = visibleBoxes[0];
    } else {
      const codeSelectors = [
        'input[placeholder*="code" i]',
        'input[placeholder*="verification" i]',
        'input[placeholder*="OTP" i]',
        'input[maxlength="6"]',
        'input[type="text"]',
        'input[type="number"]',
      ];

      for (const sel of codeSelectors) {
        const inputs = await page.$$(sel);
        for (const input of inputs) {
          if (await input.isVisible()) {
            codeInput = input;
            break;
          }
        }
        if (codeInput) break;
      }

      if (!codeInput) {
        codeInput = await page.$('input:not([type="hidden"])');
      }

      if (!codeInput) {
        addLog("error", "Failed to locate security code input field.");
        await browser.close().catch(() => {});
        activeLoginSession = null;
        return { status: "failed", message: "Could not find the security code input box." };
      }

      await fillInputResiliently(page, codeInput, cleanOtp);
      await page.waitForTimeout(500);
    }

    let submitBtn = null;
    const submitBtnSelectors = [
      'button[type="submit"]',
      'button:has-text("Confirm")',
      'button:has-text("Submit")',
      'button:has-text("Verify")',
      'button:has-text("Log In")',
      'form button',
    ];
    for (const sel of submitBtnSelectors) {
      const btns = await page.$$(sel);
      for (const btn of btns) {
        if (await btn.isVisible()) {
          submitBtn = btn;
          break;
        }
      }
      if (submitBtn) break;
    }

    if (submitBtn) {
      addLog("info", "Clicking security code submit button...");
      try {
        await submitBtn.click({ timeout: 5000 });
      } catch (clickErr) {
        addLog("warning", `Standard click on security submit button failed: ${(clickErr as Error).message}. Trying forced click...`);
        try {
          await submitBtn.click({ force: true, timeout: 5000 });
        } catch (forceErr) {
          addLog("warning", `Forced click failed: ${(forceErr as Error).message}. Trying evaluate click fallback...`);
          await submitBtn.evaluate((el: any) => (el as HTMLElement).click()).catch(() => {});
        }
      }
    } else {
      addLog("info", "No confirm button found, pressing Enter...");
      await codeInput.press("Enter");
    }

    addLog("info", "Waiting for authentication submission to complete (up to 10 seconds)...");
    loginState = { status: "authenticating", message: "Waiting for verification code submission response..." };
    await page.waitForTimeout(10000);

    // Verify successful session
    addLog("info", "Navigating to CoinMarketCap to verify session active state...");
    loginState = { status: "authenticating", message: "Navigating to verify session active state..." };
    await page.goto("https://coinmarketcap.com/currencies/bitcoin/", { waitUntil: "domcontentloaded", timeout: 35000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Use our robust locateAndPrepareCommentEditor to check if we can access the editor
    const editor = await locateAndPrepareCommentEditor(page);
    
    // Also check if any header Log In buttons are visible on the page
    let isHeaderLoginVisible = false;
    const headerLoginSelectors = [
      'button:has-text("Log In")',
      'button:has-text("Log in")',
      'a:has-text("Log In")',
      'a:has-text("Log in")',
      '[data-testid="header-login-button"]'
    ];
    for (const sel of headerLoginSelectors) {
      try {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          isHeaderLoginVisible = true;
          break;
        }
      } catch {}
    }

    const editorRequiresLogin = await isEditorPostButtonRequiringLogin(page);
    const cookiesList = await context.cookies().catch(() => []);
    const hasAuthCookie = hasRealAuthCookies(cookiesList);

    if (!editorRequiresLogin && (hasAuthCookie || (editor && !isHeaderLoginVisible))) {
      addLog("success", "OTP verification successful! Session is fully active!");
      await context.storageState({ path: AUTH_STATE_FILE });
      addLog("success", `Saved authorized session cookies to ${AUTH_STATE_FILE}`);
      
      // Sync successfully saved session to Cloud and Auto-Update Profiles
      try {
        const cookiesStr = fs.readFileSync(AUTH_STATE_FILE, "utf-8");
        const activeId = getActiveProfileId();
        await saveSessionStateCloud(cookiesStr, activeId || undefined);
        autoSyncSessionToProfiles(cookiesStr, email);
      } catch (e) {
        console.error("Failed to save session cookies to Firestore cloud or update profiles:", (e as Error).message);
      }

      await browser.close().catch(() => {});
      activeLoginSession = null;
      loginState = { status: "success", message: "Successfully verified and logged in! State loaded." };
      return { status: "success", message: "Successfully verified and logged in! State loaded." };
    } else {
      let otpErrorMsg = "";
      try {
        const errEl = await page.$('.error-message, [class*="error-message" i], [class*="errorMessage" i], [role="alert"]');
        if (errEl && await errEl.isVisible()) {
          otpErrorMsg = (await errEl.innerText().catch(() => "")).trim();
        }
      } catch {}
      const failMessage = otpErrorMsg ? `Verification failed: ${otpErrorMsg}` : "Verification code failed or expired. Please try logging in again.";
      addLog("error", `Code submission completed, but verification failed: ${failMessage}`);
      await saveDebugScreenshot(page, "otp_verification_failed");
      await browser.close().catch(() => {});
      activeLoginSession = null;
      loginState = { status: "failed", message: failMessage };
      return { status: "failed", message: failMessage };
    }

  } catch (error) {
    addLog("error", `Exception during OTP submission: ${(error as Error).message}`);
    await browser.close().catch(() => {});
    activeLoginSession = null;
    return { status: "failed", message: (error as Error).message };
  }
  });
}

async function executeCancelLogin(): Promise<void> {
  if (activeLoginSession) {
    addLog("warning", "Manually cancelling and closing active login session...");
    await activeLoginSession.browser.close().catch(() => {});
    activeLoginSession = null;
  }
}

async function runRealPostingInternal(url: string, message: string, sentiment: string, sharedBrowser?: any): Promise<{ status: "success" | "expired" | "captcha" | "failed" | "retry"; message: string }> {
  let browser: any = sharedBrowser || null;
  let ownsBrowser = !sharedBrowser;
  
  if (browser && !browser.isConnected()) {
    addLog("warning", "Provided shared browser instance is disconnected. Discarding it and launching fresh on-demand instance...");
    browser = null;
    ownsBrowser = true;
  }

  let context: any = null;
  let page: any = null;
  
  try {
    if (!browser) {
      addLog("info", "Playwright launching headlessly with stealth configurations...");
      browser = await launchBrowserResilient({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-blink-features=AutomationControlled",
        ]
      });
    } else {
      addLog("info", "Re-using existing active Playwright browser instance for posting task.");
    }

    // Extract fingerprint details from user's state.json to maximize session authenticity
    const { userAgent, timezoneId, locale } = extractFingerprintDetails(AUTH_STATE_FILE);

    addLog("info", `Loading browser context storage state from auth/state.json with fingerprint settings (User-Agent: ${userAgent.substring(0, 40)}..., Timezone: ${timezoneId}, Locale: ${locale})...`);
    context = await browser.newContext({
      storageState: AUTH_STATE_FILE,
      userAgent,
      viewport: { width: 1366, height: 768 },
      locale,
      timezoneId,
    });

    // Stealth: hide webdriver property
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    page = await context.newPage();
    
    // Set explicit navigation and operation timeouts to 90 seconds (Guideline 9)
    page.setDefaultNavigationTimeout(90000);
    page.setDefaultTimeout(90000);

    await setupPageResourceBlocking(page);
    addLog("info", `Navigating to target coin URL: ${url}`);
    
    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 90000
      });
    } catch (gotoErr) {
      addLog("warning", `Target coin page navigation timeout/warning (continuing anyway to check elements): ${(gotoErr as Error).message}`);
    }
    
    // Wait for the page to settle
    await page.waitForTimeout(2000);
    
    // Scan page for the comment editor
    const editor = await locateAndPrepareCommentEditor(page);

    if (!editor) {
      await saveDebugScreenshot(page, "posting_editor_not_found");
      
      const currentUrl = page.url();
      if (currentUrl.includes("/login") || currentUrl.includes("/signin") || currentUrl.includes("/auth")) {
        addLog("error", `Session-verify check failed: Redirected to login page (${currentUrl})`);
        return { status: "expired", message: "Session expired: Redirected to login page" };
      }

      const title = await page.title().catch(() => "");
      const hasCfTitle = title.includes("Cloudflare") || title.includes("Just a moment");
      const hasCfSelectors = await page.$('#challenge-running, #challenge-stage, .cf-turnstile').catch(() => null);
      
      if (hasCfTitle || hasCfSelectors) {
        addLog("error", "CRITICAL: Cloudflare Turnstile human challenge detected on posting page!");
        return { status: "captcha", message: "Cloudflare Turnstile captcha block" };
      }

      const loginBtn = await page.$('button:has-text("Log In"), button:has-text("Sign Up")');
      if (loginBtn && await loginBtn.isVisible()) {
        addLog("error", "Session expired or logged out. Found active 'Log In' or 'Sign Up' buttons.");
        return { status: "expired", message: "Not logged in - Session expired" };
      }

      addLog("error", "Could not locate the post comment editor input box on the page.");
      return { status: "failed", message: "Comment editor element not found on coin page" };
    }

    addLog("success", "Session check passed! Comment editor located successfully on posting page.");
    
    const finalComment = message;
    // Item 13: Check if this specific comment was already published in recent feed
    try {
      const isAlreadyPosted = await page.evaluate((textSnippet: string) => {
        const feed = document.querySelector('.community-feed, [class*="feed" i], [class*="comment" i], [class*="post-list" i], main');
        const targetText = feed ? (feed as HTMLElement).innerText : document.body.innerText;
        return targetText.includes(textSnippet);
      }, finalComment.slice(0, 35));

      if (isAlreadyPosted) {
        addLog("warning", `Detected comment text snippet already published on this coin's community feed. Skipping duplicate submission.`);
        return { status: "success", message: "Comment already published on community feed" };
      }
    } catch (_) {}

    // Focus, write message naturally
    addLog("info", `Editor field focused. Typing comment: "${finalComment}"`);
    await clickResiliently(page, editor, "comment editor input box");
    await page.waitForTimeout(300);
    
    // Clear existing text just in case, then type
    addLog("info", "Clearing previous text and typing the comment resiliently...");
    try {
      await editor.focus();
      await editor.fill(""); // Try clearing
    } catch {}
    
    try {
      await editor.type(finalComment, { delay: 15 });
      // CoinMarketCap displays a coin tag autocomplete popup when "$" is typed.
      // Pressing Escape or space dismisses the autocomplete popup while retaining the $TAG.
      await page.waitForTimeout(300);
      await page.keyboard.press("Escape").catch(() => {});
    } catch (e) {
      addLog("warning", `Direct typing failed: ${(e as Error).message}. Using page.evaluate fallback...`);
      try {
        await editor.evaluate((el: any, msg: string) => {
          const element = el as HTMLElement;
          element.focus();
          if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
            (element as any).value = msg;
          } else {
            element.innerText = msg;
          }
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }, finalComment);
      } catch (errEval) {
        addLog("error", `Fallback typing failed: ${(errEval as Error).message}`);
        throw errEval;
      }
    }
    await page.waitForTimeout(300);
    
    // Find and toggle sentiment (Bullish or Bearish)
    const isBullish = sentiment !== "bearish";
    const sentimentSelectors = isBullish ? [
      '[data-test="editor-bullish-button"]',
      'button:has-text("Bullish")',
      'span:has-text("Bullish")',
      '.bullish-button',
      '[class*="bullish" i]'
    ] : [
      '[data-test="editor-bearish-button"]',
      'button:has-text("Bearish")',
      'span:has-text("Bearish")',
      '.bearish-button',
      '[class*="bearish" i]'
    ];
    let sentimentBtn = null;
    for (const selector of sentimentSelectors) {
      sentimentBtn = await page.$(selector);
      if (sentimentBtn) {
        addLog("info", `Found ${isBullish ? "bullish" : "bearish"} sentiment toggle using: ${selector}`);
        break;
      }
    }
    if (sentimentBtn) {
      addLog("info", `Clicking ${isBullish ? "bullish" : "bearish"} sentiment toggle...`);
      await clickResiliently(page, sentimentBtn, `${isBullish ? "bullish" : "bearish"} sentiment toggle button`);
      await page.waitForTimeout(300);
    } else {
      addLog("warning", `Could not find ${isBullish ? "bullish" : "bearish"} sentiment toggle button.`);
    }
    
    // Find Post submit button
    const postButtonSelectors = [
      '[data-test="editor-post-button"]',
      'button:has-text("Post")',
      'button:has-text("Submit")',
      'button:has-text("Comment")',
      'button.editor-post-button',
      '.editor-post-button'
    ];
    let postBtn = null;
    for (const selector of postButtonSelectors) {
      postBtn = await page.$(selector);
      if (postBtn) {
        addLog("info", `Found submit button using: ${selector}`);
        break;
      }
    }

    if (!postBtn) {
      addLog("error", "Post submission button is missing on page.");
      await saveDebugScreenshot(page, "post_button_missing");
      return { status: "failed", message: "Post submission button missing" };
    }
    
    const buttonText = await postBtn.innerText().catch(() => "");
    if (buttonText.toLowerCase().includes("log in") || buttonText.toLowerCase().includes("signin")) {
      addLog("error", "Post button indicates user is logged out.");
      await saveDebugScreenshot(page, "logged_out_post_btn");
      return { status: "expired", message: "Post button text is Log In" };
    }
    
    addLog("info", "Clicking post submission button...");
    await clickResiliently(page, postBtn, "post submission button");
    
    // Wait for submission to process
    await page.waitForTimeout(3000);
    
    // Item 12: Scope rate-limit detection near comment editor, toast alerts, or feedback containers
    let isRateLimited = false;
    let rateLimitMsg = "";
    try {
      const feedbackContainers = await page.$$('[role="alert"], [class*="toast" i], [class*="notification" i], [class*="feedback" i], [class*="error" i], [class*="alert" i], [data-test="editor-error"], .editor-area, form');
      for (const fc of feedbackContainers) {
        if (await fc.isVisible().catch(() => false)) {
          const txt = (await fc.innerText().catch(() => "")).toLowerCase();
          if (txt.includes("frequent") || txt.includes("too fast") || txt.includes("rate limit") || txt.includes("seconds before") || txt.includes("please wait")) {
            isRateLimited = true;
            rateLimitMsg = txt;
            break;
          }
        }
      }
    } catch (_) {}

    if (isRateLimited) {
      addLog("warning", `Rate limit warning detected near comment editor: "${rateLimitMsg.slice(0, 60)}"`);
      await saveDebugScreenshot(page, "rate_limited_submission");
      return { status: "retry", message: "Rate limited on submission" };
    }
    
    addLog("success", "Successfully submitted post via Playwright browser context!");
    await saveDebugScreenshot(page, "success_post_screenshot");

    // Save refreshed storageState back to maintain session longevity
    try {
      await context.storageState({ path: AUTH_STATE_FILE });
      if (fs.existsSync(AUTH_STATE_FILE)) {
        const cookiesStr = fs.readFileSync(AUTH_STATE_FILE, "utf-8");
        const activeId = getActiveProfileId();
        await saveSessionStateCloud(cookiesStr, activeId || undefined);
        autoSyncSessionToProfiles(cookiesStr);
      }
    } catch (e) {
      console.error("Failed to update and sync storage state after successful post:", (e as Error).message);
    }

    return { status: "success", message: "Posted successfully" };
  } catch (error) {
    addLog("error", `Playwright posting execution failed: ${(error as Error).message}`);
    return { status: "failed", message: (error as Error).message };
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
    if (context) {
      await context.close().catch(() => {});
    }
    if (browser && ownsBrowser) {
      await browser.close().catch(() => {});
    }
  }
}

async function resolveToFirstPartyUrl(originalUrl: string, symbol: string, name: string): Promise<string> {
  if (!originalUrl || !originalUrl.includes("dex.coinmarketcap.com")) {
    return originalUrl;
  }

  addLog("info", `Target URL is on DEX Scan: ${originalUrl}. Resolving to standard CoinMarketCap Currencies URL...`);
  
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  };

  let matchedSlug: string | null = null;

  // Step 1: Try searching Suggest API by token contract address extracted from DEX URL
  try {
    const parts = originalUrl.split("/").filter(Boolean);
    const address = parts[parts.length - 1];
    if (address && address.length > 5 && !address.includes(".") && !address.includes("coinmarketcap")) {
      addLog("info", `Searching CMC Suggest API by token contract address: ${address}...`);
      const apiRes = await fetch(`https://api.coinmarketcap.com/data-api/v3/search/suggest?keyword=${encodeURIComponent(address)}`, { headers });
      if (apiRes.ok) {
        const json = await apiRes.json() as any;
        const suggestions = json?.data?.cryptoSuggestions || [];
        if (suggestions.length > 0 && suggestions[0].slug) {
          matchedSlug = suggestions[0].slug;
          addLog("info", `Found slug via contract address search: ${matchedSlug}`);
        }
      }
    }
  } catch (err) {
    addLog("warning", `Error searching by contract address: ${(err as Error).message}`);
  }

  // Step 2: Try Suggest API by symbol
  if (!matchedSlug) {
    try {
      const apiRes = await fetch(`https://api.coinmarketcap.com/data-api/v3/search/suggest?keyword=${encodeURIComponent(symbol)}`, { headers });
      if (apiRes.ok) {
        const json = await apiRes.json() as any;
        const suggestions = json?.data?.cryptoSuggestions || [];
        const matched = suggestions.find((s: any) => 
          s.symbol?.toLowerCase() === symbol.toLowerCase() || 
          s.name?.toLowerCase() === name.toLowerCase()
        );
        if (matched && matched.slug) {
          matchedSlug = matched.slug;
          addLog("info", `Found slug via symbol search: ${matchedSlug}`);
        }
      }
    } catch (err) {
      addLog("warning", `Error with Suggest API: ${(err as Error).message}`);
    }
  }

  // Step 3: Verify the resolved slug and build standard URL
  if (matchedSlug) {
    const resolvedUrl = `https://coinmarketcap.com/currencies/${matchedSlug}/`;
    // Verify resolved URL exists by fetching it
    const checkRes = await fetch(resolvedUrl, { method: "HEAD", headers }).catch(() => null);
    if (checkRes && checkRes.status === 200) {
      addLog("success", `Successfully resolved DEX token to active first-party URL: ${resolvedUrl}`);
      return resolvedUrl;
    }
  }

  // Fallback 1: try constructing slug directly and checking if it exists
  const cleanSlug = name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  
  const constructedUrl = `https://coinmarketcap.com/currencies/${cleanSlug}/`;
  try {
    const checkRes = await fetch(constructedUrl, { method: "HEAD", headers }).catch(() => null);
    if (checkRes && checkRes.status === 200) {
      addLog("success", `Resolved to constructed first-party URL: ${constructedUrl}`);
      return constructedUrl;
    }
  } catch {}

  // Fallback 2: try appending the symbol or chain
  const constructedUrlWithSymbol = `https://coinmarketcap.com/currencies/${cleanSlug}-${symbol.toLowerCase()}/`;
  try {
    const checkRes = await fetch(constructedUrlWithSymbol, { method: "HEAD", headers }).catch(() => null);
    if (checkRes && checkRes.status === 200) {
      addLog("success", `Resolved to constructed first-party URL with symbol: ${constructedUrlWithSymbol}`);
      return constructedUrlWithSymbol;
    }
  } catch {}

  // If all first-party verification checks fail, we fall back to the original DEX URL
  addLog("warning", `Could not find verified first-party URL for ${name} (${symbol}). Reverting to original DEX URL.`);
  return originalUrl;
}

async function runRealPosting(url: string, message: string, sentiment: string, sharedBrowser?: any): Promise<{ status: "success" | "expired" | "captcha" | "failed" | "retry" | "skipped"; message: string }> {
  if (!url || url.includes("dex.coinmarketcap.com")) {
    addLog("warning", `Skipping DEX Scan URL: ${url} (DEX Scan pages do not support community postings)`);
    return { status: "skipped", message: "Cannot post on DEX Scan pages" };
  }

  return PlaywrightLock.acquire(async () => {
    const attempts = 2; // Reduced from 3 to 2 for faster execution cycle
    let lastResult: { status: "success" | "expired" | "captcha" | "failed" | "retry" | "skipped"; message: string } = { status: "failed", message: "Not started" };
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        if (attempt > 1) {
          if (lastResult.status === "retry") {
            addLog("warning", `[RATE LIMIT DELAY] Submission rate limited. Waiting 30s before retry attempt ${attempt}/${attempts} to clear CoinMarketCap rate limit...`);
            await new Promise(resolve => setTimeout(resolve, 30000));
          } else {
            addLog("warning", `[POST CONNECT RETRY] Connection or load failed. Retrying connect and post (Attempt ${attempt}/${attempts}) in 5s...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
        const rawResult = await runRealPostingInternal(url, message, sentiment, sharedBrowser);
        lastResult = rawResult as any;
        if (lastResult.status === "success" || lastResult.status === "captcha" || lastResult.status === "expired" || lastResult.status === "skipped") {
          return lastResult;
        }
        addLog("warning", `[POST CONNECT] Attempt ${attempt}/${attempts} returned status: ${lastResult.status} (${lastResult.message})`);
      } catch (err) {
        addLog("error", `[POST CONNECT] Exception on attempt ${attempt}: ${(err as Error).message}`);
        lastResult = { status: "failed", message: (err as Error).message };
      }
    }
    return lastResult;
  });
}

// Load Helper Functions
function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content) as T;
    }
  } catch (error) {
    addLog("error", `Failed to read ${path.basename(filePath)}: ${(error as Error).message}`);
  }
  return defaultValue;
}

async function autoSyncSessionToProfiles(stateJson: string, email?: string) {
  try {
    if (!stateJson || !stateJson.trim()) return;
    JSON.parse(stateJson);
    
    let profiles = readJsonFile<any[]>(PROFILES_FILE, []);
    const cleanEmail = email ? email.trim() : "";
    
    // Check if a profile with this email or name already exists
    const existingIdx = cleanEmail 
      ? profiles.findIndex(p => p.name.toLowerCase() === cleanEmail.toLowerCase())
      : -1;

    if (existingIdx >= 0) {
      // Deactivate other profiles and update this specific profile
      profiles = profiles.map(p => ({ ...p, isActive: false }));
      profiles[existingIdx].stateJson = stateJson;
      profiles[existingIdx].isActive = true;
      profiles[existingIdx].loginStatus = "logged_in";
      profiles[existingIdx].updatedAt = new Date().toISOString();
      addLog("success", `Automatically updated account profile: "${profiles[existingIdx].name}" with new session cookies and activated it.`);
    } else if (cleanEmail) {
      // Check if we reached the maximum of 5 accounts
      if (profiles.length >= 5) {
        addLog("warning", `Maximum limit of 5 accounts reached. Cannot auto-create profile for "${cleanEmail}". Please delete an old account.`);
        return;
      }
      // Deactivate all others and create a brand new profile for this new account
      profiles = profiles.map(p => ({ ...p, isActive: false }));
      const profileId = cleanEmail.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-") || `profile-${Date.now()}`;
      const newProfile = {
        id: profileId,
        name: cleanEmail,
        stateJson,
        isActive: true,
        loginStatus: "logged_in",
        updatedAt: new Date().toISOString()
      };
      profiles.push(newProfile);
      addLog("success", `Automatically created and activated new account profile: "${cleanEmail}"`);
    } else {
      // Fallback when no email was provided (e.g. raw cookie paste)
      const activeIdx = profiles.findIndex(p => p.isActive);
      if (activeIdx >= 0) {
        profiles[activeIdx].stateJson = stateJson;
        profiles[activeIdx].loginStatus = "logged_in";
        profiles[activeIdx].updatedAt = new Date().toISOString();
        addLog("success", `Automatically updated active account profile: "${profiles[activeIdx].name}" with new session cookies.`);
      } else {
        const name = getNextImportedAccountName(profiles);
        profiles = profiles.map(p => ({ ...p, isActive: false }));
        const profileId = name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-") || `profile-${Date.now()}`;
        profiles.push({
          id: profileId,
          name,
          stateJson,
          isActive: true,
          loginStatus: "logged_in",
          updatedAt: new Date().toISOString()
        });
        addLog("success", `Automatically created and activated new account profile: "${name}"`);
      }
    }
    
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
    updateActiveProfilePaths();
    
    // Sync to Cloud
    await saveProfilesCloud(profiles);
  } catch (error) {
    console.error("Error during autoSyncSessionToProfiles:", (error as Error).message);
  }
}

async function writeJsonFile<T>(filePath: string, data: T) {
  const tempPath = `${filePath}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tempPath, filePath);

    const activeId = getActiveProfileId();

    // Synchronize to Firestore Cloud Database
    if (filePath === AUTH_STATE_FILE) {
      try {
        await saveSessionStateCloud(JSON.stringify(data), activeId || undefined);
      } catch (err) {
        console.error("[FIREBASE] Error syncing session to cloud:", (err as Error).message);
      }
    } else if (filePath === LAST_TRENDING_FILE) {
      try {
        await saveTrendingCoinsCloud(data as any, activeId || undefined);
      } catch (err) {
        console.error("[FIREBASE] Error syncing coins to cloud:", (err as Error).message);
      }
    } else if (filePath === GENERATED_MESSAGES_FILE) {
      try {
        await saveGeneratedMessagesCloud(data as any, activeId || undefined);
      } catch (err) {
        console.error("[FIREBASE] Error syncing messages to cloud:", (err as Error).message);
      }
    } else if (filePath === RESULTS_FILE) {
      try {
        await savePostResultsCloud(data as any, activeId || undefined);
      } catch (err) {
        console.error("[FIREBASE] Error syncing results to cloud:", (err as Error).message);
      }
    } else if (filePath === POST_PROGRESS_FILE) {
      const progressObj = data as any;
      try {
        await saveBotProgressCloud(progressObj, activeId || undefined);
      } catch (err) {
        console.error("[FIREBASE] Error syncing progress to cloud:", (err as Error).message);
      }
    }
  } catch (error) {
    addLog("error", `Failed to write atomically to ${path.basename(filePath)}: ${(error as Error).message}`);
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }
  }
}

let lastCloudSyncTime = 0;
const CLOUD_SYNC_THROTTLE_MS = 5000; // 5 seconds throttle

async function syncLocalFromCloudIfStale(force = false) {
  const now = Date.now();
  if (!force && (now - lastCloudSyncTime < CLOUD_SYNC_THROTTLE_MS)) {
    return; // Already synced recently
  }
  lastCloudSyncTime = now;
  try {
    const activeId = getActiveProfileId();
    if (!activeId) {
      return; // No active profile, do not sync profile-scoped data
    }

    // Always ensure paths are aligned with the active profile FIRST before any sync operations
    updateActiveProfilePaths();

    // 1. Trending Coins
    const localCoins = readJsonFile<any[]>(LAST_TRENDING_FILE, []);
    const cloudCoins = await getTrendingCoinsCloud(activeId || undefined);
    if (localCoins.length > 0) {
      // Local has active coins for this profile, ensure cloud has them
      saveTrendingCoinsCloud(localCoins, activeId || undefined).catch(() => {});
    } else if (cloudCoins && Array.isArray(cloudCoins) && cloudCoins.length > 0) {
      // Local is empty, hydrate from cloud
      fs.writeFileSync(LAST_TRENDING_FILE, JSON.stringify(cloudCoins, null, 2), "utf-8");
    }

    // 2. Generated Messages
    const localMessages = readJsonFile<any[]>(GENERATED_MESSAGES_FILE, []);
    const cloudMessages = await getGeneratedMessagesCloud(activeId || undefined);
    if (localMessages.length > 0) {
      saveGeneratedMessagesCloud(localMessages, activeId || undefined).catch(() => {});
    } else if (cloudMessages && Array.isArray(cloudMessages) && cloudMessages.length > 0) {
      fs.writeFileSync(GENERATED_MESSAGES_FILE, JSON.stringify(cloudMessages, null, 2), "utf-8");
    }

    // 3. Post Results (Skip overwriting if posting is active to prevent race conditions)
    if (!isPostingRunning) {
      const localResults = readJsonFile<any[]>(RESULTS_FILE, []);
      const cloudResults = await getPostResultsCloud(activeId || undefined);
      if (localResults.length > 0) {
        // Local results exist (e.g. recent posts) - local is authoritative, persist to cloud
        savePostResultsCloud(localResults, activeId || undefined).catch(() => {});
      } else if (cloudResults && Array.isArray(cloudResults) && cloudResults.length > 0) {
        // Local is empty and cloud has previous history for this profile - hydrate
        fs.writeFileSync(RESULTS_FILE, JSON.stringify(cloudResults, null, 2), "utf-8");
      }

      // 4. Bot Progress (Skip overwriting if posting is active)
      const cloudProgress = await getBotProgressCloud(activeId || undefined);
      const localProgress = readBotProgress();
      if (typeof localProgress.next_index === "number" && localProgress.next_index > 0) {
        saveBotProgressCloud(localProgress, activeId || undefined).catch(() => {});
      } else if (cloudProgress && typeof cloudProgress.next_index === "number") {
        const merged = {
          ...localProgress,
          next_index: cloudProgress.next_index,
          daily_post_count: cloudProgress.daily_post_count !== undefined ? cloudProgress.daily_post_count : localProgress.daily_post_count,
          last_post_date: cloudProgress.last_post_date || localProgress.last_post_date,
          daily_post_limit: cloudProgress.daily_post_limit || localProgress.daily_post_limit || getAccountDailyPostLimit(activeId)
        };
        fs.writeFileSync(POST_PROGRESS_FILE, JSON.stringify(merged, null, 2), "utf-8");
        currentPostingIndex = cloudProgress.next_index;
      }
    }

    // 5. Profiles (Refresh active profile paths while preserving current local active selection)
    const cloudProfiles = await getProfilesCloud();
    if (cloudProfiles && Array.isArray(cloudProfiles) && cloudProfiles.length > 0) {
      const currentActiveId = getActiveProfileId();
      const localProfiles = readJsonFile<any[]>(PROFILES_FILE, []);
      
      const mergedProfiles = cloudProfiles.map((cp: any) => {
        const localMatch = localProfiles.find(lp => lp.id === cp.id);
        return {
          ...cp,
          dailyPostLimit: (localMatch && typeof localMatch.dailyPostLimit === "number") ? localMatch.dailyPostLimit : (cp.dailyPostLimit || 500),
          isActive: currentActiveId ? (cp.id === currentActiveId) : cp.isActive
        };
      });

      // Keep any local-only profiles that haven't synced yet
      for (const lp of localProfiles) {
        if (!mergedProfiles.some(mp => mp.id === lp.id)) {
          mergedProfiles.push(lp);
        }
      }

      fs.writeFileSync(PROFILES_FILE, JSON.stringify(mergedProfiles, null, 2), "utf-8");
      updateActiveProfilePaths();
    }
  } catch (err) {
    console.error("[CLOUD-SYNC] Error during throttled cloud-to-local sync:", (err as Error).message);
  }
}

// Initialize environment details
const isOpenAiConfigured = !!process.env.OPENAI_API_KEY;
const isCmcConfigured = !!process.env.CMC_API_KEY;

addLog("info", `OpenAI API Status: ${isOpenAiConfigured ? "CONFIGURED" : "NOT CONFIGURED (Falls back to static rule-based comments)"}`);
addLog("info", `CoinMarketCap API Status: ${isCmcConfigured ? "CONFIGURED" : "NOT CONFIGURED (Falls back to live free public crypto markets API)"}`);

// ============================================================================
// API ENDPOINTS
// ============================================================================

// 1. Get Session state
app.get("/api/get-session", (req, res) => {
  const exists = fs.existsSync(AUTH_STATE_FILE);
  let details = {};
  let content = "";
  if (exists) {
    try {
      const stats = fs.statSync(AUTH_STATE_FILE);
      details = {
        sizeBytes: stats.size,
        updatedAt: stats.mtime,
      };
      content = fs.readFileSync(AUTH_STATE_FILE, "utf-8");
    } catch (_) {}
  }
  res.json({
    exists,
    filePath: AUTH_STATE_FILE,
    details,
    content,
  });
});

// 2. Save Session state
app.post("/api/save-session", async (req, res) => {
  if (isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot modify session cookies while the Continuous Automation Loop is active." });
  }
  if (isBusy()) {
    return res.status(400).json({ error: "Cannot modify session cookies while another process is running." });
  }
  try {
    let { stateJson } = req.body;
    if (!stateJson) {
      return res.status(400).json({ error: "Missing stateJson payload." });
    }
    // Verify it is valid JSON
    JSON.parse(stateJson);
    
    // Normalize and heal common cookie format anomalies automatically
    stateJson = normalizeStateJson(stateJson);
    
    let profiles = readJsonFile<any[]>(PROFILES_FILE, []);
    
    // Check if this cookie state already belongs to any profile
    const matchIdx = profiles.findIndex(p => p.stateJson === stateJson);
    
    if (matchIdx >= 0) {
      // Activate matching profile
      profiles = profiles.map((p, idx) => ({
        ...p,
        isActive: idx === matchIdx
      }));
      addLog("success", `Detected existing profile matching these cookies: "${profiles[matchIdx].name}". Activated.`);
    } else {
      // Creating a new profile
      if (profiles.length >= 5) {
        return res.status(400).json({ error: "Maximum limit of 5 accounts reached. Please delete an existing profile to add a new one." });
      }
      
      const name = getNextImportedAccountName(profiles);
      const profileId = name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
      
      const newProfile = {
        id: profileId,
        name,
        stateJson,
        isActive: true,
        loginStatus: "unknown",
        updatedAt: new Date().toISOString()
      };
      
      // Deactivate all others
      profiles = profiles.map(p => ({ ...p, isActive: false }));
      profiles.push(newProfile);
      addLog("success", `Successfully imported cookie session as new profile: "${name}"`);
    }

    fs.writeFileSync(AUTH_STATE_FILE, stateJson, "utf-8");
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
    
    // Crucial: Update paths immediately
    updateActiveProfilePaths();
    
    // Reset login flow state to idle on manual session save
    loginState = { status: "idle", message: "" };
    
    // Sync to Firestore Cloud Database
    const activeId = getActiveProfileId();
    try {
      await saveSessionStateCloud(stateJson, activeId || undefined);
      await saveProfilesCloud(profiles);
      // Force sync to load any existing cloud data for this profile
      await syncLocalFromCloudIfStale(true);
    } catch (err) {
      console.error("[FIREBASE] Error saving session to cloud:", (err as Error).message);
    }

    res.json({ success: true, message: "auth/state.json saved successfully." });
  } catch (error) {
    addLog("error", `Failed to save session state: ${(error as Error).message}`);
    res.status(400).json({ error: `Invalid JSON format: ${(error as Error).message}` });
  }
});

// 3. Clear session
app.post("/api/clear-session", async (req, res) => {
  if (isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot clear session cookies while the Continuous Automation Loop is active." });
  }
  if (isBusy()) {
    return res.status(400).json({ error: "Cannot clear session cookies while another process is running." });
  }
  try {
    const activeId = getActiveProfileId();

    // Clear from Firestore Cloud Database
    try {
      await saveSessionStateCloud("", activeId || undefined);
    } catch (err) {
      console.error("[FIREBASE] Error clearing session from cloud:", (err as Error).message);
    }

    loginState = { status: "idle", message: "" };

    // Mark active profile inactive upon logout / clear-session
    try {
      if (fs.existsSync(PROFILES_FILE)) {
        const profiles = readJsonFile<any[]>(PROFILES_FILE, []);
        let changed = false;
        const updatedProfiles = profiles.map(p => {
          if (p.isActive) {
            changed = true;
            return { ...p, isActive: false, stateJson: "" };
          }
          return p;
        });
        if (changed) {
          fs.writeFileSync(PROFILES_FILE, JSON.stringify(updatedProfiles, null, 2), "utf-8");
          await saveProfilesCloud(updatedProfiles);
        }
      }
    } catch (profErr) {
      console.error("[LOGOUT] Error updating profile inactive state:", (profErr as Error).message);
    }
    updateActiveProfilePaths();

    if (fs.existsSync(AUTH_STATE_FILE)) {
      fs.unlinkSync(AUTH_STATE_FILE);
      addLog("warning", "Deleted auth/state.json session state.");
      res.json({ success: true, message: "Session state deleted." });
    } else {
      res.json({ success: true, message: "No session state existed to delete." });
    }
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 3a. Get Profiles
app.get("/api/profiles", (req, res) => {
  try {
    const profiles = readJsonFile<any[]>(PROFILES_FILE, []);
    res.json({ success: true, profiles });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 3b. Save/Update Profile
app.post("/api/save-profile", async (req, res) => {
  if (isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot add or update profiles while the Continuous Automation Loop is active." });
  }
  if (isBusy()) {
    return res.status(400).json({ error: "Cannot add or update profiles while another process is running." });
  }
  try {
    const { id, name, stateJson } = req.body;
    if (!name || !stateJson) {
      return res.status(400).json({ error: "Missing name or stateJson payload." });
    }
    // Validate JSON
    JSON.parse(stateJson);

    let profiles = readJsonFile<any[]>(PROFILES_FILE, []);
    let profileId = id || name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
    
    const existingIndex = profiles.findIndex(p => p.id === profileId);

    // 1. Check duplicate username if this is a NEW profile
    if (existingIndex === -1) {
      if (profiles.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        return res.status(400).json({ error: "This account username already exists. If you want to relogin, please delete the existing profile first." });
      }

      // 2. Check 5 accounts limit
      if (profiles.length >= 5) {
        return res.status(400).json({ error: "Maximum limit of 5 accounts reached. Please delete an existing profile to add a new one." });
      }
    }

    const rawLimit = Number(req.body.dailyPostLimit);
    const dailyLimit = !isNaN(rawLimit) && rawLimit > 0
      ? rawLimit
      : (existingIndex >= 0 && profiles[existingIndex].dailyPostLimit ? profiles[existingIndex].dailyPostLimit : 500);

    const profileData = {
      id: profileId,
      name,
      stateJson: normalizeStateJson(stateJson),
      isActive: existingIndex >= 0 ? profiles[existingIndex].isActive : false,
      loginStatus: existingIndex >= 0 ? (profiles[existingIndex].loginStatus || "unknown") : "unknown",
      dailyPostLimit: dailyLimit,
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      profiles[existingIndex] = profileData;
    } else {
      profiles.push(profileData);
    }

    fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
    addLog("success", `Saved account profile: "${name}" (Daily limit: ${dailyLimit} posts/day)`);

    // Sync to Cloud
    try {
      await saveProfilesCloud(profiles);
    } catch (err) {
      console.error("[FIREBASE] Error syncing profiles to cloud:", (err as Error).message);
    }

    // If active profile was updated, ensure progress file reflects the limit
    if (profileData.isActive) {
      saveBotProgress({ daily_post_limit: dailyLimit });
    }

    res.json({ success: true, profile: profileData });
  } catch (error) {
    res.status(400).json({ error: `Invalid payload/JSON: ${(error as Error).message}` });
  }
});

// 3bb. Update Account Daily Post Limit
app.post("/api/update-profile-limit", async (req, res) => {
  if (isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot change account limit while the Continuous Automation Loop is active." });
  }
  try {
    const { id, dailyPostLimit } = req.body;
    if (!id) {
      return res.status(400).json({ error: "Missing profile id." });
    }
    const limitNum = Math.max(1, Math.min(10000, Number(dailyPostLimit) || 500));
    let profiles = readJsonFile<any[]>(PROFILES_FILE, []);
    const idx = profiles.findIndex(p => p.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Profile not found." });
    }
    profiles[idx].dailyPostLimit = limitNum;
    profiles[idx].updatedAt = new Date().toISOString();
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
    await saveProfilesCloud(profiles).catch(() => {});

    const activeId = getActiveProfileId();
    if (activeId === id) {
      saveBotProgress({ daily_post_limit: limitNum });
    }
    addLog("info", `Updated daily post limit for account "${profiles[idx].name}" to ${limitNum} posts/day.`);
    res.json({ success: true, profile: profiles[idx], dailyPostLimit: limitNum });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 3c. Activate Profile
app.post("/api/activate-profile", async (req, res) => {
  if (isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot switch accounts while Continuous Loop is active. Please click 'Stop Posting' first." });
  }
  if (isBusy() || isPostingRunning || botStatus === "Posting" || botStatus === "Stopping") {
    return res.status(400).json({ error: "Cannot switch accounts while posting or automation is running. Please click 'Stop Posting' first." });
  }
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: "Missing profile id." });
    }

    let profiles = readJsonFile<any[]>(PROFILES_FILE, []);
    const targetIdx = profiles.findIndex(p => p.id === id);
    if (targetIdx === -1) {
      return res.status(404).json({ error: "Profile not found." });
    }

    // Set all other active to false, target to true
    profiles = profiles.map((p, idx) => ({
      ...p,
      isActive: idx === targetIdx
    }));

    // Copy to AUTH_STATE_FILE
    const activeProfile = profiles[targetIdx];
    fs.writeFileSync(AUTH_STATE_FILE, activeProfile.stateJson, "utf-8");
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
    
    // Crucial: Update active profile paths dynamically!
    updateActiveProfilePaths();

    // Ensure target profile subdirectory and isolated storage files are safely initialized
    const targetDir = path.join(OUTPUT_DIR, activeProfile.id);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const targetResults = path.join(targetDir, "results.json");
    if (!fs.existsSync(targetResults)) {
      fs.writeFileSync(targetResults, "[]", "utf-8");
    }
    const targetProgress = path.join(targetDir, "post_progress.json");
    if (!fs.existsSync(targetProgress)) {
      fs.writeFileSync(targetProgress, JSON.stringify({
        next_index: 0,
        daily_post_count: 0,
        daily_post_limit: activeProfile.dailyPostLimit || 500,
        last_post_date: getTodayDateString()
      }, null, 2), "utf-8");
    }

    // Synchronize in-memory progress index for newly activated profile
    const progress = readBotProgress();
    currentPostingIndex = progress.next_index || 0;

    addLog("success", `Activated account profile: "${activeProfile.name}". Isolated storage and cookies swept.`, activeProfile.id);

    // Sync active session and profiles lists to Cloud so Firestore is immediately consistent
    try {
      await Promise.allSettled([
        saveSessionStateCloud(activeProfile.stateJson, activeProfile.id),
        saveProfilesCloud(profiles)
      ]);
      await syncLocalFromCloudIfStale(true);
    } catch (syncErr) {
      console.error("[STORAGE] Error syncing active profile to cloud:", syncErr);
    }

    // Reset login flow state to idle on activation
    loginState = { status: "idle", message: "" };

    res.json({
      success: true,
      message: `Successfully activated profile "${activeProfile.name}"`,
      activeProfile: {
        id: activeProfile.id,
        name: activeProfile.name,
        isActive: true,
        dailyPostLimit: activeProfile.dailyPostLimit || 500
      }
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 3d. Delete Profile
app.post("/api/delete-profile", async (req, res) => {
  if (isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot delete accounts while the Continuous Automation Loop is active." });
  }
  if (isBusy()) {
    return res.status(400).json({ error: "Cannot delete accounts while another process is running." });
  }
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: "Missing profile id." });
    }

    let profiles = readJsonFile<any[]>(PROFILES_FILE, []);
    const targetIdx = profiles.findIndex(p => {
      const pid = String(p.id || "").trim().toLowerCase();
      const targetId = String(id || "").trim().toLowerCase();
      return pid === targetId;
    });
    if (targetIdx === -1) {
      return res.status(404).json({ error: "Profile not found." });
    }

    const wasActive = profiles[targetIdx].isActive;
    const deletedName = profiles[targetIdx].name;
    const deletedId = profiles[targetIdx].id;
    profiles.splice(targetIdx, 1);

    if (wasActive) {
      // Clear AUTH_STATE_FILE if active profile was deleted
      if (fs.existsSync(AUTH_STATE_FILE)) {
        fs.unlinkSync(AUTH_STATE_FILE);
      }
      try {
        await saveSessionStateCloud("", deletedId);
      } catch (err) {
        console.error("[FIREBASE] Error clearing session from cloud on deletion:", (err as Error).message);
      }
    }

    // Clean up local profile subdirectory files if they exist
    const profileDir = path.join(OUTPUT_DIR, deletedId);
    if (fs.existsSync(profileDir)) {
      try {
        fs.rmSync(profileDir, { recursive: true, force: true });
        addLog("info", `Cleaned up local directory for deleted profile "${deletedName}" (${deletedId}).`);
      } catch (err) {
        console.error(`Error deleting profile subdirectory ${profileDir}:`, (err as Error).message);
      }
    }

    // Always reset login flow state to idle on deletion to prevent sticky success banner
    loginState = { status: "idle", message: "" };

    fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
    addLog("warning", `Deleted profile: "${deletedName}"`);

    // Reset active paths dynamic fallback
    updateActiveProfilePaths();

    try {
      await saveProfilesCloud(profiles);
    } catch (err) {
      console.error("[FIREBASE] Error syncing profiles to cloud on deletion:", (err as Error).message);
    }

    res.json({ success: true, message: "Profile deleted." });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 4. Status endpoint
app.get("/api/status", async (req, res) => {
  const activeId = getActiveProfileId();
  const sessionExists = fs.existsSync(AUTH_STATE_FILE);

  if (!activeId || !sessionExists) {
    return res.json({
      status: (botStatus === "Authenticating" || botStatus === "Verifying Code") ? botStatus : (isStopping ? "Stopping" : "Idle"),
      isStopping,
      loginState: loginState,
      runMode,
      totalCoins: 0,
      generatedMessages: 0,
      postedCount: 0,
      failedCount: 0,
      results: [],
      progressIndex: 0,
      dailyPostCount: 0,
      dailyPostLimit: getAccountDailyPostLimit(null),
      lastPostDate: getTodayDateString(),
      currentCoin: "N/A",
      coinsFetchedAt: null,
      coinsFetchedTime: null,
      commentsGeneratedAt: null,
      commentsGeneratedTime: null,
      sessionStatus: "Session expired / Not found",
      apiStatus: {
        openai: isOpenAiConfigured,
        gemini: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
        cmc: isCmcConfigured,
        openaiError: lastOpenAiError,
        geminiError: lastGeminiError,
      },
      isContinuousLoopActive: false,
      nextCycleStartTime: null,
      continuousLoopIntervalMinutes,
    });
  }

  await syncLocalFromCloudIfStale();

  const coins = readJsonFile<Coin[]>(LAST_TRENDING_FILE, []);
  const messages = readJsonFile<GeneratedMessage[]>(GENERATED_MESSAGES_FILE, []);
  const results = readJsonFile<PostResult[]>(RESULTS_FILE, []);
  const progress = readBotProgress();
  const dailyPostLimit = getAccountDailyPostLimit(activeId);
  const ts = getRealTimestamps();

  res.json({
    status: isStopping ? "Stopping" : botStatus,
    isStopping,
    loginState,
    runMode,
    totalCoins: coins.length,
    generatedMessages: messages.length,
    postedCount: results.filter(r => r.status === "success").length,
    failedCount: results.filter(r => r.status !== "success" && r.status !== "skipped").length,
    results,
    progressIndex: progress.next_index,
    dailyPostCount: progress.daily_post_count || 0,
    dailyPostLimit,
    lastPostDate: progress.last_post_date || getTodayDateString(),
    currentCoin: currentCoinName,
    coinsFetchedAt: coins.length > 0 ? ts.coinsFetchedAt : null,
    coinsFetchedTime: coins.length > 0 ? ts.coinsFetchedTime : null,
    commentsGeneratedAt: messages.length > 0 ? ts.commentsGeneratedAt : null,
    commentsGeneratedTime: messages.length > 0 ? ts.commentsGeneratedTime : null,
    sessionStatus: "Session active",
    apiStatus: {
      openai: isOpenAiConfigured,
      gemini: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
      cmc: isCmcConfigured,
      openaiError: lastOpenAiError,
      geminiError: lastGeminiError,
    },
    isContinuousLoopActive,
    nextCycleStartTime,
    continuousLoopIntervalMinutes,
  });
});

// 4.5. Set run mode endpoint (Deprecated - Simulation mode is completely removed)
app.post("/api/set-run-mode", (req, res) => {
  res.json({ success: true, runMode: "Real Browser", message: "Simulation mode is disabled." });
});

// 4.55. Set continuous loop active
app.post("/api/set-continuous-loop", (req, res) => {
  const { active, intervalMinutes } = req.body;
  if (active && !isContinuousLoopActive && isBusy()) {
    addLog("warning", "Cannot enable Continuous Automation Loop while another manual action is already running.");
    return res.status(400).json({ success: false, error: "Cannot enable Continuous Automation Loop while another manual action is already running." });
  }

  if (active && !isContinuousLoopActive) {
    const activeId = getActiveProfileId();
    const sessionExists = fs.existsSync(AUTH_STATE_FILE);
    if (!activeId || !sessionExists) {
      addLog("error", "Cannot enable Continuous Automation Loop without an active, authenticated account session.");
      return res.status(400).json({ success: false, error: "Cannot enable Continuous Automation Loop without an active, authenticated account session. Please import or log into an account profile first." });
    }
  }

  let intervalChanged = false;
  if (intervalMinutes !== undefined && typeof intervalMinutes === "number" && intervalMinutes > 0) {
    const safeMins = Math.max(5, Math.round(intervalMinutes));
    if (continuousLoopIntervalMinutes !== safeMins) {
      continuousLoopIntervalMinutes = safeMins;
      intervalChanged = true;
      addLog("info", `Continuous Loop cooldown interval updated to ${continuousLoopIntervalMinutes} minutes (minimum enforced: 5 minutes).`);
    }
  }

  if (active !== undefined) {
    const nextActive = !!active;
    if (nextActive !== isContinuousLoopActive) {
      isContinuousLoopActive = nextActive;
      if (isContinuousLoopActive) {
        addLog("success", `Continuous Automation Loop enabled (${continuousLoopIntervalMinutes}-minute interval).`);
        if (botStatus === "Completed" || botStatus === "Idle") {
          addLog("info", "Starting first automated cycle immediately...");
          triggerFullFlowExecution().catch(err => {
            addLog("error", `Failed to start automated continuous cycle: ${err.message}`);
          });
        }
      } else {
        cancelNextAutomationCycle();
        addLog("warning", "Continuous Automation Loop disabled.");
      }
    }
  }

  // Ensure dynamic rescheduling works whether active parameter was passed or not
  if (isContinuousLoopActive && intervalChanged) {
    if (nextCycleTimeout !== null || (!isBusy() && !isPostingRunning && !isGeneratingRunning)) {
      addLog("info", `Rescheduling next continuous cycle to ${continuousLoopIntervalMinutes} minutes from now due to interval change.`);
      scheduleNextAutomationCycle();
    } else {
      addLog("info", `[AUTOMATION] New interval (${continuousLoopIntervalMinutes}m) will apply cleanly after current cycle completes.`);
    }
  }

  res.json({ success: true, isContinuousLoopActive, nextCycleStartTime, continuousLoopIntervalMinutes });
});

// 4.6. Check system dependencies & Playwright health
app.get("/api/check-system", async (req, res) => {
  try {
    const playwrightInstalled = typeof chromium !== "undefined";
    const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH || "Not configured";
    
    let executablePath = "N/A";
    let executableExists = false;
    let launchStatus: "success" | "failed" = "failed";
    let message = "";
    let missingLibraries: string[] = [];

    if (playwrightInstalled) {
      try {
        executablePath = chromium.executablePath();
        executableExists = fs.existsSync(executablePath);
      } catch (err) {
        message = `Failed to get executable path: ${(err as Error).message}`;
      }
    }

    if (executableExists) {
      try {
        // Run a quick version check on the chromium binary
        // If system dependencies are missing, this will fail with an error detailing the missing library
        const output = execSync(`"${executablePath}" --version`, { stdio: "pipe", timeout: 5000 }).toString().trim();
        launchStatus = "success";
        message = `Chromium binary verified successfully: ${output}`;
      } catch (err) {
        const errMsg = (err as Error).message || "";
        const stderr = (err as any).stderr?.toString() || "";
        const combinedError = `${errMsg} ${stderr}`;
        
        launchStatus = "failed";
        
        // Extract missing shared libraries from error
        const libPattern = /lib[a-zA-Z0-9\.\-\_]+\.so\.[0-9]+/g;
        const foundLibs = combinedError.match(libPattern) || [];
        missingLibraries = Array.from(new Set(foundLibs));

        if (missingLibraries.length > 0) {
          message = `Missing required shared libraries: ${missingLibraries.join(", ")}`;
        } else if (combinedError.includes("cannot open shared object file")) {
          message = `Shared library error: ${combinedError}`;
        } else {
          message = `Launch verification failed: ${combinedError.substring(0, 300)}`;
        }
      }
    } else {
      message = "Chromium executable is not present on disk. It might need to be downloaded/installed.";
    }

    res.json({
      success: launchStatus === "success",
      playwrightInstalled,
      browsersPath,
      executablePath,
      executableExists,
      launchStatus,
      message,
      missingLibraries,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// 4.65. Check MongoDB connection (Strict read-only admin ping, never touches any data or collections)
app.get("/api/check-mongo", async (req, res) => {
  const rawUri = process.env.MONGO_URI;
  if (!rawUri) {
    return res.status(404).json({
      success: false,
      configured: false,
      message: "MONGO_URI environment variable is not configured.",
    });
  }

  try {
    const { MongoClient } = await import("mongodb");
    const { sanitizeMongoUri } = await import("./src/mongo-db.js");
    const sanitizedUri = sanitizeMongoUri(rawUri);

    const client = new MongoClient(sanitizedUri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });

    await client.connect();
    // Issue read-only admin ping to verify connection without modifying anything
    const pingResult = await client.db("admin").command({ ping: 1 });
    await client.close();

    return res.json({
      success: true,
      configured: true,
      ping: pingResult?.ok === 1 ? "ok" : "received",
      message: "Successfully connected to MongoDB Atlas cluster! Connection verified as healthy (read-only ping).",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      configured: true,
      error: (error as Error).message,
      message: `Failed to connect to MongoDB cluster: ${(error as Error).message}`,
    });
  }
});

// 4.7. Full Environment & Configuration Verification Endpoint
app.get("/api/verify-env", (req, res) => {
  const hasOpenAi = !!process.env.OPENAI_API_KEY;
  const hasGemini = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  const hasCmc = !!process.env.CMC_API_KEY;
  const hasFirebaseConfig = !!(process.env.FIREBASE_CONFIG || process.env.FIREBASE_API_KEY || fs.existsSync(path.join(process.cwd(), "firebase-applet-config.json")));
  const hasMongo = !!process.env.MONGO_URI;
  const hasAuthState = !!(process.env.AUTH_STATE_JSON || (fs.existsSync(AUTH_STATE_FILE) && fs.statSync(AUTH_STATE_FILE).size > 100));

  res.json({
    status: "ok",
    nodeEnv: process.env.NODE_ENV || "development",
    port: PORT,
    playwrightBrowsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH || "default",
    aiProviders: {
      openai: {
        configured: hasOpenAi,
        maskedKey: hasOpenAi ? `${process.env.OPENAI_API_KEY!.slice(0, 7)}...${process.env.OPENAI_API_KEY!.slice(-4)}` : null,
        model: "gpt-4o-mini"
      },
      gemini: {
        configured: hasGemini,
        maskedKey: hasGemini ? `${(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)!.slice(0, 6)}...` : null,
        model: "gemini-3.5-flash"
      },
      activeAiModel: hasOpenAi ? "OpenAI (gpt-4o-mini)" : hasGemini ? "Gemini (gemini-3.5-flash)" : "Rule-based templates (No AI Key)"
    },
    dataSources: {
      coinMarketCapApi: {
        configured: hasCmc,
        mode: hasCmc ? "Pro API" : "Free Public Community Feed (Automatic Fallback)"
      }
    },
    database: {
      primary: "Firebase Firestore",
      firebaseConfigured: hasFirebaseConfig,
      fallback: hasMongo ? "MongoDB Atlas" : "Local Disk Only",
      mongoConfigured: hasMongo
    },
    session: {
      sessionImported: hasAuthState,
      sessionFileExists: fs.existsSync(AUTH_STATE_FILE)
    }
  });
});

// 5. Check login session (Runs real headless Playwright against CoinMarketCap)
app.post("/api/check-login", async (req, res) => {
  if (isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot check session while the Continuous Automation Loop is active." });
  }
  if (isBusy()) {
    return res.status(400).json({ error: "Another process is currently running. Please wait for it to finish." });
  }
  addLog("info", "Checking live login session validity on CoinMarketCap using Playwright...");
  botStatus = "Checking Login";

  const sessionExists = fs.existsSync(AUTH_STATE_FILE);
  if (!sessionExists) {
    addLog("error", "Login check failed: auth/state.json does not exist. Please upload active session cookies.");
    botStatus = "Idle";
    
    try {
      let profiles = readJsonFile<any[]>(PROFILES_FILE, []);
      const activeIdx = profiles.findIndex(p => p.isActive);
      if (activeIdx >= 0) {
        profiles[activeIdx].loginStatus = "expired";
        profiles[activeIdx].updatedAt = new Date().toISOString();
        fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
        await saveProfilesCloud(profiles);
      }
    } catch (_) {}

    return res.json({ status: "expired", message: "auth/state.json missing" });
  }

  try {
    const result = await checkLoginReal();
    
    // Update active profile loginStatus
    try {
      let profiles = readJsonFile<any[]>(PROFILES_FILE, []);
      const activeIdx = profiles.findIndex(p => p.isActive);
      if (activeIdx >= 0) {
        profiles[activeIdx].loginStatus = result.status === "success" ? "logged_in" : "expired";
        profiles[activeIdx].updatedAt = new Date().toISOString();
        fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
        await saveProfilesCloud(profiles);
      }
    } catch (err) {
      console.error("Error updating profile status in check-login:", (err as Error).message);
    }

    botStatus = "Idle";
    return res.json(result);
  } catch (err) {
    addLog("error", `Real login verification failed: ${(err as Error).message}`);
    botStatus = "Idle";

    try {
      let profiles = readJsonFile<any[]>(PROFILES_FILE, []);
      const activeIdx = profiles.findIndex(p => p.isActive);
      if (activeIdx >= 0) {
        profiles[activeIdx].loginStatus = "expired";
        profiles[activeIdx].updatedAt = new Date().toISOString();
        fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
        await saveProfilesCloud(profiles);
      }
    } catch (_) {}

    return res.json({ status: "failed", message: (err as Error).message });
  }
});

// 5.1. Start interactive credential login
app.post("/api/start-login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Missing email or password." });
  }

  if (isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot start login while the Continuous Automation Loop is active." });
  }
  if (isBusy()) {
    return res.status(400).json({ error: "Another automated process is currently running. Please wait for it to finish." });
  }

  // 1. Check profiles
  let profiles = readJsonFile<any[]>(PROFILES_FILE, []);
  const existingProfile = profiles.find(p => p.name.toLowerCase() === email.toLowerCase());

  // 2. Check if we reached the maximum of 5 accounts only if creating a new profile
  if (!existingProfile && profiles.length >= 5) {
    return res.status(400).json({ error: "Maximum limit of 5 accounts reached. Please delete an existing profile to add a new one." });
  }

  botStatus = "Authenticating";
  loginState = { status: "authenticating", message: "Initializing secure credentials login flow..." };

  // Run asynchronously in background to prevent 504 Gateway Timeout on AWS/Nginx proxy
  executeStartLogin(email, password)
    .then((result) => {
      const mappedStatus = result.status === "requires_otp" ? "requires_otp" : (result.status === "success" ? "success" : "failed");
      loginState = { status: mappedStatus, message: result.message };
      if (result.status !== "requires_otp") {
        botStatus = "Idle";
      } else {
        botStatus = "Verifying Code";
      }
    })
    .catch((error) => {
      botStatus = "Idle";
      loginState = { status: "failed", message: (error as Error).message };
    });

  return res.json({ status: "authenticating", message: "Automated login flow initiated. Please wait..." });
});

// 5.2. Submit OTP / Verification Code
app.post("/api/submit-otp", async (req, res) => {
  const { otp } = req.body;
  if (!otp) {
    return res.status(400).json({ error: "Missing OTP verification code." });
  }

  if (isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot submit OTP while the Continuous Automation Loop is active." });
  }

  botStatus = "Verifying Code";
  loginState = { status: "authenticating", message: "Submitting 6-digit verification code..." };

  // Run asynchronously in background to prevent 504 Gateway Timeout on AWS/Nginx proxy
  executeSubmitOtp(otp)
    .then((result) => {
      loginState = { status: result.status, message: result.message };
      botStatus = "Idle";
      if (result.status === "success") {
        setTimeout(() => {
          if (loginState.status === "success") {
            loginState = { status: "idle", message: "" };
          }
        }, 15000);
      }
    })
    .catch((error) => {
      botStatus = "Idle";
      loginState = { status: "failed", message: (error as Error).message };
    });

  return res.json({ status: "authenticating", message: "OTP submission initiated. Please wait..." });
});

// 5.3. Cancel active login session
app.post("/api/cancel-login", async (req, res) => {
  if (isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot cancel login while the Continuous Automation Loop is active." });
  }
  try {
    await executeCancelLogin();
    botStatus = "Idle";
    loginState = { status: "idle", message: "Login session cancelled." };
    return res.json({ success: true, message: "Login session cancelled." });
  } catch (error) {
    botStatus = "Idle";
    loginState = { status: "idle", message: (error as Error).message };
    return res.status(500).json({ error: (error as Error).message });
  }
});

// 5.3b. Reset login state to idle cleanly (for logging into another account)
app.post("/api/reset-login-state", async (req, res) => {
  try {
    if (activeLoginSession) {
      await activeLoginSession.browser.close().catch(() => {});
      activeLoginSession = null;
    }
  } catch (_) {}
  botStatus = "Idle";
  loginState = { status: "idle", message: "" };
  return res.json({ success: true, message: "Login state reset to idle." });
});

// 5.4. Retry manual post for a single coin
app.post("/api/retry-single", async (req, res) => {
  const { symbol } = req.body;
  if (!symbol) {
    return res.status(400).json({ error: "Missing coin symbol." });
  }

  if (isBusy() || isPostingRunning || isGeneratingRunning) {
    return res.status(400).json({ error: "An automated posting process is currently active. Please wait for the current coin to finish." });
  }

  // Lock status to active posting so other frontend elements disable and pause updates correctly
  isPostingRunning = true;
  botStatus = "Posting";
  currentCoinName = symbol;

  try {
    addLog("info", `Initiating manual individual retry for coin ticker ${symbol}...`);
    const messages = readJsonFile<GeneratedMessage[]>(GENERATED_MESSAGES_FILE, []);
    let item = messages.find(m => m.symbol.toLowerCase() === symbol.toLowerCase());
    
    if (!item) {
      const resultsList = readJsonFile<PostResult[]>(RESULTS_FILE, []);
      const matchedResult = resultsList.find(r => r.symbol.toLowerCase() === symbol.toLowerCase());
      if (matchedResult) {
        item = {
          name: matchedResult.name,
          symbol: matchedResult.symbol,
          url: matchedResult.url,
          message: matchedResult.message,
          sentiment: matchedResult.sentiment,
        } as any;
      }
    }

    if (!item) {
      return res.status(404).json({ error: `No generated message or previous result found for symbol: ${symbol}` });
    }

    let outcome: PostResult["status"] = "success";
    let messageText = "Posted successfully via manual retry";

    addLog("info", `Launching automated Playwright context for manual retry of ${item.name}...`);
    try {
      const resolvedUrl = await resolveToFirstPartyUrl(item.url, item.symbol, item.name);
      const realResult = await runRealPosting(resolvedUrl, item.message, item.sentiment || "bullish");
      outcome = realResult.status;
      messageText = realResult.message;
    } catch (err) {
      outcome = "failed";
      messageText = `Playwright manual retry error: ${(err as Error).message}`;
      addLog("error", `CRITICAL Error during manual retry automation: ${messageText}`);
    }

    // Update in RESULTS_FILE
    const results = readJsonFile<PostResult[]>(RESULTS_FILE, []);
    const existingIdx = results.findIndex(r => r.symbol.toLowerCase() === symbol.toLowerCase());
    
    const newResultEntry: PostResult = {
      name: item.name,
      symbol: item.symbol,
      url: item.url,
      status: outcome,
      message: messageText,
      timestamp: new Date().toLocaleTimeString(),
      sentiment: item.sentiment || "bullish",
    };

    if (existingIdx !== -1) {
      results[existingIdx] = newResultEntry;
    } else {
      results.push(newResultEntry);
    }

    await writeJsonFile(RESULTS_FILE, results);
    
    if (outcome === "success") {
      addLog("success", `Successfully manually retried posting for ${symbol}!`);
    } else {
      addLog("error", `Manual retry failed for ${symbol}: ${messageText}`);
    }

    return res.json({ success: outcome === "success", result: newResultEntry });
  } catch (error) {
    addLog("error", `Error in individual retry: ${(error as Error).message}`);
    return res.status(500).json({ error: (error as Error).message });
  } finally {
    isPostingRunning = false;
    botStatus = "Idle";
  }
});

async function fetchTrendingByScrape(): Promise<Coin[]> {
  return PlaywrightLock.acquire(async () => {
    addLog("info", "Launching Playwright to scrape real trending data from CoinMarketCap...");
    let browser: any = null;
    try {
      browser = await launchBrowserResilient({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-blink-features=AutomationControlled",
        ]
      });

      const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        viewport: { width: 1440, height: 900 },
        locale: "en-US",
      });

      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
      });

      const page = await context.newPage();
      await setupPageResourceBlocking(page);
      addLog("info", "Navigating to: https://coinmarketcap.com/trending-cryptocurrencies/");
      await page.goto("https://coinmarketcap.com/trending-cryptocurrencies/", {
        waitUntil: "domcontentloaded",
        timeout: 45000
      });

      // Wait for the page/table to settle down
      await page.waitForTimeout(3000);
      
      const title = await page.title().catch(() => "");
      if (title.includes("Cloudflare") || title.includes("Just a moment")) {
        throw new Error("Cloudflare challenge encountered during scraping.");
      }

      addLog("info", "Scrolling page to load full trending table...");
      await page.evaluate("window.scrollBy(0, 500)");
      await page.waitForTimeout(1000);
      await page.evaluate("window.scrollBy(0, 500)");
      await page.waitForTimeout(1000);

      const coins = await page.evaluate(`(() => {
        try {
          const parseAbbreviatedNumber = (str) => {
            if (!str) return 0;
            const clean = str.replace(/[^0-9.KMBTkmbt]/g, '').toUpperCase();
            let val = parseFloat(clean) || 0;
            if (clean.endsWith('K')) val *= 1000;
            else if (clean.endsWith('M')) val *= 1000000;
            else if (clean.endsWith('B')) val *= 1000000000;
            else if (clean.endsWith('T')) val *= 1000000000000;
            return val;
          };

          const tables = Array.from(document.querySelectorAll("table"));
          const mainTable = tables.find(t => t.querySelectorAll("tbody tr").length > 5);
          if (!mainTable) return [];

          const rows = Array.from(mainTable.querySelectorAll("tbody tr"));
          const result = [];

          for (const row of rows) {
            const cells = Array.from(row.querySelectorAll("td"));
            if (cells.length < 5) continue;

            const rankText = cells[1] ? cells[1].textContent.trim() : "";
            const rank = parseInt(rankText) || (result.length + 1);

            const nameCell = cells[2];
            if (!nameCell) continue;

            const nameEl = nameCell.querySelector('.base-text');
            const symbolEl = nameCell.querySelector('.sub-info');
            
            let name = nameEl ? nameEl.textContent.trim() : "";
            let symbol = symbolEl ? symbolEl.textContent.trim() : "";

            const link = nameCell.querySelector('a');
            const href = link ? link.getAttribute('href') : "";

            // If name/symbol not found via classes, try fallback parsing
            if (!name) {
              const text = nameCell.textContent.trim();
              name = text;
              symbol = text;
            }

            let url = "";
            let slug = "";
            if (href) {
              if (href.startsWith("http")) {
                url = href;
                // Extract slug from URL if possible
                const match = href.match(/\\/currencies\\/([^/]+)/) || href.match(/token\\/([^/]+)\\/([^/]+)/);
                slug = match ? match[1] : name.toLowerCase().replace(/\\s+/g, '-');
              } else {
                url = "https://coinmarketcap.com" + href;
                const match = href.match(/\\/currencies\\/([^/]+)/);
                slug = match ? match[1] : name.toLowerCase().replace(/\\s+/g, '-');
              }
            } else {
              slug = name.toLowerCase().replace(/\\s+/g, '-');
              url = "https://coinmarketcap.com/currencies/" + slug + "/";
            }

            const priceText = cells[3] ? cells[3].textContent.trim() : "$0";
            const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;

            const h1Text = cells[4] ? cells[4].textContent.trim() : "0%";
            let change_1h = parseFloat(h1Text.replace(/[^0-9.]/g, '')) || 0;
            if (cells[4] && (cells[4].innerHTML.includes('caret-down') || cells[4].innerHTML.includes('icon-Caret-down'))) {
              change_1h = -change_1h;
            }

            const h24Text = cells[5] ? cells[5].textContent.trim() : "0%";
            let change_24h = parseFloat(h24Text.replace(/[^0-9.]/g, '')) || 0;
            if (cells[5] && (cells[5].innerHTML.includes('caret-down') || cells[5].innerHTML.includes('icon-Caret-down'))) {
              change_24h = -change_24h;
            }

            const mcText = cells[6] ? cells[6].textContent.trim() : "$0";
            const market_cap = parseAbbreviatedNumber(mcText);

            const volText = cells[7] ? cells[7].textContent.trim() : "$0";
            const volume_24h = parseAbbreviatedNumber(volText);

            result.push({
              name,
              symbol,
              price,
              change_1h,
              change_24h,
              change_7d: 0,
              market_cap,
              volume_24h,
              cmc_rank: rank,
              slug,
              url
            });
          }

          return result;
        } catch (e) {
          return [];
        }
      })()`) as Coin[];

      if (coins && coins.length > 0) {
        addLog("success", `Successfully scraped ${coins.length} trending coins directly from CoinMarketCap!`);
        return coins;
      } else {
        throw new Error("Scraped page but found 0 coins in trending list.");
      }
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  });
}

async function executeFetchTrending(): Promise<{ coins: Coin[]; creditCount: number }> {
  let coins: Coin[] = [];
  let creditCount = 0;

  try {
    coins = await withTimeout(
      fetchTrendingByScrape(),
      120000,
      "Playwright launch or scrape timed out after 120 seconds"
    );
    if (coins && coins.length > 0) {
      addLog("success", `[SOURCE: CMC SCRAPE] Successfully scraped ${coins.length} trending coins directly from CoinMarketCap.`);
    }
  } catch (scrapeErr) {
    addLog("warning", `CoinMarketCap scrape failed: ${(scrapeErr as Error).message}. Attempting fallback market source...`);
  }

  if (coins.length === 0) {
    if (process.env.CMC_API_KEY) {
      addLog("info", "Scrape failed, falling back to CoinMarketCap listings (top by market cap).");
      try {
        const response = await fetch("https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?start=1&limit=50&convert=USD", {
          headers: {
            "Accepts": "application/json",
            "X-CMC_PRO_API_KEY": process.env.CMC_API_KEY,
          }
        });

        if (!response.ok) {
          addLog("warning", `CoinMarketCap Pro API returned error status: ${response.status}. Attempting CoinGecko fallback...`);
        } else {
          const resData = (await response.json()) as any;
          creditCount = resData.status?.credit_count || 1;
          
          if (resData.data && Array.isArray(resData.data)) {
            coins = resData.data.map((coin: any) => ({
              name: coin.name,
              symbol: coin.symbol,
              price: parseFloat(coin.quote?.USD?.price?.toFixed(6) || "0"),
              change_24h: parseFloat(coin.quote?.USD?.percent_change_24h?.toFixed(2) || "0"),
              change_1h: parseFloat(coin.quote?.USD?.percent_change_1h?.toFixed(2) || "0"),
              change_7d: parseFloat(coin.quote?.USD?.percent_change_7d?.toFixed(2) || "0"),
              market_cap: parseFloat(coin.quote?.USD?.market_cap?.toFixed(2) || "0"),
              volume_24h: parseFloat(coin.quote?.USD?.volume_24h?.toFixed(2) || "0"),
              cmc_rank: coin.cmc_rank,
              slug: coin.slug,
              url: `https://coinmarketcap.com/currencies/${coin.slug}/`,
            }));
            addLog("success", `[SOURCE: CMC PRO API] Fetched ${coins.length} coins from CoinMarketCap Pro API.`);
          }
        }
      } catch (cmcErr) {
        addLog("warning", `CoinMarketCap Pro API fetch failed: ${(cmcErr as Error).message}. Attempting CoinGecko fallback...`);
      }
    }

    if (coins.length === 0) {
      addLog("info", "Scrape failed, falling back to CoinGecko markets (top by market cap).");
      
      try {
        const response = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=30&page=1&sparkline=false&price_change_percentage=1h,24h,7d");
        
        if (response.ok) {
          const cgData = (await response.json()) as any;
          if (Array.isArray(cgData) && cgData.length > 0) {
            coins = cgData.map((coin: any, index: number) => ({
              name: coin.name,
              symbol: coin.symbol.toUpperCase(),
              price: coin.current_price,
              change_24h: parseFloat(coin.price_change_percentage_24h?.toFixed(2) || "0"),
              change_1h: parseFloat(coin.price_change_percentage_1h_in_currency?.toFixed(2) || "0"),
              change_7d: parseFloat(coin.price_change_percentage_7d_in_currency?.toFixed(2) || "0"),
              market_cap: coin.market_cap,
              volume_24h: coin.total_volume,
              cmc_rank: index + 1,
              slug: coin.id,
              url: `https://coinmarketcap.com/currencies/${coin.id}/`,
            }));
            addLog("success", `[SOURCE: COINGECKO] Successfully fetched ${coins.length} top market cap coins from CoinGecko API.`);
          }
        }
      } catch (cgErr) {
        addLog("warning", `CoinGecko fetch failed: ${(cgErr as Error).message}`);
      }

      if (coins.length === 0) {
        addLog("error", "All coin sources failed.");
        throw new Error("Could not fetch trending coins from any source (scrape, CMC API, CoinGecko). Keeping previous coin list.");
      }
    }
  }

  // Pre-resolve and filter out DEX scan URLs that cannot be resolved to standard CMC currencies pages.
  const resolvedCoins: Coin[] = [];
  for (const coin of coins) {
    if (coin.url && coin.url.includes("dex.coinmarketcap.com")) {
      addLog("info", `Pre-resolving DEX Scan URL for ${coin.name} (${coin.symbol})...`);
      const resolvedUrl = await resolveToFirstPartyUrl(coin.url, coin.symbol, coin.name);
      if (resolvedUrl && !resolvedUrl.includes("dex.coinmarketcap.com")) {
        coin.url = resolvedUrl;
        const match = resolvedUrl.match(/\/currencies\/([^/]+)/);
        if (match) {
          coin.slug = match[1];
        }
        resolvedCoins.push(coin);
      } else {
        addLog("warning", `Excluding DEX token ${coin.name} (${coin.symbol}) from queue: Does not have a standard community currencies page.`);
      }
    } else {
      resolvedCoins.push(coin);
    }
  }

  if (resolvedCoins.length === 0) {
    addLog("error", "All coin sources failed.");
    throw new Error("Could not fetch trending coins from any source (scrape, CMC API, CoinGecko). Keeping previous coin list.");
  }

  await writeJsonFile(LAST_TRENDING_FILE, resolvedCoins);
  updateRealFetchTime();
  return { coins: resolvedCoins, creditCount };
}

export function formatCommentWithCashtag(comment: string, symbol: string): string {
  if (!symbol) return comment;
  const sym = symbol.trim().toUpperCase();
  const cashtag = `$${sym}`;
  
  // If the cashtag is already present as a distinct tag, keep as is
  if (comment.toUpperCase().includes(cashtag)) {
    return comment;
  }
  
  // If the symbol appears as a standalone word without $, replace the first occurrence
  const escapedSym = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordRegex = new RegExp(`\\b${escapedSym}\\b`, "i");
  if (wordRegex.test(comment)) {
    return comment.replace(wordRegex, cashtag);
  }
  
  // Otherwise, prepend the cashtag to ensure CoinMarketCap tags the token
  return `${cashtag} - ${comment}`;
}

async function executeGenerateMessages(): Promise<number> {
  const coins = readJsonFile<Coin[]>(LAST_TRENDING_FILE, []);
  if (coins.length === 0) {
    throw new Error("No trending coins found in output/last_trending.json. Please fetch trending coins first.");
  }

  const generatedMessages: GeneratedMessage[] = [];

  // Helper to check which coins are still missing generated comments
  const getMissingCoins = (): Coin[] => {
    const existingSymbols = new Set(generatedMessages.map(m => m.symbol.toLowerCase()));
    return coins.filter(c => !existingSymbols.has(c.symbol.toLowerCase()));
  };

  // 1. Primary Model: OpenAI gpt-4o-mini
  if (process.env.OPENAI_API_KEY) {
    try {
      lastOpenAiError = null; // Reset previous error if we have a key and are trying again
      const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
      addLog("info", "Initializing OpenAI SDK with gpt-4o-mini...");
      const openai = new OpenAI({
        apiKey: OPENAI_API_KEY,
      });

      const batchSize = 10;
      for (let i = 0; i < coins.length; i += batchSize) {
        if (!isGeneratingRunning) {
          addLog("warning", "Comment generation aborted by user.");
          break;
        }
        const chunk = coins.slice(i, i + batchSize);
        addLog("info", `Generating batch of comments ${Math.floor(i / batchSize) + 1}/${Math.ceil(coins.length / batchSize)} with gpt-4o-mini...`);

        const prompt = `
          Generate ONE unique, creative, organic CoinMarketCap community comment for EACH of the following coins based on their recent market data, AND classify the sentiment as either "bullish" or "bearish".

          Requirements:
          - 1 to 2 short sentences.
          - Write in a natural, human-like voice of an active crypto community trader (sometimes casual, sometimes analytical).
          - MANDATORY: ALWAYS include the coin's cashtag tag ($SYMBOL, e.g. $BTC, $ETH, $PONS) inside the comment so CoinMarketCap automatically tags and indexes the comment.
          - Incorporate the provided market price, rank or change percentage naturally.
          - Do NOT use emojis. Do NOT use hashtags (#).
          - No generic templates or identical sentence structures. Keep comments varied!
          - Never offer professional financial advice. Do not say "this is not financial advice".

          Provide the output as a valid JSON object matching this schema:
          {
            "messages": [
              {
                "symbol": "BTC",
                "sentiment": "bullish",
                "message": "Actual comment text here"
              }
            ]
          }

          Coins list:
          ${JSON.stringify(chunk.map(c => ({ name: c.name, symbol: c.symbol, price: c.price, change_24h: c.change_24h, rank: c.cmc_rank })))}
        `;

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.8,
          max_tokens: 4000,
        });

        const rawText = response.choices[0].message.content || "{}";
        const parsed = JSON.parse(rawText.trim());
        if (parsed.messages && Array.isArray(parsed.messages)) {
          parsed.messages.forEach((msg: any) => {
            const matchCoin = chunk.find(c => c.symbol.toLowerCase() === msg.symbol?.toLowerCase());
            if (matchCoin && !generatedMessages.some(m => m.symbol.toLowerCase() === matchCoin.symbol.toLowerCase())) {
              const formattedComment = formatCommentWithCashtag(msg.message, matchCoin.symbol);
              generatedMessages.push({
                name: matchCoin.name,
                symbol: matchCoin.symbol,
                url: matchCoin.url,
                message: formattedComment,
                sentiment: msg.sentiment === "bearish" ? "bearish" : "bullish",
              });
            }
          });
        }
      }
    } catch (apiError) {
      const errMsg = (apiError as Error).message;
      addLog("error", `OpenAI API Call failed: ${errMsg}.`);
      lastOpenAiError = errMsg;
    }
  }

  // 2. Fallback Model: Gemini gemini-3.5-flash (Send ONLY missing coins - Item 6)
  const missingForGemini = getMissingCoins();
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (missingForGemini.length > 0 && geminiKey) {
    try {
      lastGeminiError = null; // Reset previous error if we have a key and are trying again
      addLog("info", `Using Gemini API (gemini-3.5-flash) to generate ${missingForGemini.length} missing comments...`);
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'custom-comment-generator',
          }
        }
      });

      const batchSize = 10;
      for (let i = 0; i < missingForGemini.length; i += batchSize) {
        if (!isGeneratingRunning) {
          addLog("warning", "Comment generation aborted by user.");
          break;
        }
        const chunk = missingForGemini.slice(i, i + batchSize);
        addLog("info", `Generating batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(missingForGemini.length / batchSize)} with gemini-3.5-flash (${chunk.length} coins)...`);

        const prompt = `
          Generate ONE unique, creative, organic CoinMarketCap community comment for EACH of the following coins based on their recent market data, AND classify the sentiment as either "bullish" or "bearish".

          Requirements:
          - 1 to 2 short sentences.
          - Write in a natural, human-like voice of an active crypto community trader (sometimes casual, sometimes analytical).
          - MANDATORY: ALWAYS include the coin's cashtag tag ($SYMBOL, e.g. $BTC, $ETH, $PONS) inside the comment so CoinMarketCap automatically tags and indexes the comment.
          - Incorporate the provided market price, rank or change percentage naturally.
          - Do NOT use emojis. Do NOT use hashtags (#).
          - No generic templates or identical sentence structures. Keep comments varied!
          - Never offer professional financial advice. Do not say "this is not financial advice".

          Provide the output as a valid JSON object matching this schema:
          {
            "messages": [
              {
                "symbol": "BTC",
                "sentiment": "bullish",
                "message": "Actual comment text here"
              }
            ]
          }

          Coins list:
          ${JSON.stringify(chunk.map(c => ({ name: c.name, symbol: c.symbol, price: c.price, change_24h: c.change_24h, rank: c.cmc_rank })))}
        `;

        // Retry Gemini up to 3 times with exponential backoff on 503 or 429 (Item 7)
        let response: any = null;
        for (let gAttempt = 1; gAttempt <= 3; gAttempt++) {
          try {
            response = await ai.models.generateContent({
              model: "gemini-3.5-flash",
              contents: prompt,
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    messages: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          symbol: { type: Type.STRING },
                          sentiment: { type: Type.STRING },
                          message: { type: Type.STRING }
                        },
                        required: ["symbol", "sentiment", "message"]
                      }
                    }
                  },
                  required: ["messages"]
                }
              }
            });
            break; // Succeeded!
          } catch (gErr) {
            const errStr = (gErr as Error).message || "";
            if ((errStr.includes("503") || errStr.includes("429") || errStr.toLowerCase().includes("high demand") || errStr.includes("ResourceExhausted") || errStr.includes("Unavailable")) && gAttempt < 3) {
              addLog("warning", `Gemini returned high-demand or rate-limit status (${errStr}). Retrying batch in ${gAttempt * 2}s (Attempt ${gAttempt + 1}/3)...`);
              await new Promise(resolve => setTimeout(resolve, gAttempt * 2000));
            } else {
              throw gErr;
            }
          }
        }

        if (response) {
          const rawText = response.text || "{}";
          const parsed = JSON.parse(rawText.trim());
          if (parsed.messages && Array.isArray(parsed.messages)) {
            parsed.messages.forEach((msg: any) => {
              const matchCoin = chunk.find(c => c.symbol.toLowerCase() === msg.symbol?.toLowerCase());
              if (matchCoin && !generatedMessages.some(m => m.symbol.toLowerCase() === matchCoin.symbol.toLowerCase())) {
                const formattedComment = formatCommentWithCashtag(msg.message, matchCoin.symbol);
                generatedMessages.push({
                  name: matchCoin.name,
                  symbol: matchCoin.symbol,
                  url: matchCoin.url,
                  message: formattedComment,
                  sentiment: msg.sentiment === "bearish" ? "bearish" : "bullish",
                });
              }
            });
          }
        }
      }
    } catch (geminiError) {
      const errMsg = (geminiError as Error).message;
      addLog("error", `Gemini API Call failed: ${errMsg}.`);
      lastGeminiError = errMsg;
    }
  }

  // 3. Fill ANY remaining missing coins from templates (Item 6)
  const remainingMissing = getMissingCoins();
  if (remainingMissing.length > 0) {
    addLog("warning", `Filling ${remainingMissing.length} remaining comments using rule-based templates...`);
    
    const templates = {
      bullish: [
        (c: Coin) => `$${c.symbol} is looking extremely strong right now. Holding support beautifully and volume is accelerating. Next target looks very interesting!`,
        (c: Coin) => `A strong 24h gain of ${c.change_24h}% for $${c.symbol}. The consolidation phase seems finished, expecting higher levels very soon.`,
        (c: Coin) => `Volume on $${c.symbol} is absolutely popping. If we break this local resistance, we could easily see another leg up.`,
        (c: Coin) => `Loving the price action on $${c.symbol} lately. Steady accumulation going on in this range.`,
      ],
      bearish: [
        (c: Coin) => `$${c.symbol} has some short-term pressure. Volume is declining, let's see if the key support holds.`,
        (c: Coin) => `Slight pullback for $${c.symbol} at ${c.price}. Good opportunity to DCA before the next bounce.`,
        (c: Coin) => `A ${c.change_24h}% pullback on $${c.symbol}. Watching the 4h charts closely for a reversal sign.`,
        (c: Coin) => `Momentum is flat for $${c.symbol} today. Waiting for a breakout trigger before entering more positions.`,
      ]
    };

    remainingMissing.forEach((coin, index) => {
      const isBullish = coin.change_24h >= 0;
      const list = isBullish ? templates.bullish : templates.bearish;
      const fn = list[index % list.length];
      const formattedComment = formatCommentWithCashtag(fn(coin), coin.symbol);
      generatedMessages.push({
        name: coin.name,
        symbol: coin.symbol,
        url: coin.url,
        message: formattedComment,
        sentiment: isBullish ? "bullish" : "bearish",
      });
    });
  }

  await writeJsonFile(GENERATED_MESSAGES_FILE, generatedMessages);
  saveBotProgress({ next_index: 0 });
  updateRealGenerateTime();
  return generatedMessages.length;
}

// 6. Fetch Trending Coins Endpoint (Mutex and Progress Locked)
app.post("/api/fetch-trending", async (req, res) => {
  if (isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot trigger manual actions while the Continuous Automation Loop is active." });
  }
  if (isBusy()) {
    return res.status(400).json({ error: "Another automated process is currently running. Please wait for it to finish." });
  }

  const prevMessages = readJsonFile<GeneratedMessage[]>(GENERATED_MESSAGES_FILE, []);
  const prevProgress = readBotProgress();
  if (prevMessages.length > 0 && prevProgress.next_index < prevMessages.length) {
    addLog("warning", `Operation blocked: A posting run is currently in progress (${prevProgress.next_index}/${prevMessages.length} posted). Please wait until all coins are posted or manually click Reset Storage.`);
    return res.status(400).json({
      error: `A posting run is in progress (${prevProgress.next_index}/${prevMessages.length} posted). Please complete it or click Reset Storage first.`
    });
  }

  if (botStatus === "Fetching") {
    return res.status(409).json({ error: "Cryptocurrencylistings fetch is already in progress." });
  }

  addLog("info", "Starting cryptocurrency listings fetch...");
  botStatus = "Fetching";

  try {
    const { coins, creditCount } = await executeFetchTrending();
    addLog("success", `Successfully fetched ${coins.length} coins. (Credits consumed: ${creditCount})`);
    botStatus = "Idle";
    const ts = getRealTimestamps();
    res.json({ status: "success", coins, credit_count: creditCount, coinsFetchedAt: ts.coinsFetchedAt, coinsFetchedTime: ts.coinsFetchedTime });
  } catch (error) {
    addLog("error", `Failed fetching coins: ${(error as Error).message}`);
    botStatus = "Idle";
    res.status(500).json({ status: "error", message: (error as Error).message });
  }
});

// 7. Generate community messages Endpoint (Mutex and Progress Locked)
app.post("/api/generate-messages", async (req, res) => {
  if (isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot trigger manual actions while the Continuous Automation Loop is active." });
  }
  if (isBusy()) {
    return res.status(400).json({ error: "Another automated process is currently running. Please wait for it to finish." });
  }

  if (isGeneratingRunning) {
    return res.status(409).json({ error: "A message generation run is already in progress." });
  }

  // DATA CONSISTENCY CHECK: Ensure we actually have trending coins
  const coins = readJsonFile<Coin[]>(LAST_TRENDING_FILE, []);
  if (coins.length === 0) {
    addLog("error", "Data inconsistency: Trending coins list is empty. Please fetch trending data first.");
    return res.status(400).json({ error: "Cannot generate comments: Trending coins list is empty. Please fetch trending data first." });
  }

  const prevMessages = readJsonFile<GeneratedMessage[]>(GENERATED_MESSAGES_FILE, []);
  const prevProgress = readBotProgress();
  if (prevMessages.length > 0 && prevProgress.next_index < prevMessages.length) {
    addLog("warning", `Operation blocked: A posting run is currently in progress (${prevProgress.next_index}/${prevMessages.length} posted). Please wait until all coins are posted or manually click Reset Storage.`);
    return res.status(400).json({
      error: `A posting run is in progress (${prevProgress.next_index}/${prevMessages.length} posted). Please complete it or click Reset Storage first.`
    });
  }

  addLog("info", "Starting community comments generation...");
  botStatus = "Generating";
  isGeneratingRunning = true;

  try {
    const count = await executeGenerateMessages();
    addLog("success", `Successfully generated community comments for all ${count} coins! Saved to generated_messages.json.`);
    botStatus = "Idle";
    const ts = getRealTimestamps();
    res.json({ status: "success", count, commentsGeneratedAt: ts.commentsGeneratedAt, commentsGeneratedTime: ts.commentsGeneratedTime });
  } catch (error) {
    addLog("error", `Failed message generation: ${(error as Error).message}`);
    botStatus = "Idle";
    res.status(500).json({ status: "error", message: (error as Error).message });
  } finally {
    isGeneratingRunning = false;
  }
});

// 8. Start posting sequence (Loop)
app.post("/api/post-chat", (req, res) => {
  if (isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot trigger manual actions while the Continuous Automation Loop is active." });
  }
  if (isBusy() && !isPostingRunning) {
    return res.status(400).json({ error: "Another automated process is currently running. Please wait for it to finish." });
  }

  if (isPostingRunning) {
    return res.json({ status: "success", message: "Bot posting sequence is already active." });
  }

  const coins = readJsonFile<Coin[]>(LAST_TRENDING_FILE, []);
  const messages = readJsonFile<GeneratedMessage[]>(GENERATED_MESSAGES_FILE, []);

  if (coins.length === 0) {
    addLog("error", "Data inconsistency: Trending coins list is empty. Please fetch trending data first.");
    return res.status(400).json({ error: "Cannot start posting: Trending coins list is empty. Please fetch trending data and generate comments first." });
  }

  if (messages.length === 0) {
    addLog("error", "Data inconsistency: Generated comments are empty. Please generate comments first.");
    return res.status(400).json({ error: "Cannot start posting: No generated comments found. Please generate comments first." });
  }

  // Let's also verify that there is no misalignment (e.g. they should correspond to the active profile's latest session)
  addLog("info", `Consistency check passed: ${coins.length} coins and ${messages.length} comments are loaded for the active account.`);

  isPostingRunning = true;
  botStatus = "Posting";
  addLog("info", "Initiating automated posting cycle...");

  // Start from index 0 to scan and find all pending coins, skipping any completed or failed ones
  currentPostingIndex = 0;

  // Start asynchronous runner
  runPostingLoop();

  res.json({
    status: "success",
    message: "Posting sequence started successfully.",
    startIndex: 0,
  });
});

// Asynchronous Posting Loop
async function runPostingLoop() {
  const messages = readJsonFile<GeneratedMessage[]>(GENERATED_MESSAGES_FILE, []);
  const results = readJsonFile<PostResult[]>(RESULTS_FILE, []);
  
  let consecutiveFailures = 0;
  let sharedBrowser: any = null;

  try {
    currentCoinName = "Verifying Session...";
    addLog("info", "Always verifying active session status before posting...");
    try {
      const loginCheck = await checkLoginReal();
      if (loginCheck.status !== "success") {
        addLog("warning", `[SESSION WARNING] Session check returned: ${loginCheck.status} (${loginCheck.message}). Trying to proceed anyway, but posts may fail if cookies are expired.`);
      } else {
        addLog("success", "[SESSION SUCCESS] Session verified as ACTIVE!");
      }
    } catch (err) {
      addLog("error", `[SESSION ERROR] Failed to run automated session check: ${(err as Error).message}`);
    }

    // Find the first truly pending coin in the list
    const firstPendingIdx = messages.findIndex(msgItem => !results.some(r => r.symbol.toLowerCase() === msgItem.symbol.toLowerCase()));
    if (firstPendingIdx === -1) {
      addLog("success", "All coins in the queue have already been processed (either successfully posted or failed). No pending coins left to post.");
      isPostingRunning = false;
      botStatus = "Completed";
      currentCoinName = "N/A";
      if (isContinuousLoopActive) {
        addLog("info", `[AUTOMATION] All coins already processed. Triggering ${continuousLoopIntervalMinutes}-minute gap interval before next cycle...`);
        scheduleNextAutomationCycle();
      }
      return;
    }
    currentPostingIndex = firstPendingIdx;

    const initialPendingList = messages.filter(msgItem => !results.some(r => r.symbol.toLowerCase() === msgItem.symbol.toLowerCase()));
    const initialPendingCount = initialPendingList.length;
    let activeQueueNum = 0;

    try {
      addLog("info", "Pre-launching single shared Playwright browser instance for full posting sequence...");
      sharedBrowser = await launchBrowserResilient({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-blink-features=AutomationControlled",
        ]
      });
    } catch (browserErr) {
      addLog("error", `Failed to pre-launch shared browser: ${(browserErr as Error).message}. Will launch on-demand.`);
    }

    while (isPostingRunning && currentPostingIndex < messages.length) {
      const item = messages[currentPostingIndex];
      
      // Item 15: Per-account daily post limit check (default 500 posts/day)
      const MAX_DAILY_POSTS = getAccountDailyPostLimit();
      const progressData = readBotProgress();
      const todayStr = getTodayDateString();
      let dailyPostCount = progressData.daily_post_count || 0;

      if (dailyPostCount >= MAX_DAILY_POSTS) {
        addLog("warning", `[DAILY LIMIT] Account reached daily limit of ${MAX_DAILY_POSTS} posts for ${todayStr} (Count: ${dailyPostCount}/${MAX_DAILY_POSTS}). Halting run until tomorrow.`);
        isPostingRunning = false;
        botStatus = "Completed";
        if (isContinuousLoopActive) {
          scheduleNextAutomationCycle();
        }
        break;
      }

      // Check if this coin has already been successfully or unsuccessfully posted
      const currentResults = readJsonFile<PostResult[]>(RESULTS_FILE, []);
      const existingResult = currentResults.find(r => r.symbol.toLowerCase() === item.symbol.toLowerCase());
      if (existingResult) {
        currentPostingIndex++;
        saveBotProgress({ next_index: currentPostingIndex, daily_post_count: dailyPostCount, last_post_date: todayStr });
        continue;
      }

      activeQueueNum++;
      currentCoinName = `${item.name} (${item.symbol})`;
      saveBotProgress({ next_index: currentPostingIndex, daily_post_count: dailyPostCount, last_post_date: todayStr });

      addLog("info", `----------------------------------------`);
      addLog("info", `Executing Post Sequence [Queue Item #${activeQueueNum} of ${initialPendingCount} remaining]: ${currentCoinName}`);

      // Wait 1-2 seconds to simulate browser startup/navigation
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

      if (!isPostingRunning) break;

      let outcome: PostResult["status"] = "success";
      let messageText = "Posted successfully";

      addLog("info", `Launching automated Playwright context for ${item.name}...`);
      try {
        const resolvedUrl = await resolveToFirstPartyUrl(item.url, item.symbol, item.name);
        const realResult = await runRealPosting(resolvedUrl, item.message, item.sentiment || "bullish", sharedBrowser);
        outcome = realResult.status;
        messageText = realResult.message;
      } catch (err) {
        outcome = "failed";
        messageText = `Playwright runtime error: ${(err as Error).message}`;
        addLog("error", `CRITICAL Error during automation: ${messageText}`);
      }

      if (outcome === "success") {
        consecutiveFailures = 0;
        dailyPostCount++;
        addLog("success", `SUCCESS: Completed comment posted for ${item.symbol}! (Account daily count: ${dailyPostCount}/${MAX_DAILY_POSTS})`);
        
        results.push({
          name: item.name,
          symbol: item.symbol,
          url: item.url,
          status: outcome,
          message: messageText,
          timestamp: new Date().toLocaleTimeString(),
          sentiment: item.sentiment || "bullish",
        });
        writeJsonFile(RESULTS_FILE, results);
        
        currentPostingIndex++;
        saveBotProgress({ next_index: currentPostingIndex, daily_post_count: dailyPostCount, last_post_date: todayStr });
      } else if (outcome === "skipped") {
        addLog("warning", `SKIPPED: Skipped posting for ${item.symbol} (${messageText}).`);
        
        results.push({
          name: item.name,
          symbol: item.symbol,
          url: item.url,
          status: outcome,
          message: messageText,
          timestamp: new Date().toLocaleTimeString(),
          sentiment: item.sentiment || "bullish",
        });
        writeJsonFile(RESULTS_FILE, results);
        
        currentPostingIndex++;
        saveBotProgress({ next_index: currentPostingIndex, daily_post_count: dailyPostCount, last_post_date: todayStr });
      } else {
        // Captcha, expired or failed
        consecutiveFailures++;
        addLog("warning", `WARNING: Post failed for ${item.symbol} with status '${outcome}' (${consecutiveFailures}/3 consecutive failures).`);
        
        results.push({
          name: item.name,
          symbol: item.symbol,
          url: item.url,
          status: outcome,
          message: messageText,
          timestamp: new Date().toLocaleTimeString(),
          sentiment: item.sentiment || "bullish",
        });
        writeJsonFile(RESULTS_FILE, results);
        
        currentPostingIndex++;
        saveBotProgress({ next_index: currentPostingIndex, daily_post_count: dailyPostCount, last_post_date: todayStr });

        // Item 14: Stop account posting run immediately on captcha or expired session instead of looping through all remaining coins
        if (outcome === "expired" || outcome === "captcha") {
          addLog("error", `CRITICAL: Automated posting halted immediately because account session is ${outcome.toUpperCase()} (${messageText}). Stopping run to protect account.`);
          isPostingRunning = false;
          botStatus = "Idle";
          if (isContinuousLoopActive) {
            cancelNextAutomationCycle();
            addLog("error", `[AUTOMATION] Continuous automation loop disabled due to ${outcome} session state. Re-authenticate account to resume.`);
          }
          break;
        }

        if (consecutiveFailures >= 3) {
          addLog("error", "CRITICAL: Automated posting paused due to 3 consecutive failures. Please verify your CoinMarketCap login session and cookies.");
          isPostingRunning = false;
          botStatus = "Idle";
          if (isContinuousLoopActive) {
            cancelNextAutomationCycle();
            addLog("error", "[AUTOMATION] Continuous automation loop disabled due to 3 consecutive authentication failures.");
          }
          break;
        }
        addLog("info", "Skipping to next coin to maintain end-to-end automation run...");
      }

      // Interval spacing between posts to target 2-3 coins per minute (approx 18-22 seconds delay)
      const spacing = 18000 + Math.random() * 4000;
      addLog("info", `Cooling down for ${(spacing / 1000).toFixed(1)} seconds to maintain a posting rate of 2-3 coins per minute...`);
      await interruptibleSleep(spacing);
    }

    if (currentPostingIndex >= messages.length) {
      addLog("success", "CONGRATULATIONS: Complete automated posting run finished successfully!");
      botStatus = "Completed";
      isPostingRunning = false;
      if (isContinuousLoopActive) {
        addLog("info", `[AUTOMATION] Continuous automation mode is enabled. Triggering ${continuousLoopIntervalMinutes}-minute gap interval...`);
        scheduleNextAutomationCycle();
      }
    } else if (!isPostingRunning) {
      botStatus = "Idle";
    }
  } finally {
    if (sharedBrowser) {
      addLog("info", "Closing shared Playwright browser instance...");
      await sharedBrowser.close().catch(() => {});
      sharedBrowser = null;
    }
    isPostingRunning = false;
    isStopping = false;
    if (botStatus !== "Completed") {
      botStatus = "Idle";
    }
    currentCoinName = "N/A";
    addLog("info", "Posting engine has fully halted and settled.");
  }
}

// 9. Stop posting loop
app.post("/api/stop-posting", (req, res) => {
  if (isPostingRunning || isGeneratingRunning || botStatus === "Posting" || botStatus === "Generating") {
    isStopping = true;
    botStatus = "Stopping";
  } else {
    isStopping = false;
    botStatus = "Idle";
  }
  isPostingRunning = false;
  isGeneratingRunning = false;
  isFullFlowAborted = true;
  cancelNextAutomationCycle();
  addLog("warning", "Automated sequence stop requested. Gracefully finishing in-flight action and halting browser engine...");
  res.json({ success: true, message: "Stop signal sent. Halting engine cleanly..." });
});

// 10. Full flow execution
app.post("/api/full-flow", async (req, res) => {
  if (isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot trigger manual actions while the Continuous Automation Loop is active." });
  }
  if (isBusy() && !isPostingRunning) {
    return res.status(400).json({ error: "Another automated process is currently running. Please wait for it to finish." });
  }

  addLog("info", "========================================");
  addLog("info", "Starting Full Bot Flow End-to-End Sequence...");
  addLog("info", "========================================");

  try {
    const prevMessages = readJsonFile<GeneratedMessage[]>(GENERATED_MESSAGES_FILE, []);
    const prevProgress = readBotProgress();

    const reqContinuous = req.body.continuous !== undefined ? !!req.body.continuous : true;
    isContinuousLoopActive = reqContinuous;
    const reqInterval = req.body.intervalMinutes !== undefined ? Math.max(5, Math.round(Number(req.body.intervalMinutes))) : continuousLoopIntervalMinutes;
    if (reqInterval > 0) {
      continuousLoopIntervalMinutes = Math.max(5, reqInterval);
    }
    if (isContinuousLoopActive) {
      addLog("info", `[AUTOMATION] Continuous Loop Mode has been ENABLED for this execution sequence (${continuousLoopIntervalMinutes}-minute gap).`);
    }

    if (prevMessages.length > 0 && prevProgress.next_index < prevMessages.length) {
      addLog("info", `[FLOW RESUME] A posting run is already in progress (${prevProgress.next_index}/${prevMessages.length} posted). Skipping storage reset.`);
      addLog("info", `[FLOW RESUME] Resuming the posting sequence from index ${prevProgress.next_index}...`);
      
      if (!isPostingRunning) {
        isPostingRunning = true;
        botStatus = "Posting";
        currentPostingIndex = prevProgress.next_index;
        runPostingLoop();
      }

      return res.json({
        success: true,
        message: `End-to-End sequence resumed successfully from index ${prevProgress.next_index}. Monitoring logs...`,
      });
    }

    addLog("info", "[FLOW FRESH] All previous coins posted or no previous run. Starting clean full cycle...");
    writeJsonFile(RESULTS_FILE, []);
    saveBotProgress({ next_index: 0 });

    isFullFlowAborted = false;

    // Step 1: Fetch
    addLog("info", "[FLOW STEP 1/3] Fetching latest trending coins...");
    botStatus = "Fetching";
    await executeFetchTrending();

    if (isFullFlowAborted) {
      addLog("warning", "Full automated sequence aborted by user during Fetching phase.");
      botStatus = "Idle";
      return res.json({ success: false, message: "Sequence aborted by user." });
    }

    // Step 2: Generate
    addLog("info", "[FLOW STEP 2/3] Generating custom community comments...");
    botStatus = "Generating";
    isGeneratingRunning = true;
    try {
      await executeGenerateMessages();
    } finally {
      isGeneratingRunning = false;
    }

    if (isFullFlowAborted) {
      addLog("warning", "Full automated sequence aborted by user during Generation phase.");
      botStatus = "Idle";
      return res.json({ success: false, message: "Sequence aborted by user." });
    }

    // Step 3: Post
    addLog("info", "[FLOW STEP 3/3] Launching automated comment submitter...");
    isPostingRunning = true;
    botStatus = "Posting";
    currentPostingIndex = 0;
    runPostingLoop();

    res.json({
      success: true,
      message: "End-to-End sequence started successfully. Monitoring logs...",
    });
  } catch (error) {
    addLog("error", `Full Flow failed: ${(error as Error).message}`);
    botStatus = "Idle";
    isPostingRunning = false;
    isGeneratingRunning = false;
    if (isContinuousLoopActive) {
      scheduleNextAutomationCycle();
    }
    res.status(500).json({ error: (error as Error).message });
  }
});

// 11. Clear Logs & Stats
app.post("/api/clear-all", async (req, res) => {
  if (isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot reset storage / clear stats while the Continuous Automation Loop is active." });
  }
  if (isBusy()) {
    return res.status(400).json({ error: "Cannot reset storage / clear stats while another process is running." });
  }
  try {
    logs = [];
    writeJsonFile(LAST_TRENDING_FILE, []);
    writeJsonFile(GENERATED_MESSAGES_FILE, []);
    writeJsonFile(RESULTS_FILE, []);
    saveBotProgress({ next_index: 0, daily_post_count: 0 });
    clearRealTimestamps();
    currentPostingIndex = 0;
    currentCoinName = "N/A";
    botStatus = "Idle";

    // Dynamic Cloud Firestore synchronization for active profile
    const activeId = getActiveProfileId();
    try {
      await saveTrendingCoinsCloud([], activeId || undefined);
      await saveGeneratedMessagesCloud([], activeId || undefined);
      await savePostResultsCloud([], activeId || undefined);
      await saveBotProgressCloud(readBotProgress(), activeId || undefined);
    } catch (err) {
      console.error("[FIREBASE] Error syncing cleared state to cloud for active profile:", (err as Error).message);
    }

    addLog("success", "Console cleared. Reset trending data, comments, and results for the active account only.");
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 12. Get current logs stream with per-profile isolation
app.get("/api/logs", (req, res) => {
  const queryProfileId = req.query.profileId as string | undefined;
  const activeId = queryProfileId || getActiveProfileId();
  if (activeId) {
    const profileLogs = logs.filter(l => !l.profileId || l.profileId === activeId);
    return res.json({ logs: profileLogs.slice(-100) });
  }
  res.json({ logs: logs.slice(-100) });
});

// ============================================================================
// CSV DOWNLOAD EXPORTERS (Item 11: RFC 4180 Escaping)
// ============================================================================
function escapeCsvField(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

app.get("/api/download/trending_coins.csv", (req, res) => {
  const activeId = getActiveProfileId();
  const sessionExists = fs.existsSync(AUTH_STATE_FILE);
  const coins = (!activeId || !sessionExists) ? [] : readJsonFile<Coin[]>(LAST_TRENDING_FILE, []);
  let csv = "Name,Symbol,Price,Change_1h,Change_24h,Change_7d,Market_Cap,Volume_24h,Rank,Slug,Url\n";
  coins.forEach(c => {
    csv += `${escapeCsvField(c.name)},${escapeCsvField(c.symbol)},${escapeCsvField(c.price)},${escapeCsvField(c.change_1h || 0)},${escapeCsvField(c.change_24h)},${escapeCsvField(c.change_7d || 0)},${escapeCsvField(c.market_cap)},${escapeCsvField(c.volume_24h)},${escapeCsvField(c.cmc_rank || "")},${escapeCsvField(c.slug)},${escapeCsvField(c.url)}\n`;
  });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=trending_coins.csv");
  res.send(csv);
});

app.get("/api/download/generated_comments.csv", (req, res) => {
  const activeId = getActiveProfileId();
  const sessionExists = fs.existsSync(AUTH_STATE_FILE);
  const messages = (!activeId || !sessionExists) ? [] : readJsonFile<GeneratedMessage[]>(GENERATED_MESSAGES_FILE, []);
  let csv = "Asset Name,Symbol,Sentiment,Generated Comment,Target URL\n";
  messages.forEach(m => {
    csv += `${escapeCsvField(m.name)},${escapeCsvField(m.symbol)},${escapeCsvField(m.sentiment || "bullish")},${escapeCsvField(m.message || "")},${escapeCsvField(m.url)}\n`;
  });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=generated_comments.csv");
  res.send(csv);
});

app.get("/api/download/post_submissions.csv", (req, res) => {
  const activeId = getActiveProfileId();
  const sessionExists = fs.existsSync(AUTH_STATE_FILE);
  const results = (!activeId || !sessionExists) ? [] : readJsonFile<PostResult[]>(RESULTS_FILE, []);
  let csv = "Timestamp,Asset Name,Symbol,Sentiment,Post Status,Log Message,Target URL\n";
  results.forEach(r => {
    csv += `${escapeCsvField(r.timestamp || "N/A")},${escapeCsvField(r.name)},${escapeCsvField(r.symbol)},${escapeCsvField(r.sentiment || "bullish")},${escapeCsvField(r.status)},${escapeCsvField(r.message || "")},${escapeCsvField(r.url)}\n`;
  });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=post_submissions.csv");
  res.send(csv);
});

app.get("/api/download/overall_report.csv", (req, res) => {
  const activeId = getActiveProfileId();
  const sessionExists = fs.existsSync(AUTH_STATE_FILE);
  const coins = (!activeId || !sessionExists) ? [] : readJsonFile<Coin[]>(LAST_TRENDING_FILE, []);
  const messages = (!activeId || !sessionExists) ? [] : readJsonFile<GeneratedMessage[]>(GENERATED_MESSAGES_FILE, []);
  const results = (!activeId || !sessionExists) ? [] : readJsonFile<PostResult[]>(RESULTS_FILE, []);
  const successCount = results.filter(r => r.status === "success").length;
  const failedCount = results.filter(r => r.status !== "success").length;
  const successRate = results.length > 0 ? ((successCount / results.length) * 100).toFixed(1) : "0.0";

  let csv = "Metric,Value,Description\n";
  csv += `${escapeCsvField("Total Trending Coins")},${escapeCsvField(coins.length)},${escapeCsvField("Total coins fetched from market")}\n`;
  csv += `${escapeCsvField("Generated Comments Count")},${escapeCsvField(messages.length)},${escapeCsvField("Custom comments prepared for submission")}\n`;
  csv += `${escapeCsvField("Total Submissions Executed")},${escapeCsvField(results.length)},${escapeCsvField("Posts attempted")}\n`;
  csv += `${escapeCsvField("Successful Posts")},${escapeCsvField(successCount)},${escapeCsvField("Successfully posted comments")}\n`;
  csv += `${escapeCsvField("Failed/Skipped Posts")},${escapeCsvField(failedCount)},${escapeCsvField("Posts that failed or were manually skipped")}\n`;
  csv += `${escapeCsvField("Overall Success Rate")},${escapeCsvField(`${successRate}%`)},${escapeCsvField("Success rate percentage")}\n`;
  csv += `${escapeCsvField("Execution Mode")},${escapeCsvField(runMode)},${escapeCsvField("Execution environment configuration")}\n`;
  csv += `${escapeCsvField("Report Generated At")},${escapeCsvField(new Date().toLocaleString())},${escapeCsvField("Timestamp of export")}\n`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=overall_report.csv");
  res.send(csv);
});


// ============================================================================
// VITE OR STATIC FILES SERVING MIDDLEWARE
// ============================================================================
function sessionHasValidCookies(str: string): boolean {
  if (!str || !str.trim()) return false;
  try {
    const parsed = JSON.parse(str);
    const cookies = Array.isArray(parsed) ? parsed : (parsed.cookies || []);
    return Array.isArray(cookies) && cookies.length > 0;
  } catch (_) {
    return false;
  }
}

function synchronizeSessionsAndProfilesOnStartup() {
  try {
    let profiles = readJsonFile<any[]>(PROFILES_FILE, []);
    const sessionExists = fs.existsSync(AUTH_STATE_FILE);
    let sessionContent = "";
    if (sessionExists) {
      sessionContent = fs.readFileSync(AUTH_STATE_FILE, "utf-8").trim();
    }

    const hasValidLocalSession = sessionExists && sessionHasValidCookies(sessionContent);
    const activeProfile = profiles.find(p => p.isActive);

    if (hasValidLocalSession) {
      // We have a verified local session file with real cookies
      if (activeProfile) {
        if (activeProfile.stateJson !== sessionContent) {
          // Update active profile's cookies with the session file cookies
          activeProfile.stateJson = sessionContent;
          activeProfile.updatedAt = new Date().toISOString();
          fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
          saveProfilesCloud(profiles).catch(err => console.error("[FIREBASE] Error syncing profiles on startup sync:", err.message));
          addLog("success", `[SYNC] Synchronized active profile "${activeProfile.name}" with auth/state.json cookies.`);
        }
      } else {
        // We have a valid session with real cookies but no active profile. Create/activate one!
        const name = "Imported Session";
        const profileId = `profile-${Date.now()}`;
        const newProfile = {
          id: profileId,
          name,
          stateJson: sessionContent,
          isActive: true,
          updatedAt: new Date().toISOString()
        };
        profiles.push(newProfile);
        fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
        saveProfilesCloud(profiles).catch(err => console.error("[FIREBASE] Error saving new profile on startup sync:", err.message));
        addLog("success", `[SYNC] Created and activated a new profile "${name}" for the existing active session.`);
      }
    } else {
      // Session file does not exist or has empty/invalid cookies.
      // Do we have an active profile with valid cookies?
      if (activeProfile && sessionHasValidCookies(activeProfile.stateJson)) {
        // Restore session file from active profile!
        fs.writeFileSync(AUTH_STATE_FILE, activeProfile.stateJson, "utf-8");
        saveSessionStateCloud(activeProfile.stateJson, activeProfile.id).catch(err => console.error("[FIREBASE] Error saving session to cloud on startup sync:", err.message));
        addLog("success", `[SYNC] Restored auth/state.json session state from active profile "${activeProfile.name}".`);
      } else {
        // No valid local session and active profile has no valid cookies.
        // Mark inactive if activeProfile has no valid cookies, but do NOT auto-create empty profiles
        let changed = false;
        profiles = profiles.map(p => {
          if (p.isActive && !sessionHasValidCookies(p.stateJson)) {
            changed = true;
            return { ...p, isActive: false };
          }
          return p;
        });
        if (changed) {
          fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
          saveProfilesCloud(profiles).catch(err => console.error("[FIREBASE] Error saving profiles on startup sync:", err.message));
        }
      }
    }
  } catch (err) {
    console.error("Error in synchronizeSessionsAndProfilesOnStartup:", (err as Error).message);
  }
}

async function hydrateLocalFromCloud() {
  addLog("info", `[STORAGE] Hydrating local ephemeral storage from ${getActiveStoreName()} cloud database...`);
  try {
    // 1. Profiles FIRST so active profile id is known for subsequent scoped hydrations (Item 2 & 3)
    try {
      const cloudProfiles = await getProfilesCloud();
      if (cloudProfiles && Array.isArray(cloudProfiles) && cloudProfiles.length > 0) {
        fs.writeFileSync(PROFILES_FILE, JSON.stringify(cloudProfiles, null, 2), "utf-8");
        addLog("success", `[FIREBASE] Hydrated ${cloudProfiles.length} user accounts profiles from Firestore!`);
      }
    } catch (e) {
      console.error("[FIREBASE] Could not hydrate profiles from cloud:", e);
    }

    // Refresh active profile file paths immediately after profiles are loaded (Item 3)
    updateActiveProfilePaths();
    const activeId = getActiveProfileId();

    // 2. Session cookies for the active profile (Item 2)
    const cloudSession = await getSessionStateCloud(activeId || undefined);
    if (cloudSession && sessionHasValidCookies(cloudSession)) {
      const normalizedSession = normalizeStateJson(cloudSession);
      fs.writeFileSync(AUTH_STATE_FILE, normalizedSession, "utf-8");
      addLog("success", "[FIREBASE] Hydrated login session cookies from Firestore!");
      
      // If the session was corrected, write the normalized version back to Firestore
      if (normalizedSession !== cloudSession) {
        addLog("info", "[FIREBASE] Automatically updating Firestore cloud with corrected/normalized session cookies...");
        saveSessionStateCloud(normalizedSession, activeId || undefined).catch((e) => {
          console.error("[FIREBASE] Error updating normalized session back to cloud:", e.message);
        });
      }
    } else {
      addLog("info", "[FIREBASE] No session cookies found in Firestore for current active profile.");
    }

    // 3. Trending Coins for active profile (Item 2)
    const cloudCoins = await getTrendingCoinsCloud(activeId || undefined);
    if (cloudCoins && cloudCoins.length > 0) {
      fs.writeFileSync(LAST_TRENDING_FILE, JSON.stringify(cloudCoins, null, 2), "utf-8");
      addLog("success", `[FIREBASE] Hydrated ${cloudCoins.length} trending coins from Firestore!`);
    }

    // 4. Generated Messages for active profile (Item 2)
    const cloudMessages = await getGeneratedMessagesCloud(activeId || undefined);
    if (cloudMessages && cloudMessages.length > 0) {
      fs.writeFileSync(GENERATED_MESSAGES_FILE, JSON.stringify(cloudMessages, null, 2), "utf-8");
      addLog("success", `[FIREBASE] Hydrated ${cloudMessages.length} generated messages from Firestore!`);
    }

    // 5. Post Results for active profile (Item 2)
    const cloudResults = await getPostResultsCloud(activeId || undefined);
    if (cloudResults && cloudResults.length > 0) {
      fs.writeFileSync(RESULTS_FILE, JSON.stringify(cloudResults, null, 2), "utf-8");
      addLog("success", `[FIREBASE] Hydrated ${cloudResults.length} post results from Firestore!`);
    }

    // 6. Bot Progress for active profile (Item 2)
    const cloudProgress = await getBotProgressCloud(activeId || undefined);
    if (cloudProgress) {
      const localProgress = readBotProgress();
      const mergedProgress = {
        ...localProgress,
        next_index: cloudProgress.next_index,
        daily_post_count: cloudProgress.daily_post_count !== undefined ? cloudProgress.daily_post_count : localProgress.daily_post_count,
        last_post_date: cloudProgress.last_post_date || localProgress.last_post_date,
        daily_post_limit: cloudProgress.daily_post_limit || localProgress.daily_post_limit || getAccountDailyPostLimit(activeId)
      };
      fs.writeFileSync(POST_PROGRESS_FILE, JSON.stringify(mergedProgress, null, 2), "utf-8");
      currentPostingIndex = cloudProgress.next_index;
      addLog("success", `[FIREBASE] Hydrated bot posting progress (index ${cloudProgress.next_index}, daily posts ${mergedProgress.daily_post_count}/${mergedProgress.daily_post_limit}) from Firestore!`);
    }

    // 7. System Logs
    const cloudLogs = await getSystemLogsCloud();
    if (cloudLogs && cloudLogs.length > 0) {
      logs = cloudLogs.slice(-100);
      addLog("success", `[FIREBASE] Hydrated ${logs.length} system logs from Firestore!`);
    }

    // Run unified sessions/profiles synchronization and re-verify paths
    synchronizeSessionsAndProfilesOnStartup();
    updateActiveProfilePaths();

    addLog("success", "[FIREBASE] Local storage state successfully synchronized with Cloud database.");
  } catch (err) {
    addLog("error", `[FIREBASE] Failed to hydrate local storage from Firestore: ${(err as Error).message}`);
  }
}

async function startServer() {
  // First, hydrate all files from Firestore cloud database
  await hydrateLocalFromCloud();

  // Defensive: Normalize local auth/state.json if present on startup
  if (fs.existsSync(AUTH_STATE_FILE)) {
    try {
      const content = fs.readFileSync(AUTH_STATE_FILE, "utf-8");
      const normalized = normalizeStateJson(content);
      if (normalized !== content) {
        fs.writeFileSync(AUTH_STATE_FILE, normalized, "utf-8");
        addLog("success", "[STARTUP] Auto-corrected and normalized existing local auth/state.json.");
      }
    } catch (e) {
      console.error("[STARTUP] Error during defensive local state normalization:", (e as Error).message);
    }
  }

  if (process.env.NODE_ENV !== "production") {
    addLog("info", "[SERVER] Running in DEVELOPMENT mode, initializing Vite dev server middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    addLog("info", "[SERVER] Running in PRODUCTION mode, serving static files...");
    let distPath = path.join(process.cwd(), "dist");
    if (!fs.existsSync(distPath)) {
      distPath = path.resolve(__dirname, "../dist");
    }
    if (!fs.existsSync(distPath)) {
      distPath = path.resolve(__dirname, "dist");
    }
    
    addLog("info", `[SERVER] Static production assets directory resolved to: ${distPath}`);
    app.use(express.static(distPath));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/") || req.path.startsWith("/output/")) {
        return next();
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
