import path from "path";
import fs from "fs";
import os from "os";
import { execSync } from "child_process";
import crypto from "crypto";
import express from "express";
import OpenAI from "openai";
import { GoogleGenAI, Type } from "@google/genai";
import {
  PORT,
  chromium,
  isOpenAiConfigured,
  isCmcConfigured,
  type ProfileTimestamps,
  type BotProgressData,
  type LogEntry,
  type Coin,
  type GeneratedMessage,
  type PostResult,
  type SystemProcessType,
  type LoginSession,
} from "./server/config.ts";
import {
  st,
  state,
  sessionHasValidCookies,
  isProfileSessionActive,
  getAvailableMarketingImages,
  getNextSingleMarketingImage,
  getLocalBotSettings,
  saveLocalBotSettings,
  escapeTelegramHtml,
  sendTelegramAlert,
  normalizeProfilesWithSchedule,
  getActiveProfileId,
  getNextImportedAccountName,
  ensureProfileDirectory,
  updateActiveProfilePaths,
  getTodayDateString,
  getActiveProfile,
  getAccountDailyPostLimit,
  isSchedulerLogMessage,
  triggerLogSync,
  addLog,
  touchProcessLock,
  acquireProcessLock,
  releaseProcessLock,
  interruptibleSleep,
  isSchedulerRunning,
  isBusy,
  normalizeStateJson,
} from "./server/state.ts";
import {
  getRealTimestamps,
  updateRealFetchTime,
  updateRealGenerateTime,
  clearRealTimestamps,
  getIsolatedResults,
  readBotProgress,
  saveBotProgress,
  pruneOldAndCompletedData,
  readJsonFile,
  autoSyncSessionToProfiles,
  writeJsonFileSyncAtomic,
  getPayloadHash,
  saveSessionStateCloudIfChanged,
  saveProfilesCloudIfChanged,
  writeJsonFile,
  syncLocalFromCloudIfStale,
  synchronizeSessionsAndProfilesOnStartup,
  hydrateLocalFromCloud,
} from "./server/sync.ts";
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
  getTimestampsCloud,
  saveTimestampsCloud,
  getSettingsCloud,
  saveSettingsCloud,
  getActiveStoreName,
  isMongoEnabled,
  isFirebaseDisabled,
  isMongoPrimary,
} from "./src/storage.ts";
import {
  normalizeProfileSchedule,
  isDue,
  orderDueAccounts,
  nextDueAt,
  parseBotSettings,
  DEFAULT_SETTINGS,
  getNextPeakTradingSession,
  PEAK_TRADING_SESSIONS,
  type BotSettings,
  type ScheduleFrequency,
  type LastRunStatus,
  type ProfileSchedule,
  type ProfileLastRun,
  type PeakSession,
  type SchedulableProfile,
} from "./src/utils/scheduler.ts";
import { cleanCommentForCmc, sanitizeCommentForAntiSpam, generateDynamicUniqueComment } from "./src/utils/formatters.ts";

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "50mb" }));

app.get("/output/last_trending.json", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  const queryProfileId = (req.query.profileId as string)?.trim();
  const activeId = queryProfileId || getActiveProfileId();
  const sessionExists = isProfileSessionActive(activeId);
  if (!activeId || !sessionExists) {
    return res.json([]);
  }

  updateActiveProfilePaths();
  const targetFile = queryProfileId ? path.join(st.OUTPUT_DIR, queryProfileId, "last_trending.json") : st.LAST_TRENDING_FILE;

  if (fs.existsSync(targetFile)) {
    return res.sendFile(targetFile);
  }
  // Fallback to shared root file if profile file not yet created
  const rootFile = path.join(st.OUTPUT_DIR, "last_trending.json");
  if (fs.existsSync(rootFile)) {
    return res.sendFile(rootFile);
  }
  res.json([]);
});

app.get("/output/generated_messages.json", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  const queryProfileId = (req.query.profileId as string)?.trim();
  const activeId = queryProfileId || getActiveProfileId();
  const sessionExists = isProfileSessionActive(activeId);
  if (!activeId || !sessionExists) {
    return res.json([]);
  }

  updateActiveProfilePaths();
  const targetFile = queryProfileId ? path.join(st.OUTPUT_DIR, queryProfileId, "generated_messages.json") : st.GENERATED_MESSAGES_FILE;

  if (fs.existsSync(targetFile)) {
    return res.sendFile(targetFile);
  }
  // Fallback to shared root file if profile file not yet created
  const rootFile = path.join(st.OUTPUT_DIR, "generated_messages.json");
  if (fs.existsSync(rootFile)) {
    return res.sendFile(rootFile);
  }
  res.json([]);
});

app.get("/output/results.json", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  const queryProfileId = (req.query.profileId as string)?.trim();
  const activeId = queryProfileId || getActiveProfileId();
  const sessionExists = isProfileSessionActive(activeId);
  if (!activeId || !sessionExists) {
    return res.json([]);
  }

  updateActiveProfilePaths();
  const targetFile = queryProfileId ? path.join(st.OUTPUT_DIR, queryProfileId, "results.json") : st.RESULTS_FILE;

  if (fs.existsSync(targetFile)) {
    return res.sendFile(targetFile);
  }
  res.json([]);
});

// Dedicated API endpoint for results to prevent file lock or caching issues
app.get("/api/results", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  const queryProfileId = (req.query.profileId as string)?.trim();
  const activeId = queryProfileId || getActiveProfileId();
  if (!activeId || !isProfileSessionActive(activeId)) {
    return res.json({ success: true, results: [] });
  }
  const rawResults = getIsolatedResults(activeId);
  const results = rawResults.filter(r => r.profileId === activeId);
  res.json({ success: true, results });
});

app.use("/output", express.static(st.OUTPUT_DIR));

try {
  if (!fs.existsSync(st.MARKETING_IMAGES_DIR)) {
    fs.mkdirSync(st.MARKETING_IMAGES_DIR, { recursive: true });
  }
} catch (err) {
  console.error("[SERVER] Error creating MARKETING_IMAGES_DIR:", err);
}

app.use("/uploads/marketing_images", express.static(st.MARKETING_IMAGES_DIR));

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

async function installPlaywrightChromium(): Promise<void> {
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return;
  }
  if (st.isInstallingPlaywright) {
    while (st.isInstallingPlaywright) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return;
  }
  st.isInstallingPlaywright = true;
  try {
    const targetBrowserPath = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.cwd(), ".cache", "ms-playwright");
    const childEnv = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: targetBrowserPath };

    addLog("info", `Executing command: PLAYWRIGHT_BROWSERS_PATH=${targetBrowserPath} npx playwright install chromium`);
    execSync(`npx playwright install chromium`, { env: childEnv, stdio: "inherit", cwd: process.cwd() });
    addLog("success", "Playwright chromium browser successfully installed!");
  } catch (err) {
    addLog("error", `Failed to automatically run playwright install: ${(err as Error).message}`);
  } finally {
    st.isInstallingPlaywright = false;
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

  // Support optional per-profile or environment proxy (native Playwright)
  if (!options.proxy) {
    const activeProf = getActiveProfile();
    const proxyStr = activeProf?.proxy || process.env.DEFAULT_PROXY;
    if (proxyStr && typeof proxyStr === "string" && proxyStr.trim()) {
      try {
        const trimmed = proxyStr.trim();
        const hasProto = trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("socks5://") || trimmed.startsWith("socks4://");
        const url = new URL(hasProto ? trimmed : `http://${trimmed}`);
        options.proxy = {
          server: `${url.protocol}//${url.host}`,
        };
        if (url.username) {
          options.proxy.username = decodeURIComponent(url.username);
        }
        if (url.password) {
          options.proxy.password = decodeURIComponent(url.password);
        }
        console.log(`[PLAYWRIGHT] Using proxy for account "${activeProf?.name || activeProf?.id || "active"}": ${options.proxy.server}`);
      } catch (proxyErr) {
        console.warn(`[PLAYWRIGHT] Could not parse proxy string "${proxyStr}": ${(proxyErr as Error).message}`);
      }
    }
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
    fs.writeFileSync(st.AUTH_STATE_FILE, JSON.stringify(parsed, null, 2), "utf-8");
    addLog("success", "Successfully initialized auth/state.json from AUTH_STATE_JSON environment variable!");
  } catch (err) {
    addLog("error", `Failed to parse AUTH_STATE_JSON environment variable: ${(err as Error).message}`);
  }
} else if (!fs.existsSync(st.AUTH_STATE_FILE)) {
  addLog("info", "No active auth/state.json session file found on startup. Waiting for profile restoration or login.");
} else {
  addLog("info", "Found existing auth/state.json session storage state.");
}

// Interfaces
function cancelNextAutomationCycle() {
  st.isContinuousLoopActive = false;
  st.isFullFlowAborted = true;
  st.nextCycleStartTime = null;
  if (st.nextCycleTimeout) {
    clearTimeout(st.nextCycleTimeout);
    st.nextCycleTimeout = null;
    addLog("info", "Scheduled continuous bot cycle has been cancelled.");
  }
  
  // Stop currently running posting loop or steps if any
  if (st.isPostingRunning) {
    st.isPostingRunning = false;
    addLog("warning", "Automated posting sequence has been stopped because the Continuous Automation Loop was disabled.");
  }
  if (st.isGeneratingRunning) {
    st.isGeneratingRunning = false;
    addLog("warning", "Automated generation process has been stopped.");
  }
  if (st.botStatus === "Fetching" || st.botStatus === "Generating" || st.botStatus === "Posting" || st.botStatus === "Completed") {
    st.botStatus = "Idle";
  }
}

async function triggerFullFlowExecution() {
  const activeId = getActiveProfileId();
  const rawProfiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
  const activeProfile = rawProfiles.find(p => p.id === activeId);
  const sessionExists = fs.existsSync(st.AUTH_STATE_FILE);
  const hasValidAuth = sessionExists && activeProfile?.stateJson && sessionHasValidCookies(activeProfile.stateJson);

  if (!activeId || !hasValidAuth) {
    addLog("error", "[AUTOMATION] Continuous automation loop cancelled: Active profile is missing a valid authenticated session. Please log in or import cookies to resume.");
    cancelNextAutomationCycle();
    st.botStatus = "Idle";
    return;
  }

  if (isBusy() || st.isPostingRunning || st.isGeneratingRunning) {
    addLog("warning", "Could not trigger automated continuous cycle: an automated process is still currently running. Postponing cycle by 1 minute...");
    if (st.isContinuousLoopActive && !st.nextCycleTimeout) {
      st.nextCycleStartTime = Date.now() + 60000;
      st.nextCycleTimeout = setTimeout(async () => {
        st.nextCycleTimeout = null;
        if (st.isContinuousLoopActive) {
          await triggerFullFlowExecution();
        }
      }, 60000);
    }
    return;
  }

  st.isFullFlowAborted = false;

  addLog("info", "========================================");
  addLog("info", "Starting Continuous Loop - Running Full Bot Cycle...");
  addLog("info", "========================================");

  // Clear previous results and progress for the new run
  await writeJsonFile(st.RESULTS_FILE, []);
  saveBotProgress({ next_index: 0 });

  try {
    // Step 1: Fetch
    addLog("info", "[FLOW STEP 1/3] Fetching latest trending coins...");
    st.botStatus = "Fetching";
    await executeFetchTrending();

    if (st.isFullFlowAborted) {
      addLog("warning", "Full automated sequence aborted by user during Fetching phase.");
      st.botStatus = "Idle";
      return;
    }

    // Step 2: Generate
    addLog("info", "[FLOW STEP 2/3] Generating custom community comments...");
    st.botStatus = "Generating";
    st.isGeneratingRunning = true;
    try {
      await executeGenerateMessages();
    } finally {
      st.isGeneratingRunning = false;
    }

    if (st.isFullFlowAborted) {
      addLog("warning", "Full automated sequence aborted by user during Generation phase.");
      st.botStatus = "Idle";
      return;
    }

    // Step 3: Post
    addLog("info", "[FLOW STEP 3/3] Launching automated comment submitter...");
    st.isStopping = false;
    st.isSingleStopping = false;
    st.stopSchedulerRequested = false;
    st.isPostingRunning = true;
    st.botStatus = "Posting";
    st.currentPostingIndex = 0;
    runPostingLoop();
  } catch (error) {
    addLog("error", `Scheduled continuous full cycle failed: ${(error as Error).message}`);
    st.botStatus = "Idle";
    st.isPostingRunning = false;
    st.isGeneratingRunning = false;
    // Schedule next one anyway if continuous loop is still active
    if (st.isContinuousLoopActive) {
      scheduleNextAutomationCycle();
    }
  }
}

function scheduleNextAutomationCycle() {
  if (st.nextCycleTimeout) {
    clearTimeout(st.nextCycleTimeout);
  }
  
  const gapMs = st.continuousLoopIntervalMinutes * 60 * 1000;
  st.nextCycleStartTime = Date.now() + gapMs;
  addLog("info", `Next automated bot cycle is scheduled to start in ${st.continuousLoopIntervalMinutes} minutes (at ${new Date(st.nextCycleStartTime).toLocaleTimeString()}).`);
  
  st.nextCycleTimeout = setTimeout(async () => {
    st.nextCycleTimeout = null;
    st.nextCycleStartTime = null;
    if (st.isContinuousLoopActive) {
      await triggerFullFlowExecution();
    }
  }, gapMs);
}


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

// Humanized typing simulation with natural micro-jitter, space pauses, and punctuation rhythm
// Guarantees absence of flat-delay bot signatures detected by WAFs / anti-bot suites
async function typeWithHumanRhythm(page: any, text: string): Promise<void> {
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    await page.keyboard.type(char);

    // Realistic human keystroke interval (35ms - 75ms)
    let charDelay = 35 + Math.floor(Math.random() * 45);

    // Natural pauses:
    // Punctuation pause (commas, periods, questions): human thought rhythm
    if (char === '.' || char === '!' || char === '?') {
      charDelay += 180 + Math.floor(Math.random() * 220);
    } else if (char === ',' || char === ';' || char === ':') {
      charDelay += 100 + Math.floor(Math.random() * 120);
    } else if (char === ' ') {
      charDelay += 40 + Math.floor(Math.random() * 60);
    }

    // Micro-jitter: 5% chance of slight cognitive hesitation (120-220ms)
    if (Math.random() < 0.05) {
      charDelay += 120 + Math.floor(Math.random() * 100);
    }

    await page.waitForTimeout(charDelay);
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

  // 5.5. Heuristic DOM element scanner fallback (Frontend Redesign & Class Obfuscation Protection)
  try {
    addLog("info", "Executing heuristic DOM element scanner fallback for comment editor...");
    const fallbackEditorHandle = await page.evaluateHandle(() => {
      // 1. Check all elements with contenteditable="true" or role="textbox"
      const editables = Array.from(document.querySelectorAll('[contenteditable="true"], [contenteditable=""], [role="textbox"], textarea'));
      for (const el of editables) {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if (rect.width > 50 && rect.height > 20 && style.visibility !== "hidden" && style.display !== "none") {
          return el;
        }
      }
      // 2. Check for inputs inside containers mentioning comments/thoughts/discussion/feed
      const containers = Array.from(document.querySelectorAll('div, section, article, form, [class*="community" i]'));
      for (const c of containers) {
        const text = (c as HTMLElement).innerText || "";
        const lower = text.toLowerCase();
        if (lower.includes("share your thoughts") || lower.includes("write a comment") || lower.includes("leave a comment") || lower.includes("join discussion")) {
          const input = c.querySelector('textarea, div[contenteditable], [role="textbox"], input[type="text"]');
          if (input) return input;
        }
      }
      return null;
    });

    const el = fallbackEditorHandle?.asElement();
    if (el) {
      const isVisible = await el.isVisible().catch(() => false);
      if (isVisible) {
        addLog("success", "Successfully located comment editor using heuristic DOM scanner fallback!");
        return el;
      }
    }
  } catch (heurErr) {
    addLog("warning", `Heuristic editor search warning: ${(heurErr as Error).message}`);
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
    // Genuine JWT token or Bearer authorization header cookie
    if (n === "authorization" && (v.startsWith("Bearer ") || v.startsWith("eyJ") || v.length > 30)) return true;
    if (n === "cmc_user_session" && v.length > 15) return true;
    if ((n === "token" || n === "access_token" || n === "auth_token") && (v.startsWith("eyJ") || v.length > 40)) return true;
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
  // Pre-flight check: If auth/state.json doesn't exist or has no valid session cookies, return immediately without launching browser
  if (!fs.existsSync(st.AUTH_STATE_FILE)) {
    return { status: "expired", message: "No session state file found" };
  }
  try {
    const rawContent = fs.readFileSync(st.AUTH_STATE_FILE, "utf-8");
    if (!sessionHasValidCookies(rawContent)) {
      return { status: "expired", message: "Session cookies missing or expired in auth state" };
    }
  } catch (_) {
    return { status: "expired", message: "Malformed session state file" };
  }

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
    const { userAgent, timezoneId, locale } = extractFingerprintDetails(st.AUTH_STATE_FILE);
    
    addLog("info", `Loading browser context storage state from auth/state.json with fingerprint settings (User-Agent: ${userAgent.substring(0, 40)}..., Timezone: ${timezoneId}, Locale: ${locale})...`);
    const context = await browser.newContext({
      storageState: st.AUTH_STATE_FILE,
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
      await context.storageState({ path: st.AUTH_STATE_FILE });
      if (fs.existsSync(st.AUTH_STATE_FILE)) {
        const cookiesStr = fs.readFileSync(st.AUTH_STATE_FILE, "utf-8");
        const activeId = getActiveProfileId();
        await saveSessionStateCloudIfChanged(cookiesStr, activeId || undefined);
        await autoSyncSessionToProfiles(cookiesStr);
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
  st.loginState = { status: "authenticating", message: "Starting automated credentials login flow..." };
  return PlaywrightLock.acquire(async () => {
    if (st.activeLoginSession) {
      addLog("warning", "An active login session exists in memory. Closing it before starting a new one...");
      await st.activeLoginSession.browser.close().catch(() => {});
      st.activeLoginSession = null;
    }

    addLog("info", `Starting automated credentials login flow for email: ${email}...`);
    st.loginState = { status: "authenticating", message: `Initializing secure headless browser for email: ${email}...` };
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
      st.loginState = { status: "authenticating", message: "Attempting direct navigation to CoinMarketCap Login page..." };
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
        st.loginState = { status: "authenticating", message: "Navigating to CoinMarketCap Home page workflow..." };
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
        st.loginState = { status: "authenticating", message: `Waiting for email/password input boxes to load (Attempt ${i + 1}/5)...` };
        await page.waitForTimeout(2000);
      }

      // Subframe fallback scanning
      if (!emailInput || !passwordInput) {
        addLog("info", "Inputs not found on main frame. Scanning subframes...");
        st.loginState = { status: "authenticating", message: "Inputs not found on main frame. Scanning subframes..." };
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
      st.loginState = { status: "authenticating", message: "Entering email and password securely..." };
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
      st.loginState = { status: "authenticating", message: "Submitting login form..." };

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
      st.loginState = { status: "authenticating", message: "Processing credentials with CoinMarketCap..." };

      let isSuccessEarly = false;
      let isOtpEarly = false;

      // Poll up to 25 seconds (50 x 500ms) for authentication verification, errors, or OTP challenge
      let detectedError = "";
      for (let p = 0; p < 50; p++) {
        await page.waitForTimeout(500);

        // 1. Immediate check for Cloudflare Turnstile / Captcha
        const hasCaptcha = await page.evaluate(() => {
          return document.querySelector('#challenge-running, #challenge-stage, .cf-turnstile, iframe[src*="challenges.cloudflare"]') !== null;
        }).catch(() => false);
        if (hasCaptcha) {
          addLog("error", "Cloudflare Turnstile challenge detected during credentials submission.");
          st.activeLoginSession = { browser, context, page, email };
          st.loginState = { status: "captcha", message: "Cloudflare Turnstile verification challenge detected." };
          return { status: "captcha", message: "Cloudflare Turnstile challenge detected." };
        }

        // 2. Immediate check for visible error messages on every poll iteration (instant failure feedback)
        try {
          const visibleErr = await page.evaluate(() => {
            const errorSelectors = [
              '.error-message',
              '.errorMessage',
              '[class*="error-message" i]',
              '[class*="errorMessage" i]',
              '[class*="form-error" i]',
              '[class*="FormError" i]',
              '[role="alert"]',
              '.error',
            ];
            for (const sel of errorSelectors) {
              const els = document.querySelectorAll(sel);
              for (let i = 0; i < els.length; i++) {
                const el = els[i] as HTMLElement;
                if (!el || el.offsetParent === null) continue;
                const text = (el.innerText || "").trim();
                const lower = text.toLowerCase();
                if (
                  text.length > 3 &&
                  !lower.includes("sign up") &&
                  !lower.includes("terms") &&
                  !lower.includes("cookie") &&
                  (lower.includes("wrong") || lower.includes("incorrect") || lower.includes("invalid") || lower.includes("failed") || lower.includes("not match") || lower.includes("does not exist") || lower.includes("too many attempts") || lower.includes("locked"))
                ) {
                  return text;
                }
              }
            }
            return null;
          }).catch(() => null);

          if (visibleErr) {
            detectedError = visibleErr;
            addLog("error", `CoinMarketCap rejected credentials: "${visibleErr}"`);
            break;
          }
        } catch (_) {}

        // 3. Check for 6-digit verification code / OTP challenge
        const hasOtpField = await page.evaluate(() => {
          const inp = document.querySelector('input[placeholder*="code" i], input[placeholder*="verification" i], input[maxlength="6"], [data-test*="otp" i], [data-test*="verification" i]');
          const bodyText = (document.body.innerText || "").toLowerCase();
          return !!inp || bodyText.includes("verification code") || bodyText.includes("6-digit") || bodyText.includes("check your email");
        }).catch(() => false);

        if (hasOtpField) {
          isOtpEarly = true;
          break;
        }

        // 4. Strict authentication check: requires avatar OR verified user session
        const currentCookies = await context.cookies().catch(() => []);
        const hasAuthCookies = hasRealAuthCookies(currentCookies);

        const hasAvatar = await page.evaluate(() => {
          return document.querySelector('[data-test="header-avatar"], .user-avatar, img[alt*="avatar" i], [class*="avatar" i], a[href*="/account/"], [class*="user-icon" i]') !== null;
        }).catch(() => false);

        // Only declare early success if genuine user avatar is present, or verified JWT auth cookie with settled state (p >= 4)
        if (hasAvatar || (hasAuthCookies && p >= 4)) {
          isSuccessEarly = true;
          break;
        }

        if (p % 10 === 0 && p > 0) {
          st.loginState = { status: "authenticating", message: `Processing authentication with CoinMarketCap (${Math.round((p / 50) * 100)}%)...` };
        }
      }

      if (detectedError) {
        await browser.close().catch(() => {});
        st.loginState = { status: "failed", message: `Login failed: ${detectedError}` };
        st.botStatus = "Idle";
        return { status: "failed", message: `Login failed: ${detectedError}` };
      }

      if (isSuccessEarly) {
        addLog("success", "Authentication verified directly after credentials submission!");
        await context.storageState({ path: st.AUTH_STATE_FILE });
        addLog("success", `Saved login cookies session to ${st.AUTH_STATE_FILE}`);

        try {
          const cookiesStr = fs.readFileSync(st.AUTH_STATE_FILE, "utf-8");
          const activeId = getActiveProfileId();
          await saveSessionStateCloud(cookiesStr, activeId || undefined);
          await autoSyncSessionToProfiles(cookiesStr, email);
        } catch (e) {
          console.error("Failed to save session cookies to Firestore cloud or update profiles:", (e as Error).message);
        }

        await browser.close().catch(() => {});
        st.loginState = { status: "success", message: "Login successful! Session cookies saved and account profile activated." };
        st.botStatus = "Idle";
        return { status: "success", message: "Login successful! Session cookies saved and account profile activated." };
      }

      if (isOtpEarly) {
        addLog("warning", "CoinMarketCap requests 6-digit security verification code!");
        st.activeLoginSession = { browser, context, page, email };
        st.loginState = { status: "requires_otp", message: "A 6-digit verification code has been sent to your email. Please enter it to authorize." };
        return { status: "requires_otp", message: "A 6-digit code has been sent to your email. Please enter it to authorize." };
      }

      // Check if visible error is present inside modal with strict validation
      let modalErrorMessage = detectedError;
      if (!modalErrorMessage) {
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

              const text = (await errorEl.innerText().catch(() => "")).trim();
              const lower = text.toLowerCase();
              if (
                text &&
                !lower.includes("sign up") &&
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
      }

      if (modalErrorMessage) {
        await browser.close().catch(() => {});
        st.loginState = { status: "failed", message: `Login failed: ${modalErrorMessage}` };
        st.botStatus = "Idle";
        return { status: "failed", message: `Login failed: ${modalErrorMessage}` };
      }

      // Secondary verification on bitcoin community page
      addLog("info", "Performing secondary verification on community page...");
      st.loginState = { status: "authenticating", message: "Verifying live session cookies on CoinMarketCap community..." };
      try {
        await page.goto("https://coinmarketcap.com/currencies/bitcoin/", { waitUntil: "domcontentloaded", timeout: 20000 });
      } catch (_) {}
      await page.waitForTimeout(2000);

      const secondaryCookies = await context.cookies().catch(() => []);
      const hasSecondaryAuth = hasRealAuthCookies(secondaryCookies);

      const secondaryAvatar = await page.evaluate(() => {
        return document.querySelector('[data-test="header-avatar"], .user-avatar, img[alt*="avatar" i], [class*="avatar" i], a[href*="/account/"], [class*="user-icon" i]') !== null;
      }).catch(() => false);

      const secondaryEditor = await locateAndPrepareCommentEditor(page).catch(() => null);
      const editorRequiresLogin = await isEditorPostButtonRequiringLogin(page);

      if (!editorRequiresLogin && (secondaryAvatar || (hasSecondaryAuth && secondaryEditor))) {
        addLog("success", "Successfully authenticated and verified community access!");
        await context.storageState({ path: st.AUTH_STATE_FILE });
        addLog("success", `Saved login cookies session to ${st.AUTH_STATE_FILE}`);

        try {
          const cookiesStr = fs.readFileSync(st.AUTH_STATE_FILE, "utf-8");
          const activeId = getActiveProfileId();
          await saveSessionStateCloud(cookiesStr, activeId || undefined);
          await autoSyncSessionToProfiles(cookiesStr, email);
        } catch (e) {
          console.error("Failed to save session cookies to Firestore cloud or update profiles:", (e as Error).message);
        }

        await browser.close().catch(() => {});
        st.loginState = { status: "success", message: "Login successful! Session cookies saved and account profile activated." };
        st.botStatus = "Idle";
        return { status: "success", message: "Login successful! Session cookies saved and account profile activated." };
      }

      await saveDebugScreenshot(page, "credentials_login_failed");
      await browser.close().catch(() => {});
      
      const finalMsg = modalErrorMessage 
        ? `Login failed: ${modalErrorMessage}` 
        : (editorRequiresLogin ? "Login incomplete: CoinMarketCap still prompts to Log In on the community page. Please verify your credentials or check for an email verification code." : "Credentials submitted, but CoinMarketCap did not establish an active session. Please check your email and password, or paste your state.json cookies directly.");
      st.loginState = { status: "failed", message: finalMsg };
      st.botStatus = "Idle";
      return { status: "failed", message: finalMsg };

  } catch (error) {
    const errMsg = (error as Error).message;
    addLog("error", `Exception in interactive login flow: ${errMsg}`);
    if (browser) {
      await browser.close().catch(() => {});
    }
    st.loginState = { status: "failed", message: errMsg };
    return { status: "failed", message: errMsg };
  }
  });
}

async function executeSubmitOtp(otp: string): Promise<{ status: "success" | "failed"; message: string }> {
  st.loginState = { status: "authenticating", message: "Submitting verification code..." };
  return PlaywrightLock.acquire(async () => {
  if (!st.activeLoginSession) {
    addLog("error", "No active login session in memory to submit verification code.");
    st.loginState = { status: "failed", message: "No active login session in progress." };
    return { status: "failed", message: "No active login session in progress." };
  }

  const { browser, context, page, email } = st.activeLoginSession;
  if (browser && !browser.isConnected()) {
    addLog("error", "Active login session browser has been disconnected or closed. Please restart the login process.");
    st.activeLoginSession = null;
    st.loginState = { status: "failed", message: "Login session expired or browser disconnected. Please start login again." };
    return { status: "failed", message: "Login session expired or browser disconnected. Please start login again." };
  }

  addLog("info", `Submitting 6-digit verification code: ${otp} for email: ${email}...`);
  st.loginState = { status: "authenticating", message: `Submitting 6-digit verification code: ${otp}...` };

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
        st.activeLoginSession = null;
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
    st.loginState = { status: "authenticating", message: "Waiting for verification code submission response..." };
    await page.waitForTimeout(10000);

    // Verify successful session
    addLog("info", "Navigating to CoinMarketCap to verify session active state...");
    st.loginState = { status: "authenticating", message: "Navigating to verify session active state..." };
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
      await context.storageState({ path: st.AUTH_STATE_FILE });
      addLog("success", `Saved authorized session cookies to ${st.AUTH_STATE_FILE}`);
      
      // Sync successfully saved session to Cloud and Auto-Update Profiles
      try {
        const cookiesStr = fs.readFileSync(st.AUTH_STATE_FILE, "utf-8");
        const activeId = getActiveProfileId();
        await saveSessionStateCloud(cookiesStr, activeId || undefined);
        autoSyncSessionToProfiles(cookiesStr, email);
      } catch (e) {
        console.error("Failed to save session cookies to Firestore cloud or update profiles:", (e as Error).message);
      }

      await browser.close().catch(() => {});
      st.activeLoginSession = null;
      st.loginState = { status: "success", message: "Successfully verified and logged in! State loaded." };
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
      st.activeLoginSession = null;
      st.loginState = { status: "failed", message: failMessage };
      return { status: "failed", message: failMessage };
    }

  } catch (error) {
    addLog("error", `Exception during OTP submission: ${(error as Error).message}`);
    await browser.close().catch(() => {});
    st.activeLoginSession = null;
    return { status: "failed", message: (error as Error).message };
  }
  });
}

async function executeCancelLogin(): Promise<void> {
  if (st.activeLoginSession) {
    addLog("warning", "Manually cancelling and closing active login session...");
    await st.activeLoginSession.browser.close().catch(() => {});
    st.activeLoginSession = null;
  }
}

async function runRealPostingInternal(url: string, message: string, sentiment: string, sharedBrowser?: any): Promise<{ status: "success" | "expired" | "captcha" | "failed" | "retry"; message: string; postUrl?: string }> {
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
      st.activePostingBrowser = browser;
    } else {
      addLog("info", "Re-using existing active Playwright browser instance for posting task.");
    }

    // Extract fingerprint details from user's state.json to maximize session authenticity
    const { userAgent, timezoneId, locale } = extractFingerprintDetails(st.AUTH_STATE_FILE);

    addLog("info", `Loading browser context storage state from auth/state.json with fingerprint settings (User-Agent: ${userAgent.substring(0, 40)}..., Timezone: ${timezoneId}, Locale: ${locale})...`);
    context = await browser.newContext({
      storageState: st.AUTH_STATE_FILE,
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
    st.activePostingPage = page;
    
    // Set explicit navigation and operation timeouts to 90 seconds (Guideline 9)
    page.setDefaultNavigationTimeout(90000);
    page.setDefaultTimeout(90000);

    if (st.isStopping || st.isSingleStopping || !st.isPostingRunning || st.stopSchedulerRequested) {
      return { status: "failed", message: "Posting sequence stopped by user." };
    }

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

    // Fast Cloudflare challenge check right after page settles
    const initialTitle = await page.title().catch(() => "");
    if (initialTitle.includes("Cloudflare") || initialTitle.includes("Just a moment") || initialTitle.includes("Attention Required")) {
      addLog("error", "CRITICAL: Cloudflare challenge detected upon loading coin page!");
      return { status: "captcha", message: "Cloudflare Turnstile challenge block" };
    }
    
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

    if (st.isStopping || st.isSingleStopping || !st.isPostingRunning || st.stopSchedulerRequested) {
      return { status: "failed", message: "Posting sequence stopped by user." };
    }

    // 1. Focus editor and clear previous text/drafts
    addLog("info", "Focusing editor and clearing previous text...");
    await clickResiliently(page, editor, "comment editor input box");
    await page.waitForTimeout(300);
    try {
      await editor.focus();
      await page.keyboard.press("ControlOrMeta+A").catch(() => {});
      await page.keyboard.press("Backspace").catch(() => {});
      await editor.evaluate((el: any) => {
        const elem = el as HTMLElement;
        if (elem.tagName === "TEXTAREA" || elem.tagName === "INPUT") {
          (elem as any).value = "";
        } else {
          elem.innerText = "";
          elem.innerHTML = "";
        }
        elem.dispatchEvent(new Event('input', { bubbles: true }));
      }).catch(() => {});
    } catch {}
    await page.waitForTimeout(300);

    // 2. Focus editor and position cursor strictly after the pre-filled CMC tag chip
    await editor.focus().catch(() => {});
    await page.keyboard.press("End").catch(() => {});
    await page.keyboard.press("ArrowRight").catch(() => {});
    await page.waitForTimeout(100);

    // Inspect what is in the editor now (CoinMarketCap Draft.js retains its coin tag chip e.g. "$DGAI")
    let existingTag = "";
    let currentEditorText = "";
    try {
      currentEditorText = (await editor.innerText().catch(() => "")) || "";
      const tagMatch = currentEditorText.match(/\$[A-Za-z0-9_.-]+/);
      if (tagMatch) {
        existingTag = tagMatch[0].toUpperCase();
      }
    } catch (_) {}

    // Clean comment using sanitizeCommentForAntiSpam so there are NEVER duplicate tags, spam words, or formatting glitches
    let textToType = sanitizeCommentForAntiSpam(finalComment, existingTag).trim();

    // Guarantee physical separation after CMC's Draft.js tag chip so words NEVER glue together (e.g. prevents "$DGAISeeing")
    const hasPreExistingTag = Boolean(existingTag || currentEditorText.trim().length > 0);
    if (hasPreExistingTag) {
      await editor.focus().catch(() => {});
      await page.keyboard.press("End").catch(() => {});
      await page.keyboard.press("ArrowRight").catch(() => {});
      await page.keyboard.press("Space").catch(() => {});
      await page.waitForTimeout(150);
      // Prepend an explicit leading space to the typed text buffer to guarantee separation in Draft.js AST
      if (!textToType.startsWith(" ")) {
        textToType = " " + textToType;
      }
    }

    addLog("info", `Typing comment into editor using human typing cadence: "${textToType.trim()}" (anti-ban simulation active)`);
    try {
      // Humanized typing simulation with natural micro-jitter, punctuation pacing, and word breaks
      await typeWithHumanRhythm(page, textToType);
      
      // CoinMarketCap displays a coin tag autocomplete popup when "$" is typed.
      // Pressing Escape dismisses the autocomplete popup while retaining the tag.
      await page.waitForTimeout(300);
      await page.keyboard.press("Escape").catch(() => {});
      await page.keyboard.press("Escape").catch(() => {});
      
      // Human cognitive delay: Pause to simulate reading/reviewing the comment before clicking submit
      const reviewPause = 800 + Math.floor(Math.random() * 800);
      await page.waitForTimeout(reviewPause);
    } catch (e) {
      addLog("warning", `Direct human typing failed: ${(e as Error).message}. Using page.evaluate fallback...`);
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
        }, textToType);
      } catch (errEval) {
        addLog("error", `Fallback typing failed: ${(errEval as Error).message}`);
        throw errEval;
      }
    }
    await page.waitForTimeout(300);

    // ==========================================
    // Marketing Image Upload (Strictly 1 Image Per Comment)
    // ==========================================
    try {
      const botSettings = getLocalBotSettings();
      if (botSettings.imageUploadEnabled) {
        const nextImage = getNextSingleMarketingImage();
        if (nextImage && fs.existsSync(nextImage.filePath)) {
          addLog("info", `Marketing image enabled: Attaching 1 image (${nextImage.filename}) to comment...`);
          
          // Selectors based on CoinMarketCap comment editor toolbar DOM:
          // <span class="toolbar-item img" data-test="editor-img-button">
          //   <label for="img-icon-..."><svg>...</svg></label>
          //   <input type="file" class="input-file-node" id="img-icon-..." accept=".jpeg,.jpg,.png,.gif,..." multiple="">
          // </span>
          const fileInputSelectors = [
            '.editor-toolbar input.input-file-node',
            '[data-test="editor-img-button"] input[type="file"]',
            '.editor-toolbar .toolbar-item.img input[type="file"]',
            '.editor-toolbar input[type="file"]',
            'input.input-file-node[type="file"]',
            'input[type="file"][accept*="png"]',
            'input[type="file"]'
          ];
          
          let fileInputHandle = null;
          for (const sel of fileInputSelectors) {
            fileInputHandle = await page.$(sel);
            if (fileInputHandle) {
              addLog("info", `Located file input selector: ${sel}`);
              break;
            }
          }

          if (fileInputHandle) {
            // Strictly 1 image passed as a single file path string
            await fileInputHandle.setInputFiles(nextImage.filePath);
            addLog("success", `Successfully attached 1 marketing image: ${nextImage.filename}`);
            
            // Allow CMC editor to process and render the single image preview thumbnail
            await page.waitForTimeout(1500);
            
            // Verify or wait for thumbnail preview to appear
            await page.waitForSelector('.editor-image-preview, [class*="preview"], [class*="image-item"], .upload-image-preview', { timeout: 4000 }).catch(() => {});

            // Wait for any active image upload spinner/progress or disabled Post button to finish before submitting
            for (let imgWait = 0; imgWait < 12; imgWait++) {
              const isUploadingImg = await page.evaluate(() => {
                const spinners = document.querySelectorAll('.editor-image-preview [class*="loading" i], .editor-image-preview [class*="spinner" i], .upload-image-preview [class*="loading" i], [data-test="editor-post-button"][disabled], .editor-post-button[disabled], .editor-post-button.disabled');
                return spinners.length > 0;
              }).catch(() => false);
              if (!isUploadingImg) break;
              await page.waitForTimeout(500);
            }
          } else {
            addLog("warning", "File input element not found in comment editor toolbar. Posting text-only.");
          }
        } else {
          addLog("info", "Image upload is enabled, but no marketing image files are available in library.");
        }
      }
    } catch (imgErr) {
      addLog("warning", `Marketing image attachment encountered error: ${(imgErr as Error).message}. Continuing post resiliently...`);
    }

    // Find and toggle sentiment (Bullish or Bearish)
    const isBullish = sentiment !== "bearish";
    const sentimentSelectors = isBullish ? [
      '[data-test="editor-bullish-button"]',
      'button:has-text("Bullish")',
      'span:has-text("Bullish")',
      '.bullish-button',
      '[class*="bullish" i]',
      'button:has-text("Bull")',
      '[data-test*="bullish" i]',
      '[aria-label*="bullish" i]',
      'button:has-text("🚀")',
      'button:has-text("🐂")'
    ] : [
      '[data-test="editor-bearish-button"]',
      'button:has-text("Bearish")',
      'span:has-text("Bearish")',
      '.bearish-button',
      '[class*="bearish" i]',
      'button:has-text("Bear")',
      '[data-test*="bearish" i]',
      '[aria-label*="bearish" i]',
      'button:has-text("📉")',
      'button:has-text("🐻")'
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
    
    // Find Post submit button with multi-tier selectors and heuristic fallback
    const postButtonSelectors = [
      '[data-test="editor-post-button"]',
      'button:has-text("Post")',
      'button:has-text("Submit")',
      'button:has-text("Comment")',
      'button.editor-post-button',
      '.editor-post-button',
      'button:has-text("Publish")',
      'button[type="submit"]',
      '[role="button"]:has-text("Post")',
      '[role="button"]:has-text("Submit")',
      'div:has-text("Post")[role="button"]',
      'span:has-text("Post")',
      'button[aria-label*="post" i]',
      'button[aria-label*="submit" i]',
      'button[data-testid*="post" i]',
      'button[data-testid*="submit" i]'
    ];
    let postBtn = null;
    for (const selector of postButtonSelectors) {
      postBtn = await page.$(selector);
      if (postBtn) {
        addLog("info", `Found submit button using: ${selector}`);
        break;
      }
    }

    // Heuristic DOM evaluation fallback for Post button (protection against obfuscated class names)
    if (!postBtn) {
      try {
        addLog("info", "Executing heuristic DOM scanner fallback for post button...");
        const fallbackBtnHandle = await page.evaluateHandle(() => {
          const buttons = Array.from(document.querySelectorAll('button, [role="button"], div[style*="cursor: pointer"], span[role="button"]'));
          for (const btn of buttons) {
            const txt = ((btn as HTMLElement).innerText || "").trim().toLowerCase();
            const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
            if (txt === "post" || txt === "submit" || txt === "publish" || txt === "comment" || aria.includes("post") || aria.includes("submit")) {
              const rect = (btn as HTMLElement).getBoundingClientRect();
              const style = window.getComputedStyle(btn);
              if (rect.width > 20 && rect.height > 15 && style.visibility !== "hidden" && style.display !== "none") {
                return btn;
              }
            }
          }
          return null;
        });
        const el = fallbackBtnHandle?.asElement();
        if (el) {
          const isVisible = await el.isVisible().catch(() => false);
          if (isVisible) {
            addLog("success", "Located post button using heuristic DOM scanner fallback!");
            postBtn = el;
          }
        }
      } catch (_) {}
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
    
    if (st.isStopping || st.isSingleStopping || !st.isPostingRunning || st.stopSchedulerRequested) {
      return { status: "failed", message: "Posting sequence stopped by user." };
    }

    // Natural human hover and pause before clicking Post button
    await postBtn.hover().catch(() => {});
    await page.waitForTimeout(300 + Math.floor(Math.random() * 400));

    // Check if the Post button is disabled before clicking (e.g., empty editor or pending image upload)
    const isBtnDisabledBeforeClick = await postBtn.evaluate((el: any) => {
      const elem = el as HTMLElement;
      return (
        (elem as HTMLButtonElement).disabled === true ||
        elem.getAttribute("disabled") !== null ||
        elem.getAttribute("aria-disabled") === "true" ||
        elem.classList.contains("disabled")
      );
    }).catch(() => false);

    if (isBtnDisabledBeforeClick) {
      addLog("info", "Post button is currently disabled (waiting for editor or image upload to settle)...");
      await page.waitForTimeout(2000);
    }

    const snippetToVerify = textToType.trim().slice(0, 28);
    let postApiObserved = false;
    let postApiSucceeded = false;
    let postApiErrorMsg = "";
    let createdPostUrl = "";

    const responseListener = async (response: any) => {
      try {
        const req = response.request();
        if (req.method() !== "POST") return;
        const rUrl = response.url().toLowerCase();
        // Exclude background read/feed/list/query/telemetry/impression POST requests that return 200 OK without creating a comment
        const isReadOrTelemetryEndpoint =
          rUrl.includes("trending") ||
          rUrl.includes("/list") ||
          rUrl.includes("query") ||
          rUrl.includes("search") ||
          rUrl.includes("impression") ||
          rUrl.includes("analytics") ||
          rUrl.includes("telemetry") ||
          rUrl.includes("recommend") ||
          rUrl.includes("announcement") ||
          rUrl.includes("vote") ||
          rUrl.includes("like") ||
          rUrl.includes("follow");

        if (
          !isReadOrTelemetryEndpoint &&
          (rUrl.includes("gravity") || rUrl.includes("comment") || rUrl.includes("post"))
        ) {
          const status = response.status();
          if (status >= 200 && status < 300) {
            const body = await response.json().catch(() => null);
            if (!body || typeof body !== "object") return;
            // Ignore feed list responses that return arrays of posts
            if (Array.isArray(body?.data) || Array.isArray(body?.data?.list) || Array.isArray(body?.data?.posts)) {
              return;
            }
            const errCode = body?.status?.error_code ?? body?.error_code ?? body?.code;
            const errMsg = body?.status?.error_message || body?.error_message || body?.message || "";
            if (errCode && String(errCode) !== "0" && String(errCode) !== "200") {
              postApiObserved = true;
              postApiErrorMsg = String(errMsg || `API error code ${errCode}`);
            } else {
              const rawPostId =
                body?.data?.gravityId ??
                body?.data?.postId ??
                body?.data?.commentId ??
                body?.data?.id ??
                body?.gravityId ??
                (typeof body?.data === "string" || typeof body?.data === "number" ? body.data : "");
              const isExplicitCreateUrl =
                /\/(post|comment|create|add|publish|submit)(\?|$|\/)/i.test(rUrl);
              if (rawPostId || isExplicitCreateUrl) {
                postApiObserved = true;
                postApiSucceeded = true;
                if (rawPostId && String(rawPostId).trim().length > 0) {
                  createdPostUrl = `https://coinmarketcap.com/community/post/${encodeURIComponent(String(rawPostId).trim())}/`;
                }
              }
            }
          } else if (status === 429) {
            postApiObserved = true;
            postApiErrorMsg = "HTTP 429 rate limit";
          } else if (status === 401 || status === 403) {
            postApiObserved = true;
            postApiErrorMsg = `HTTP ${status} unauthorized/restricted`;
          }
        }
      } catch (_) {}
    };

    page.on("response", responseListener);

    addLog("info", "Clicking post submission button...");
    await clickResiliently(page, postBtn, "post submission button");
    
    // Wait for submission to process
    await page.waitForTimeout(3500);

    // Check if the editor still contains our typed comment text (meaning the click did not submit yet)
    const checkEditorStillHasTypedText = async (): Promise<boolean> => {
      try {
        const currentText = ((await editor.innerText().catch(() => "")) || "").trim();
        if (!currentText) return false;
        // If only the pre-filled $SYMBOL tag remains (e.g. "$BTC"), the comment cleared!
        const withoutTag = existingTag ? currentText.replace(new RegExp(`\\${existingTag}`, "gi"), "").trim() : currentText;
        if (withoutTag.length === 0) return false;
        if (snippetToVerify.length >= 8 && currentText.includes(snippetToVerify)) {
          return true;
        }
        return withoutTag.length > Math.max(12, Math.floor(textToType.trim().length * 0.5));
      } catch (_) {
        return false;
      }
    };

    let editorStillUnposted = await checkEditorStillHasTypedText();
    if (editorStillUnposted && !postApiSucceeded && !postApiErrorMsg) {
      addLog("warning", "Editor still contains comment text after first Post click. Retrying Post button click...");
      await clickResiliently(page, postBtn, "post submission button (retry)");
      await page.waitForTimeout(3500);
      editorStillUnposted = await checkEditorStillHasTypedText();
    }

    page.off("response", responseListener);
    
    // Anti-Ban & Moderation Detection: Scan alerts, feedback, toasts, and DOM error notices
    let isRateLimited = false;
    let rateLimitMsg = "";
    let isModerationFlagged = false;
    let moderationMsg = "";
    let isAccountRestricted = false;
    let accountRestrictedMsg = "";
    let hasCaptchaChallenge = false;

    if (postApiErrorMsg) {
      const lowerApiErr = postApiErrorMsg.toLowerCase();
      if (lowerApiErr.includes("429") || lowerApiErr.includes("frequent") || lowerApiErr.includes("fast") || lowerApiErr.includes("rate") || lowerApiErr.includes("wait") || lowerApiErr.includes("limit")) {
        isRateLimited = true;
        rateLimitMsg = postApiErrorMsg;
      } else if (lowerApiErr.includes("ban") || lowerApiErr.includes("suspend") || lowerApiErr.includes("restrict") || lowerApiErr.includes("block")) {
        isAccountRestricted = true;
        accountRestrictedMsg = postApiErrorMsg;
      } else if (lowerApiErr.includes("captcha") || lowerApiErr.includes("verify") || lowerApiErr.includes("security")) {
        hasCaptchaChallenge = true;
      } else {
        isModerationFlagged = true;
        moderationMsg = postApiErrorMsg;
      }
    }

    try {
      const cfOrCaptcha = await page.$('#challenge-running, #challenge-stage, .cf-turnstile, iframe[src*="captcha" i], iframe[src*="turnstile" i], [class*="geetest" i], [class*="baxia" i]').catch(() => null);
      if (cfOrCaptcha && await cfOrCaptcha.isVisible().catch(() => false)) {
        hasCaptchaChallenge = true;
      }
    } catch (_) {}

    try {
      const feedbackContainers = await page.$$('[role="alert"], [class*="toast" i], [class*="notification" i], [class*="feedback" i], [class*="error" i], [class*="alert" i], [data-test="editor-error"], .editor-area, form');
      for (const fc of feedbackContainers) {
        if (await fc.isVisible().catch(() => false)) {
          const txt = (await fc.innerText().catch(() => "")).toLowerCase().trim();
          if (!txt) continue;

          // 1. Rate-limit triggers
          if (txt.includes("frequent") || txt.includes("too fast") || txt.includes("rate limit") || txt.includes("seconds before") || txt.includes("please wait") || txt.includes("try again later") || txt.includes("too many")) {
            isRateLimited = true;
            rateLimitMsg = txt;
            break;
          }

          // 2. Account ban or restriction triggers
          if (txt.includes("account suspended") || txt.includes("account restricted") || txt.includes("banned from commenting") || txt.includes("account blocked") || txt.includes("temporarily restricted")) {
            isAccountRestricted = true;
            accountRestrictedMsg = txt;
            break;
          }

          // 3. Moderation / content removal triggers
          if (txt.includes("prohibited") || txt.includes("violate") || txt.includes("guidelines") || txt.includes("forbidden") || txt.includes("restricted words") || txt.includes("cannot be posted") || txt.includes("under review") || txt.includes("spam detected") || txt.includes("failed to post") || txt.includes("post failed")) {
            isModerationFlagged = true;
            moderationMsg = txt;
            break;
          }
        }
      }
    } catch (_) {}

    if (hasCaptchaChallenge) {
      addLog("error", "CRITICAL: Captcha / security verification popup detected after clicking Post!");
      await saveDebugScreenshot(page, "post_submission_captcha");
      return { status: "captcha", message: "Captcha verification required on post submission" };
    }

    if (isAccountRestricted) {
      addLog("error", `CRITICAL: CoinMarketCap account restriction detected: "${accountRestrictedMsg.slice(0, 100)}". Halting posting to protect account.`);
      await saveDebugScreenshot(page, "account_restricted_submission");
      return { status: "expired", message: `Account restricted: ${accountRestrictedMsg.slice(0, 100)}` };
    }

    if (isRateLimited) {
      addLog("warning", `Rate limit warning detected near comment editor: "${rateLimitMsg.slice(0, 60)}"`);
      await saveDebugScreenshot(page, "rate_limited_submission");
      return { status: "retry", message: `Rate limited on submission (${rateLimitMsg.slice(0, 60)})` };
    }

    if (isModerationFlagged) {
      addLog("warning", `CoinMarketCap content moderation filter flagged comment: "${moderationMsg.slice(0, 80)}"`);
      await saveDebugScreenshot(page, "moderation_flagged_submission");
      return { status: "failed", message: `Moderation filter triggered: ${moderationMsg.slice(0, 80)}` };
    }

    // Check if comment now appears in the published community feed (STRICTLY EXCLUDING the comment editor input box!)
    // Also extract any direct /community/post/<id> permalink if rendered in the feed item
    const feedMatchResult = await page.evaluate((snip: string) => {
      if (!snip || snip.length < 6) return { matched: false, postHref: "" };
      const editors = Array.from(
        document.querySelectorAll('[contenteditable="true"], textarea, [role="textbox"], [data-test="comment-input"]')
      );
      const feedCandidates = Array.from(
        document.querySelectorAll(
          '[class*="community-post" i], [class*="post-item" i], [class*="comment-item" i], [class*="feed-item" i], [data-test*="post" i], article'
        )
      );
      for (const el of feedCandidates) {
        // Skip if this element is or contains the active comment editor
        if (editors.some((ed) => el === ed || el.contains(ed) || ed.contains(el))) continue;
        const txt = (el as HTMLElement).innerText || "";
        if (txt.includes(snip)) {
          const linkEl = el.querySelector('a[href*="/community/post/"]') as HTMLAnchorElement | null;
          return {
            matched: true,
            postHref: linkEl?.href || "",
          };
        }
      }
      return { matched: false, postHref: "" };
    }, snippetToVerify).catch(() => ({ matched: false, postHref: "" }));

    const postedInFeedAfterClick = feedMatchResult.matched;
    if (!createdPostUrl && feedMatchResult.postHref) {
      createdPostUrl = feedMatchResult.postHref;
    }

    // 1. If the comment text is still sitting inside the editor box, CoinMarketCap did not accept the submission.
    if (editorStillUnposted) {
      addLog("warning", `Submission failed: Comment text remained inside the editor after clicking Post (CoinMarketCap rejected or rate-limited the submission).`);
      await saveDebugScreenshot(page, "unverified_post_editor_not_cleared");
      return {
        status: "retry",
        message: "Submission not accepted by CoinMarketCap (comment remained in editor)"
      };
    }

    // 2. If a POST API call was observed and returned an error or non-zero status code, reject it.
    if (postApiObserved && !postApiSucceeded) {
      addLog("warning", `Submission API returned error (${postApiErrorMsg || "unconfirmed response"}).`);
      await saveDebugScreenshot(page, "unverified_post_api_response");
      return {
        status: "failed",
        message: postApiErrorMsg || "CoinMarketCap API rejected post submission"
      };
    }

    // 3. Require both editor cleared (!editorStillUnposted) AND either:
    //    (a) Explicit CMC comment-creation POST API success (postApiSucceeded), OR
    //    (b) Comment snippet rendered in the live community feed outside the editor (postedInFeedAfterClick)
    const commitConfirmed = postApiSucceeded || postedInFeedAfterClick;

    if (!commitConfirmed) {
      addLog("warning", "Submission failed: Editor cleared, but CoinMarketCap did not return a post creation confirmation or render the comment in the feed.");
      await saveDebugScreenshot(page, "unverified_post_no_signal");
      return {
        status: "failed",
        message: "Comment was not created on CoinMarketCap (no post creation response or feed match)"
      };
    }

    const finalTargetPostUrl = createdPostUrl || `${url.replace(/#.*$/, "")}#Community`;
    addLog("success", `Successfully submitted post on CoinMarketCap! Check link: ${finalTargetPostUrl}`);
    await saveDebugScreenshot(page, "success_post_screenshot");

    // Save refreshed storageState back to maintain session longevity
    try {
      await context.storageState({ path: st.AUTH_STATE_FILE });
      if (fs.existsSync(st.AUTH_STATE_FILE)) {
        const cookiesStr = fs.readFileSync(st.AUTH_STATE_FILE, "utf-8");
        const activeId = getActiveProfileId();
        await saveSessionStateCloudIfChanged(cookiesStr, activeId || undefined);
        await autoSyncSessionToProfiles(cookiesStr);
      }
    } catch (e) {
      console.error("Failed to update and sync storage state after successful post:", (e as Error).message);
    }

    return { status: "success", message: "Posted successfully", postUrl: finalTargetPostUrl };
  } catch (error) {
    addLog("error", `Playwright posting execution failed: ${(error as Error).message}`);
    return { status: "failed", message: (error as Error).message };
  } finally {
    st.activePostingPage = null;
    if (page) {
      await page.close().catch(() => {});
    }
    if (context) {
      await context.close().catch(() => {});
    }
    if (browser && ownsBrowser) {
      if (st.activePostingBrowser === browser) {
        st.activePostingBrowser = null;
      }
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

async function runRealPosting(url: string, message: string, sentiment: string, sharedBrowser?: any): Promise<{ status: "success" | "expired" | "captcha" | "failed" | "retry" | "skipped"; message: string; postUrl?: string }> {
  if (!url || url.includes("dex.coinmarketcap.com")) {
    addLog("warning", `Skipping DEX Scan URL: ${url} (DEX Scan pages do not support community postings)`);
    return { status: "skipped", message: "Cannot post on DEX Scan pages" };
  }

  return PlaywrightLock.acquire(async () => {
    const attempts = 2; // Reduced from 3 to 2 for faster execution cycle
    let lastResult: { status: "success" | "expired" | "captcha" | "failed" | "retry" | "skipped"; message: string; postUrl?: string } = { status: "failed", message: "Not started" };
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

addLog("info", `OpenAI API Status: ${isOpenAiConfigured ? "CONFIGURED" : "NOT CONFIGURED (Falls back to static rule-based comments)"}`);
addLog("info", `CoinMarketCap API Status: ${isCmcConfigured ? "CONFIGURED" : "NOT CONFIGURED (Falls back to live free public crypto markets API)"}`);

// ============================================================================
// API ENDPOINTS
// ============================================================================

// 1. Get Session state
app.get("/api/get-session", (req, res) => {
  const exists = fs.existsSync(st.AUTH_STATE_FILE);
  let details = {};
  let content = "";
  if (exists) {
    try {
      const stats = fs.statSync(st.AUTH_STATE_FILE);
      details = {
        sizeBytes: stats.size,
        updatedAt: stats.mtime,
      };
      content = fs.readFileSync(st.AUTH_STATE_FILE, "utf-8");
    } catch (_) {}
  }
  res.json({
    exists,
    filePath: st.AUTH_STATE_FILE,
    details,
    content,
  });
});

// 2. Save Session state
app.post("/api/save-session", async (req, res) => {
  if (st.isContinuousLoopActive) {
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
    
    let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
    
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

    fs.writeFileSync(st.AUTH_STATE_FILE, stateJson, "utf-8");
    fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
    
    // Crucial: Update paths immediately
    updateActiveProfilePaths();
    
    // Reset login flow state to idle on manual session save
    st.loginState = { status: "idle", message: "" };
    
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
  if (st.isContinuousLoopActive) {
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

    st.loginState = { status: "idle", message: "" };

    // Mark active profile inactive upon logout / clear-session
    try {
      if (fs.existsSync(st.PROFILES_FILE)) {
        const profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
        let changed = false;
        const updatedProfiles = profiles.map(p => {
          if (p.isActive) {
            changed = true;
            return { ...p, isActive: false, stateJson: "" };
          }
          return p;
        });
        if (changed) {
          fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(updatedProfiles, null, 2), "utf-8");
          await saveProfilesCloud(updatedProfiles);
        }
      }
    } catch (profErr) {
      console.error("[LOGOUT] Error updating profile inactive state:", (profErr as Error).message);
    }
    updateActiveProfilePaths();

    if (fs.existsSync(st.AUTH_STATE_FILE)) {
      fs.unlinkSync(st.AUTH_STATE_FILE);
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
    const profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
    res.json({ success: true, profiles });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 3b. Save/Update Profile
app.post("/api/save-profile", async (req, res) => {
  if (st.isContinuousLoopActive) {
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

    let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
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
      : (existingIndex >= 0 && profiles[existingIndex].dailyPostLimit ? profiles[existingIndex].dailyPostLimit : 300);

    const proxyVal = typeof req.body.proxy === "string" 
      ? req.body.proxy.trim() 
      : (existingIndex >= 0 ? (profiles[existingIndex].proxy || "") : "");

    const profileData = {
      id: profileId,
      name,
      stateJson: normalizeStateJson(stateJson),
      isActive: existingIndex >= 0 ? profiles[existingIndex].isActive : false,
      loginStatus: existingIndex >= 0 ? (profiles[existingIndex].loginStatus || "unknown") : "unknown",
      dailyPostLimit: dailyLimit,
      proxy: proxyVal,
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      profiles[existingIndex] = profileData;
    } else {
      ensureProfileDirectory(profileId);
      profiles.push(profileData);
    }

    writeJsonFileSyncAtomic(st.PROFILES_FILE, profiles);
    addLog("success", `Saved account profile: "${name}" (Daily limit: ${dailyLimit} posts/day${proxyVal ? `, Proxy: ${proxyVal}` : ""})`);

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
  if (st.isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot change account limit while the Continuous Automation Loop is active." });
  }
  try {
    const { id, dailyPostLimit } = req.body;
    if (!id) {
      return res.status(400).json({ error: "Missing profile id." });
    }
    const limitNum = Math.max(1, Math.min(10000, Number(dailyPostLimit) || 300));
    let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
    const idx = profiles.findIndex(p => p.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Profile not found." });
    }
    profiles[idx].dailyPostLimit = limitNum;
    profiles[idx].updatedAt = new Date().toISOString();
    writeJsonFileSyncAtomic(st.PROFILES_FILE, profiles);
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

// 3bc. Update Account Proxy
app.post("/api/update-profile-proxy", async (req, res) => {
  try {
    const { id, proxy } = req.body;
    if (!id) {
      return res.status(400).json({ error: "Missing profile id." });
    }
    let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
    const idx = profiles.findIndex(p => p.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Profile not found." });
    }
    profiles[idx].proxy = typeof proxy === "string" ? proxy.trim() : "";
    profiles[idx].updatedAt = new Date().toISOString();
    writeJsonFileSyncAtomic(st.PROFILES_FILE, profiles);
    await saveProfilesCloud(profiles).catch(() => {});

    const proxyMsg = profiles[idx].proxy ? profiles[idx].proxy : "Direct Connection (No proxy)";
    addLog("info", `Updated proxy for account "${profiles[idx].name}": ${proxyMsg}`);
    res.json({ success: true, profile: profiles[idx] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 3c. Activate Profile Helper and Endpoint
async function activateProfileInternal(id: string): Promise<{
  success: boolean;
  message: string;
  activeProfile: { id: string; name: string; isActive: boolean; dailyPostLimit: number };
}> {
  let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
  const targetIdx = profiles.findIndex(p => p.id === id);
  if (targetIdx === -1) {
    throw new Error("Profile not found.");
  }

  // Set all other active to false, target to true
  profiles = profiles.map((p, idx) => ({
    ...p,
    isActive: idx === targetIdx
  }));

  // Copy to st.AUTH_STATE_FILE
  const activeProfile = profiles[targetIdx];
  fs.writeFileSync(st.AUTH_STATE_FILE, activeProfile.stateJson, "utf-8");
  fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
  
  // Crucial: Update active profile paths dynamically!
  updateActiveProfilePaths();

  // Ensure target profile subdirectory and isolated storage files are safely initialized
  const targetDir = path.join(st.OUTPUT_DIR, activeProfile.id);
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
      daily_post_limit: activeProfile.dailyPostLimit || 300,
      last_post_date: getTodayDateString()
    }, null, 2), "utf-8");
  }

  // Synchronize in-memory progress index for newly activated profile
  const progress = readBotProgress();
  st.currentPostingIndex = progress.next_index || 0;

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
  st.loginState = { status: "idle", message: "" };

  return {
    success: true,
    message: `Successfully activated profile "${activeProfile.name}"`,
    activeProfile: {
      id: activeProfile.id,
      name: activeProfile.name,
      isActive: true,
      dailyPostLimit: activeProfile.dailyPostLimit || 300
    }
  };
}

app.post("/api/activate-profile", async (req, res) => {
  if (st.isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot switch accounts while Continuous Loop is active. Please click 'Stop Posting' first." });
  }
  if (isBusy() || st.isPostingRunning || st.botStatus === "Posting" || st.botStatus === "Stopping") {
    return res.status(400).json({ error: "Cannot switch accounts while posting or automation is running. Please click 'Stop Posting' first." });
  }
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: "Missing profile id." });
    }
    const result = await activateProfileInternal(id);
    res.json(result);
  } catch (error) {
    const msg = (error as Error).message;
    if (msg === "Profile not found.") {
      return res.status(404).json({ error: msg });
    }
    res.status(500).json({ error: msg });
  }
});

// 3d. Delete Profile
app.post("/api/delete-profile", async (req, res) => {
  if (st.isContinuousLoopActive) {
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

    let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
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
      // Clear st.AUTH_STATE_FILE if active profile was deleted
      if (fs.existsSync(st.AUTH_STATE_FILE)) {
        fs.unlinkSync(st.AUTH_STATE_FILE);
      }
      try {
        await saveSessionStateCloud("", deletedId);
      } catch (err) {
        console.error("[FIREBASE] Error clearing session from cloud on deletion:", (err as Error).message);
      }
    }

    // Clean up local profile subdirectory files if they exist
    const profileDir = path.join(st.OUTPUT_DIR, deletedId);
    if (fs.existsSync(profileDir)) {
      try {
        fs.rmSync(profileDir, { recursive: true, force: true });
        addLog("info", `Cleaned up local directory for deleted profile "${deletedName}" (${deletedId}).`);
      } catch (err) {
        console.error(`Error deleting profile subdirectory ${profileDir}:`, (err as Error).message);
      }
    }

    // Always reset login flow state to idle on deletion to prevent sticky success banner
    st.loginState = { status: "idle", message: "" };

    fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
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


app.get("/api/health", (req, res) => {
  const now = Date.now();
  if (st.cachedHealthResponse && (now - st.cachedHealthAt < 60000)) {
    return res.json(st.cachedHealthResponse);
  }

  const cachedAtIso = new Date(now).toISOString();
  const dbConnected = isFirebaseDisabled() ? isMongoEnabled() : true;

  // 1. Server check
  const serverCheck = {
    status: "ok",
    details: "Node.js Express Server running",
    message: "Server is running normally.",
    uptimeSeconds: Math.floor(process.uptime()),
  };

  // 2. OpenAI / AI Model check
  let openaiStatus: "ok" | "degraded" | "error" = "ok";
  let openaiMessage = "OpenAI API is configured and operational.";
  if (st.lastOpenAiError) {
    openaiStatus = "error";
    openaiMessage = `OpenAI error: ${st.lastOpenAiError}. Please top up your OpenAI credits or check your API key.`;
  } else if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY) {
    openaiStatus = "error";
    openaiMessage = "OPENAI_API_KEY is not configured. Set OPENAI_API_KEY in environment variables to generate comments.";
  } else if (!process.env.OPENAI_API_KEY && process.env.GEMINI_API_KEY) {
    openaiStatus = "ok";
    openaiMessage = "Gemini fallback is configured and active.";
  }

  const openaiCheck = {
    status: openaiStatus,
    details: isOpenAiConfigured ? "OpenAI primary active" : (process.env.GEMINI_API_KEY ? "Gemini active" : "Missing API keys"),
    message: openaiMessage,
  };

  // 3. CMC / Browser check
  let browserStatus: "ok" | "degraded" | "error" = "ok";
  let browserMessage = "Automated CoinMarketCap browser is ready.";
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && !fs.existsSync(process.env.PLAYWRIGHT_BROWSERS_PATH)) {
    browserStatus = "error";
    browserMessage = "Posting browser was not found on the server. Please run a system check.";
  }

  const browserCheck = {
    status: browserStatus,
    details: "Automated CoinMarketCap browser",
    message: browserMessage,
  };

  // 4. Database check
  const dbCheck = {
    status: dbConnected ? "ok" : "error",
    details: getActiveStoreName(),
    message: dbConnected ? `Database connected (${getActiveStoreName()}).` : "Database is unreachable. Check your cloud database configuration.",
  };

  // 5. Account check
  const activeId = getActiveProfileId();
  const sessionOk = isProfileSessionActive(activeId);
  const accountCheck = {
    status: (activeId && sessionOk) ? "ok" : "degraded",
    details: activeId ? "Profile loaded" : "No active profile",
    message: (activeId && sessionOk) ? "CoinMarketCap account session is authenticated." : "CoinMarketCap account session expired or not logged in. Log in to resume operations.",
  };

  const isHealthy = serverCheck.status === "ok" &&
                    openaiCheck.status === "ok" &&
                    browserCheck.status === "ok" &&
                    dbCheck.status === "ok" &&
                    accountCheck.status === "ok";

  st.cachedHealthResponse = {
    healthy: isHealthy,
    overall: isHealthy ? "ok" : "degraded",
    cachedAt: cachedAtIso,
    checks: {
      server: serverCheck,
      openai: openaiCheck,
      ai_models: openaiCheck,
      cmc: browserCheck,
      browser: browserCheck,
      database: dbCheck,
      db: dbCheck,
      account: accountCheck,
    },
  };
  st.cachedHealthAt = now;

  res.json(st.cachedHealthResponse);
});

// 4. Status endpoint
app.get("/api/status", async (req, res) => {
  const queryProfileId = (req.query.profileId as string)?.trim();
  const activeId = queryProfileId || getActiveProfileId();
  const sessionExists = isProfileSessionActive(activeId);

  if (!activeId || !sessionExists) {
    if (!st.isPostingRunning && !st.isSinglePostingRunning && !st.isSchedulerCycleRunning && !st.isGeneratingRunning) {
      st.isStopping = false;
      st.isSingleStopping = false;
      if (st.botStatus === "Stopping" || st.botStatus === "Posting") {
        st.botStatus = "Idle";
      }
    }
    return res.json({
      status: (st.botStatus === "Authenticating" || st.botStatus === "Verifying Code") ? st.botStatus : (st.isStopping ? "Stopping" : st.botStatus),
      isStopping: st.isStopping,
      loginState: st.loginState,
      runMode: st.runMode,
      activeProfile: null,
      activeProfileId: null,
      activeProfileName: null,
      totalCoins: 0,
      generatedMessages: 0,
      postedCount: 0,
      failedCount: 0,
      trending: [],
      generated: [],
      results: [],
      progressIndex: 0,
      dailyPostCount: 0,
      dailyPostLimit: getAccountDailyPostLimit(activeId),
      lastPostDate: getTodayDateString(),
      currentCoin: "N/A",
      coinsFetchedAt: null,
      coinsFetchedTime: null,
      commentsGeneratedAt: null,
      commentsGeneratedTime: null,
      isDataStale: false,
      coinsAgeMs: null,
      commentsAgeMs: null,
      staleReason: null,
      sessionStatus: "Login expired — please log in again",
      apiStatus: {
        openai: isOpenAiConfigured,
        gemini: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
        cmc: isCmcConfigured,
        openaiError: st.lastOpenAiError,
        geminiError: st.lastGeminiError,
      },
      isContinuousLoopActive: false,
      nextCycleStartTime: null,
      continuousLoopIntervalMinutes: st.continuousLoopIntervalMinutes,
      activeProcess: st.activeSystemProcess,
      activeProcessDescription: st.activeProcessDetails,
      storageInfo: {
        activeStore: getActiveStoreName(),
        isMongoConnected: isMongoEnabled(),
        isFirebaseDisabled: isFirebaseDisabled(),
        isMongoPrimary: isMongoPrimary(),
      },
      imageUploadEnabled: getLocalBotSettings().imageUploadEnabled || false,
      imageSelectionMode: getLocalBotSettings().imageSelectionMode || "cycle",
      activeImageIndex: getLocalBotSettings().activeImageIndex || 0,
      availableImagesCount: getAvailableMarketingImages().length,
      dataRetention: {
        autoPruneOldDataEnabled: getLocalBotSettings().autoPruneOldDataEnabled !== false,
        dataRetentionDays: getLocalBotSettings().dataRetentionDays || 7,
        maxResultsHistoryCount: getLocalBotSettings().maxResultsHistoryCount || 300,
        autoPruneCompletedBatches: getLocalBotSettings().autoPruneCompletedBatches !== false,
      },
    });
  }

  syncLocalFromCloudIfStale().catch(() => {});

  const targetCoinsFile = activeId ? path.join(st.OUTPUT_DIR, activeId, "last_trending.json") : st.LAST_TRENDING_FILE;
  const targetMessagesFile = activeId ? path.join(st.OUTPUT_DIR, activeId, "generated_messages.json") : st.GENERATED_MESSAGES_FILE;
  let coins = readJsonFile<Coin[]>(targetCoinsFile, []);
  if (coins.length === 0 && fs.existsSync(path.join(st.OUTPUT_DIR, "last_trending.json"))) {
    coins = readJsonFile<Coin[]>(path.join(st.OUTPUT_DIR, "last_trending.json"), []);
  }
  let messages = readJsonFile<GeneratedMessage[]>(targetMessagesFile, []);
  if (messages.length === 0 && fs.existsSync(path.join(st.OUTPUT_DIR, "generated_messages.json"))) {
    messages = readJsonFile<GeneratedMessage[]>(path.join(st.OUTPUT_DIR, "generated_messages.json"), []);
  }
  const rawResults = getIsolatedResults(activeId);
  const results = rawResults.filter(r => r.profileId === activeId);
  const progress = readBotProgress(activeId);
  const dailyPostLimit = getAccountDailyPostLimit(activeId);
  const ts = getRealTimestamps(activeId);

  const batchGenAt = ts.commentsGeneratedAt || 0;
  const currentBatchResults = batchGenAt > 0
    ? results.filter(r => {
        const rTime = r.createdAt ? Number(r.createdAt) : new Date(r.timestamp).getTime();
        return !isNaN(rTime) && rTime >= (batchGenAt - 120000);
      })
    : results;
  const batchSuccessCount = currentBatchResults.filter(r => r.status === "success").length;
  const batchFailedCount = currentBatchResults.filter(r => r.status !== "success" && r.status !== "skipped").length;

  const now = Date.now();
  const TWO_DAYS_MS = 48 * 60 * 60 * 1000;
  const coinsAgeMs = (coins.length > 0 && ts.coinsFetchedAt) ? (now - ts.coinsFetchedAt) : null;
  const commentsAgeMs = (messages.length > 0 && ts.commentsGeneratedAt) ? (now - ts.commentsGeneratedAt) : null;
  const isDataStale = (coinsAgeMs !== null && coinsAgeMs > TWO_DAYS_MS) || (commentsAgeMs !== null && commentsAgeMs > TWO_DAYS_MS);
  const staleReason = isDataStale ? (
    (coinsAgeMs && coinsAgeMs > TWO_DAYS_MS && commentsAgeMs && commentsAgeMs > TWO_DAYS_MS)
      ? "Both trending coins and generated comments are over 2 days old (>48h)"
      : (coinsAgeMs && coinsAgeMs > TWO_DAYS_MS)
        ? "Trending coins list is over 2 days old (>48h)"
        : "Generated comments are over 2 days old (>48h)"
  ) : null;

  if (!st.isPostingRunning && !st.isSinglePostingRunning && !st.isSchedulerCycleRunning && !st.isGeneratingRunning) {
    st.isStopping = false;
    st.isSingleStopping = false;
    if (st.botStatus === "Stopping" || st.botStatus === "Posting") {
      st.botStatus = "Idle";
    }
  }

  const rawProfiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
  const activeProfile = rawProfiles.find(p => p.id === activeId);

  res.json({
    status: st.isStopping ? "Stopping" : st.botStatus,
    isStopping: st.isStopping,
    loginState: st.loginState,
    runMode: st.runMode,
    activeProfile: activeProfile ? { id: activeProfile.id, name: activeProfile.name } : (activeId ? { id: activeId, name: activeId } : null),
    activeProfileId: activeId,
    activeProfileName: activeProfile?.name || activeId,
    totalCoins: coins.length,
    generatedMessages: messages.length,
    postedCount: batchSuccessCount,
    failedCount: batchFailedCount,
    trending: coins,
    generated: messages,
    results,
    progressIndex: Math.max(0, Math.min(st.isPostingRunning ? st.currentPostingIndex : (progress.next_index || 0), Math.max(coins.length, messages.length))),
    dailyPostCount: progress.daily_post_count || 0,
    dailyPostLimit,
    lastPostDate: progress.last_post_date || getTodayDateString(),
    currentCoin: st.currentCoinName,
    coinsFetchedAt: coins.length > 0 ? ts.coinsFetchedAt : null,
    coinsFetchedTime: coins.length > 0 ? ts.coinsFetchedTime : null,
    commentsGeneratedAt: messages.length > 0 ? ts.commentsGeneratedAt : null,
    commentsGeneratedTime: messages.length > 0 ? ts.commentsGeneratedTime : null,
    isDataStale,
    coinsAgeMs,
    commentsAgeMs,
    staleReason,
    sessionStatus: "Session active",
    apiStatus: {
      openai: isOpenAiConfigured,
      gemini: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
      cmc: isCmcConfigured,
      openaiError: st.lastOpenAiError,
      geminiError: st.lastGeminiError,
    },
    isContinuousLoopActive: st.isContinuousLoopActive,
    nextCycleStartTime: st.nextCycleStartTime,
    continuousLoopIntervalMinutes: st.continuousLoopIntervalMinutes,
    activeProcess: st.activeSystemProcess,
    activeProcessDescription: st.activeProcessDetails,
    storageInfo: {
      activeStore: getActiveStoreName(),
      isMongoConnected: isMongoEnabled(),
      isFirebaseDisabled: isFirebaseDisabled(),
      isMongoPrimary: isMongoPrimary(),
    },
    imageUploadEnabled: getLocalBotSettings().imageUploadEnabled || false,
    imageSelectionMode: getLocalBotSettings().imageSelectionMode || "cycle",
    activeImageIndex: getLocalBotSettings().activeImageIndex || 0,
    availableImagesCount: getAvailableMarketingImages().length,
    dataRetention: {
      autoPruneOldDataEnabled: getLocalBotSettings().autoPruneOldDataEnabled !== false,
      dataRetentionDays: getLocalBotSettings().dataRetentionDays || 7,
      maxResultsHistoryCount: getLocalBotSettings().maxResultsHistoryCount || 300,
      autoPruneCompletedBatches: getLocalBotSettings().autoPruneCompletedBatches !== false,
    },
  });
});

// 4.5. Set run mode endpoint (Deprecated - Simulation mode is completely removed)
app.post("/api/set-run-mode", (req, res) => {
  if (isSchedulerRunning()) {
    return res.status(409).json({ error: "Pause or stop the scheduler to change settings" });
  }
  res.json({ success: true, runMode: "Real Browser", message: "Simulation mode is disabled." });
});

// Marketing Images endpoints
app.get("/api/marketing-images/file/:filename", (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    let targetPath = path.join(st.MARKETING_IMAGES_DIR, filename);
    if (!fs.existsSync(targetPath)) {
      const pubPath = path.join(process.cwd(), "public", "uploads", "marketing_images", filename);
      if (fs.existsSync(pubPath)) {
        targetPath = pubPath;
      } else {
        return res.status(404).send("Image not found");
      }
    }
    const ext = path.extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".gif": "image/gif",
    };
    if (mimeMap[ext]) {
      res.setHeader("Content-Type", mimeMap[ext]);
    }
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.sendFile(targetPath);
  } catch (err) {
    res.status(500).send((err as Error).message);
  }
});

function pruneMarketingImages(keepCount: number): { pruned: string[]; remaining: number } {
  try {
    const pubDir = path.join(process.cwd(), "public", "uploads", "marketing_images");
    const images = getAvailableMarketingImages();
    if (images.length <= keepCount) {
      return { pruned: [], remaining: images.length };
    }

    const withMtime = images.map(filename => {
      const fullPath = path.join(st.MARKETING_IMAGES_DIR, filename);
      let mtime = 0;
      try {
        mtime = fs.statSync(fullPath).mtimeMs;
      } catch (_) {}
      return { filename, mtime };
    }).sort((a, b) => b.mtime - a.mtime);

    const toPrune = withMtime.slice(keepCount).map(x => x.filename);
    for (const filename of toPrune) {
      const outPath = path.join(st.MARKETING_IMAGES_DIR, filename);
      const pubPath = path.join(pubDir, filename);
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
      if (fs.existsSync(pubPath)) fs.unlinkSync(pubPath);
    }

    addLog("info", `[PRUNE] Auto-pruned ${toPrune.length} older marketing images, keeping latest ${keepCount}.`);
    return { pruned: toPrune, remaining: keepCount };
  } catch (err) {
    console.error("[PRUNE] Error pruning images:", err);
    return { pruned: [], remaining: getAvailableMarketingImages().length };
  }
}

app.get("/api/marketing-images", (req, res) => {
  try {
    const images = getAvailableMarketingImages();
    const settings = getLocalBotSettings();

    const formatted = images.map(filename => {
      const fullPath = path.join(st.MARKETING_IMAGES_DIR, filename);
      let sizeBytes = 0;
      let updatedAt = new Date().toISOString();
      try {
        const stat = fs.statSync(fullPath);
        sizeBytes = stat.size;
        updatedAt = stat.mtime.toISOString();
      } catch (_) {}

      return {
        filename,
        url: `/api/marketing-images/file/${encodeURIComponent(filename)}`,
        sizeBytes,
        updatedAt,
      };
    });

    res.json({
      success: true,
      images: formatted,
      imageUploadEnabled: settings.imageUploadEnabled || false,
      imageSelectionMode: settings.imageSelectionMode || "cycle",
      activeImageIndex: settings.activeImageIndex || 0,
      autoPruneEnabled: settings.autoPruneEnabled || false,
      autoPruneLimit: settings.autoPruneLimit || 30,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

app.post("/api/settings/image-upload", (req, res) => {
  try {
    const { enabled, mode, autoPruneEnabled, autoPruneLimit } = req.body;
    const settings = getLocalBotSettings();

    if (typeof enabled === "boolean") {
      settings.imageUploadEnabled = enabled;
      addLog("info", `Image upload to comments switched: ${enabled ? "ON (1 image per comment)" : "OFF (Text-only)"}`);
    }

    if (mode === "cycle" || mode === "random") {
      settings.imageSelectionMode = mode;
      addLog("info", `Image selection mode updated: ${mode}`);
    }

    if (typeof autoPruneEnabled === "boolean") {
      settings.autoPruneEnabled = autoPruneEnabled;
    }

    if (typeof autoPruneLimit === "number" && autoPruneLimit > 0) {
      settings.autoPruneLimit = autoPruneLimit;
    }

    saveLocalBotSettings(settings);

    res.json({
      success: true,
      imageUploadEnabled: settings.imageUploadEnabled || false,
      imageSelectionMode: settings.imageSelectionMode || "cycle",
      autoPruneEnabled: settings.autoPruneEnabled || false,
      autoPruneLimit: settings.autoPruneLimit || 30,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

app.post("/api/marketing-images/auto-prune", (req, res) => {
  try {
    const keepCount = Math.max(1, Number(req.body.keepCount || 20));
    const result = pruneMarketingImages(keepCount);
    res.json({
      success: true,
      prunedCount: result.pruned.length,
      remainingCount: result.remaining,
      message: `Pruned ${result.pruned.length} older images. Retained latest ${result.remaining} images.`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

app.delete("/api/marketing-images", (req, res) => {
  try {
    const filename = String(req.query.filename || "").trim();
    if (!filename || filename.includes("..") || filename.includes("/")) {
      return res.status(400).json({ success: false, error: "Invalid filename" });
    }
    const outPath = path.join(st.MARKETING_IMAGES_DIR, filename);
    const pubPath = path.join(process.cwd(), "public", "uploads", "marketing_images", filename);

    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    if (fs.existsSync(pubPath)) fs.unlinkSync(pubPath);

    addLog("info", `Deleted marketing image: ${filename}`);
    res.json({ success: true, message: `Image ${filename} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

function isValidImageBuffer(buffer: Buffer): { valid: boolean; format?: string; error?: string } {
  if (!buffer || buffer.length < 16) {
    return { valid: false, error: "File buffer is too small or empty." };
  }
  // Max size: 12MB limit per image
  if (buffer.length > 12 * 1024 * 1024) {
    return { valid: false, error: "File exceeds 12MB maximum size limit." };
  }

  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return { valid: true, format: "png" };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { valid: true, format: "jpeg" };
  }

  // WebP: RIFF .... WEBP
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return { valid: true, format: "webp" };
  }

  // GIF: GIF8
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return { valid: true, format: "gif" };
  }

  return { valid: false, error: "Invalid image format. Allowed formats: PNG, JPEG, WebP, GIF." };
}

app.post("/api/marketing-images/upload", (req, res) => {
  try {
    const { files, replaceExisting } = req.body;
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ success: false, error: "No image files provided." });
    }

    const pubDir = path.join(process.cwd(), "public", "uploads", "marketing_images");
    if (!fs.existsSync(st.MARKETING_IMAGES_DIR)) fs.mkdirSync(st.MARKETING_IMAGES_DIR, { recursive: true });
    if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });

    // If replaceExisting is true (e.g. daily fresh batch), clear old images
    if (replaceExisting) {
      const existing = getAvailableMarketingImages();
      for (const file of existing) {
        const outF = path.join(st.MARKETING_IMAGES_DIR, file);
        const pubF = path.join(pubDir, file);
        if (fs.existsSync(outF)) fs.unlinkSync(outF);
        if (fs.existsSync(pubF)) fs.unlinkSync(pubF);
      }
      addLog("info", `[IMAGES] Replaced existing images pool with new batch.`);
    }

    let uploadedCount = 0;
    const errors: string[] = [];

    for (const item of files) {
      if (!item.filename || !item.base64) continue;
      const cleanName = path.basename(item.filename).replace(/[^a-zA-Z0-9._-]/g, "_");
      if (!cleanName.match(/\.(png|jpe?g|webp|gif)$/i)) {
        errors.push(`${cleanName}: Unsupported file extension`);
        continue;
      }

      // Extract base64 payload if it has data URL prefix
      let base64Data = item.base64;
      if (base64Data.includes(",")) {
        base64Data = base64Data.split(",")[1];
      }
      const buffer = Buffer.from(base64Data, "base64");

      // Validate image buffer magic bytes and size
      const validation = isValidImageBuffer(buffer);
      if (!validation.valid) {
        errors.push(`${cleanName}: ${validation.error}`);
        continue;
      }

      const outPath = path.join(st.MARKETING_IMAGES_DIR, cleanName);
      const pubPath = path.join(pubDir, cleanName);

      fs.writeFileSync(outPath, buffer);
      fs.writeFileSync(pubPath, buffer);
      uploadedCount++;
      addLog("info", `Uploaded marketing image: ${cleanName} (${Math.round(buffer.length / 1024)} KB, ${validation.format?.toUpperCase()})`);
    }

    // Auto-prune older images if requested or if auto-pruning is enabled
    const pruneLimit = typeof req.body.autoPruneLimit === "number" && req.body.autoPruneLimit > 0 
      ? req.body.autoPruneLimit 
      : (getLocalBotSettings().autoPruneEnabled ? (getLocalBotSettings().autoPruneLimit || 30) : null);
    if (pruneLimit && pruneLimit > 0) {
      pruneMarketingImages(pruneLimit);
    }

    res.json({
      success: true,
      uploadedCount,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully uploaded ${uploadedCount} image(s).` + (errors.length > 0 ? ` (${errors.length} failed)` : ""),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

async function importImagesFromExternalSources(inputUrlOrText: string, replaceExisting: boolean = false): Promise<{
  importedCount: number;
  errors: string[];
  message: string;
}> {
  const pubDir = path.join(process.cwd(), "public", "uploads", "marketing_images");
  if (!fs.existsSync(st.MARKETING_IMAGES_DIR)) fs.mkdirSync(st.MARKETING_IMAGES_DIR, { recursive: true });
  if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });

  if (replaceExisting) {
    const existing = getAvailableMarketingImages();
    for (const file of existing) {
      const outF = path.join(st.MARKETING_IMAGES_DIR, file);
      const pubF = path.join(pubDir, file);
      if (fs.existsSync(outF)) fs.unlinkSync(outF);
      if (fs.existsSync(pubF)) fs.unlinkSync(pubF);
    }
    addLog("info", `[IMAGES] Replaced existing images pool with new batch.`);
  }

  const errors: string[] = [];
  let importedCount = 0;

  const rawItems = inputUrlOrText
    .split(/[\r\n,]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const rawItem of rawItems) {
    // 1. Google Drive Folder
    const gdriveFolderMatch = rawItem.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (gdriveFolderMatch) {
      const folderId = gdriveFolderMatch[1];
      addLog("info", `[DRIVE IMPORT] Scanning Google Drive folder (${folderId}) with headless engine...`);
      try {
        const browser = await launchBrowserResilient({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
        });
        const context = await browser.newContext({
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        });
        const page = await context.newPage();
        await page.goto(`https://drive.google.com/drive/folders/${folderId}`, { waitUntil: "domcontentloaded", timeout: 35000 }).catch(() => {});
        await page.waitForTimeout(4000);

        const fileIds: string[] = await page.evaluate(() => {
          const ids: string[] = [];
          document.querySelectorAll('a[href*="/file/d/"], [data-id]').forEach(el => {
            const href = el.getAttribute('href') || '';
            const match = href.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
            if (match) ids.push(match[1]);
            const dataId = el.getAttribute('data-id');
            if (dataId && dataId.length > 20 && !ids.includes(dataId)) ids.push(dataId);
          });
          return Array.from(new Set(ids));
        });

        await browser.close().catch(() => {});
        addLog("info", `[DRIVE IMPORT] Found ${fileIds.length} candidate file entries in Google Drive folder.`);

        for (let i = 0; i < fileIds.length; i++) {
          const fid = fileIds[i];
          const downloadUrls = [
            `https://drive.google.com/uc?export=download&id=${fid}`,
            `https://lh3.googleusercontent.com/d/${fid}`
          ];
          let downloaded = false;
          for (const dUrl of downloadUrls) {
            try {
              const res = await fetch(dUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
              if (res.ok) {
                const arrayBuf = await res.arrayBuffer();
                const buffer = Buffer.from(arrayBuf);
                const validation = isValidImageBuffer(buffer);
                if (validation.valid) {
                  const ext = validation.format || "png";
                  const filename = `gdrive_${fid.slice(0, 8)}_${Date.now()}_${i + 1}.${ext}`;
                  fs.writeFileSync(path.join(st.MARKETING_IMAGES_DIR, filename), buffer);
                  fs.writeFileSync(path.join(pubDir, filename), buffer);
                  importedCount++;
                  downloaded = true;
                  addLog("success", `[DRIVE IMPORT] Imported image ${i + 1}/${fileIds.length} (${filename}, ${Math.round(buffer.length / 1024)} KB)`);
                  break;
                }
              }
            } catch (_) {}
          }
          if (!downloaded) {
            errors.push(`Google Drive file ${fid}: Not a public image or access restricted.`);
          }
        }
      } catch (driveErr) {
        errors.push(`Failed to scan Google Drive folder: ${(driveErr as Error).message}`);
        addLog("error", `[DRIVE IMPORT] Error scanning folder: ${(driveErr as Error).message}`);
      }
      continue;
    }

    // 2. Google Drive Single File
    const gdriveFileMatch = rawItem.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || rawItem.match(/id=([a-zA-Z0-9_-]+)/);
    if (gdriveFileMatch && rawItem.includes("drive.google.com")) {
      const fid = gdriveFileMatch[1];
      const downloadUrls = [
        `https://drive.google.com/uc?export=download&id=${fid}`,
        `https://lh3.googleusercontent.com/d/${fid}`
      ];
      let downloaded = false;
      for (const dUrl of downloadUrls) {
        try {
          const res = await fetch(dUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (res.ok) {
            const arrayBuf = await res.arrayBuffer();
            const buffer = Buffer.from(arrayBuf);
            const validation = isValidImageBuffer(buffer);
            if (validation.valid) {
              const ext = validation.format || "png";
              const filename = `gdrive_${fid.slice(0, 8)}_${Date.now()}.${ext}`;
              fs.writeFileSync(path.join(st.MARKETING_IMAGES_DIR, filename), buffer);
              fs.writeFileSync(path.join(pubDir, filename), buffer);
              importedCount++;
              downloaded = true;
              addLog("success", `[DRIVE IMPORT] Imported Google Drive image: ${filename}`);
              break;
            }
          }
        } catch (_) {}
      }
      if (!downloaded) {
        errors.push(`Google Drive file ${fid}: Could not download as valid image.`);
      }
      continue;
    }

    // 3. Direct URL / S3 Bucket URL / CDN Link
    if (rawItem.startsWith("http://") || rawItem.startsWith("https://")) {
      try {
        addLog("info", `[URL IMPORT] Fetching image from: ${rawItem.slice(0, 60)}...`);
        const res = await fetch(rawItem, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          redirect: 'follow'
        });
        if (!res.ok) {
          errors.push(`URL returned status ${res.status}: ${rawItem}`);
          continue;
        }
        const arrayBuf = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        const validation = isValidImageBuffer(buffer);
        if (!validation.valid) {
          errors.push(`Invalid image buffer from URL: ${validation.error} (${rawItem})`);
          continue;
        }

        const ext = validation.format || "png";
        let urlFilename = "image";
        try {
          const u = new URL(rawItem);
          const base = path.basename(u.pathname);
          if (base && base.includes(".")) urlFilename = base.replace(/[^a-zA-Z0-9._-]/g, "_");
          else urlFilename = `ext_${Date.now()}.${ext}`;
        } catch (_) {
          urlFilename = `ext_${Date.now()}.${ext}`;
        }
        if (!urlFilename.endsWith(`.${ext}`)) urlFilename += `.${ext}`;

        fs.writeFileSync(path.join(st.MARKETING_IMAGES_DIR, urlFilename), buffer);
        fs.writeFileSync(path.join(pubDir, urlFilename), buffer);
        importedCount++;
        addLog("success", `[URL IMPORT] Imported image: ${urlFilename} (${Math.round(buffer.length / 1024)} KB, ${ext.toUpperCase()})`);
      } catch (uErr) {
        errors.push(`Error downloading ${rawItem}: ${(uErr as Error).message}`);
        addLog("error", `[URL IMPORT] Failed to download from ${rawItem}: ${(uErr as Error).message}`);
      }
      continue;
    }

    errors.push(`Unrecognized link or format: ${rawItem}`);
  }

  // Auto-prune older images if requested or if auto-pruning is enabled
  const pruneLimit = getLocalBotSettings().autoPruneEnabled ? (getLocalBotSettings().autoPruneLimit || 30) : null;
  if (pruneLimit && pruneLimit > 0) {
    pruneMarketingImages(pruneLimit);
  }

  return {
    importedCount,
    errors,
    message: `Imported ${importedCount} image(s) successfully.` + (errors.length > 0 ? ` (${errors.length} failed/skipped)` : "")
  };
}

app.post("/api/marketing-images/import-external", async (req, res) => {
  try {
    const { links, replaceExisting } = req.body;
    if (!links || typeof links !== "string" || !links.trim()) {
      return res.status(400).json({ success: false, error: "Please provide a Google Drive link, S3 URL, or image links." });
    }

    const result = await importImagesFromExternalSources(links, Boolean(replaceExisting));
    res.json({
      success: true,
      importedCount: result.importedCount,
      errors: result.errors.length > 0 ? result.errors : undefined,
      message: result.message,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

app.post("/api/marketing-images/batch-delete", (req, res) => {
  try {
    const { filenames } = req.body;
    if (!Array.isArray(filenames) || filenames.length === 0) {
      return res.status(400).json({ success: false, error: "No filenames provided for batch deletion." });
    }

    const pubDir = path.join(process.cwd(), "public", "uploads", "marketing_images");
    let deletedCount = 0;

    for (const raw of filenames) {
      const filename = String(raw || "").trim();
      if (!filename || filename.includes("..") || filename.includes("/")) continue;

      const outPath = path.join(st.MARKETING_IMAGES_DIR, filename);
      const pubPath = path.join(pubDir, filename);

      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
      if (fs.existsSync(pubPath)) fs.unlinkSync(pubPath);
      deletedCount++;
    }

    addLog("info", `Batch deleted ${deletedCount} marketing images.`);
    res.json({ success: true, deletedCount, message: `Successfully deleted ${deletedCount} image(s).` });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

app.post("/api/marketing-images/clear-all", (req, res) => {
  try {
    const images = getAvailableMarketingImages();
    const pubDir = path.join(process.cwd(), "public", "uploads", "marketing_images");

    for (const file of images) {
      const outPath = path.join(st.MARKETING_IMAGES_DIR, file);
      const pubPath = path.join(pubDir, file);
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
      if (fs.existsSync(pubPath)) fs.unlinkSync(pubPath);
    }

    addLog("info", `Cleared all ${images.length} marketing images.`);
    res.json({ success: true, message: `Removed all ${images.length} images.` });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// 4.55. Set continuous loop active
app.post("/api/set-continuous-loop", (req, res) => {
  const currentSettings = getLocalBotSettings();
  if (currentSettings.schedulerEnabled || isSchedulerRunning()) {
    return res.status(409).json({ error: "Cannot enable continuous loop while multi-account scheduler is enabled. Pause or stop the scheduler to change settings." });
  }
  const { active, intervalMinutes } = req.body;
  if (active && !st.isContinuousLoopActive && isBusy()) {
    addLog("warning", "Cannot enable Continuous Automation Loop while another manual action is already running.");
    return res.status(400).json({ success: false, error: "Cannot enable Continuous Automation Loop while another manual action is already running." });
  }

  if (active && !st.isContinuousLoopActive) {
    const activeId = getActiveProfileId();
    const rawProfiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
    const activeProfile = rawProfiles.find(p => p.id === activeId);
    const sessionExists = fs.existsSync(st.AUTH_STATE_FILE);
    const hasValidAuth = sessionExists && activeProfile?.stateJson && sessionHasValidCookies(activeProfile.stateJson);
    if (!activeId || !hasValidAuth) {
      addLog("error", "Cannot enable Continuous Automation Loop without an active, authenticated account session.");
      return res.status(400).json({ success: false, error: "Cannot enable Continuous Automation Loop without an active, authenticated account session. Please import or log into an account profile first." });
    }
  }

  let intervalChanged = false;
  if (intervalMinutes !== undefined && typeof intervalMinutes === "number" && intervalMinutes > 0) {
    const safeMins = Math.max(5, Math.round(intervalMinutes));
    if (st.continuousLoopIntervalMinutes !== safeMins) {
      st.continuousLoopIntervalMinutes = safeMins;
      intervalChanged = true;
      addLog("info", `Continuous Loop cooldown interval updated to ${st.continuousLoopIntervalMinutes} minutes (minimum enforced: 5 minutes).`);
    }
  }

  if (active !== undefined) {
    const nextActive = !!active;
    if (nextActive !== st.isContinuousLoopActive) {
      st.isContinuousLoopActive = nextActive;
      if (st.isContinuousLoopActive) {
        addLog("success", `Continuous Automation Loop enabled (${st.continuousLoopIntervalMinutes}-minute interval).`);
        if (st.botStatus === "Completed" || st.botStatus === "Idle") {
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
  if (st.isContinuousLoopActive && intervalChanged) {
    if (st.nextCycleTimeout !== null || (!isBusy() && !st.isPostingRunning && !st.isGeneratingRunning)) {
      addLog("info", `Rescheduling next continuous cycle to ${st.continuousLoopIntervalMinutes} minutes from now due to interval change.`);
      scheduleNextAutomationCycle();
    } else {
      addLog("info", `[AUTOMATION] New interval (${st.continuousLoopIntervalMinutes}m) will apply cleanly after current cycle completes.`);
    }
  }

  res.json({ success: true, isContinuousLoopActive: st.isContinuousLoopActive, nextCycleStartTime: st.nextCycleStartTime, continuousLoopIntervalMinutes: st.continuousLoopIntervalMinutes });
});

// 4.6. Check system dependencies & Playwright health (with automatic startup warm-up & fast cache)

async function runSystemDiagnosticsCheck(force = false): Promise<any> {
  const now = Date.now();
  if (!force && st.cachedSystemCheckResult && (now - st.cachedSystemCheckAt < 5 * 60 * 1000)) {
    return st.cachedSystemCheckResult;
  }

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
      if (process.platform === "win32") {
        const testBrowser = await chromium.launch({ headless: true, chromiumSandbox: false, args: ["--no-sandbox"] });
        const ver = testBrowser.version();
        await testBrowser.close().catch(() => {});
        launchStatus = "success";
        message = `Chromium binary verified successfully: Chrome for Testing ${ver}`;
      } else {
        const output = execSync(`"${executablePath}" --version`, { stdio: "pipe", timeout: 5000 }).toString().trim();
        launchStatus = "success";
        message = `Chromium binary verified successfully: ${output}`;
      }
    } catch (err) {
      const errMsg = (err as Error).message || "";
      const stderr = (err as any).stderr?.toString() || "";
      const combinedError = `${errMsg} ${stderr}`;
      
      launchStatus = "failed";
      
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

  const result = {
    success: launchStatus === "success",
    playwrightInstalled,
    browsersPath,
    executablePath,
    executableExists,
    launchStatus,
    message,
    missingLibraries,
    checkedAt: new Date(now).toISOString(),
  };

  st.cachedSystemCheckResult = result;
  st.cachedSystemCheckAt = now;
  return result;
}

// Automatically warm up system diagnostics on server startup (outside Vitest) so /admin loads instantaneously
if (!process.env.VITEST) {
  setTimeout(() => {
    runSystemDiagnosticsCheck(true).catch(() => {});
  }, 500);
}

app.get("/api/check-system", async (req, res) => {
  try {
    const force = req.query.force === "true";
    const result = await runSystemDiagnosticsCheck(force);
    res.json(result);
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
  const hasAuthState = !!(process.env.AUTH_STATE_JSON || (fs.existsSync(st.AUTH_STATE_FILE) && fs.statSync(st.AUTH_STATE_FILE).size > 100));

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
        model: "gemini-2.5-flash"
      },
      activeAiModel: hasOpenAi ? "OpenAI (gpt-4o-mini)" : hasGemini ? "Gemini (gemini-2.5-flash)" : "Rule-based templates (No AI Key)"
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
      sessionFileExists: fs.existsSync(st.AUTH_STATE_FILE)
    }
  });
});

// 5. Check login session (Runs real headless Playwright against CoinMarketCap)
app.post("/api/check-login", async (req, res) => {
  if (st.isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot check session while the Continuous Automation Loop is active." });
  }
  const lock = acquireProcessLock("checking_login", "Verifying CoinMarketCap session");
  if (!lock.success) {
    return res.status(409).json({ error: lock.reason });
  }
  addLog("info", "Checking live login session validity on CoinMarketCap using Playwright...");
  st.botStatus = "Checking Login";

  const sessionExists = fs.existsSync(st.AUTH_STATE_FILE);
  if (!sessionExists) {
    releaseProcessLock("checking_login");
    addLog("error", "Login check failed: auth/state.json does not exist. Please upload active session cookies.");
    st.botStatus = "Idle";
    
    try {
      let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
      const activeIdx = profiles.findIndex(p => p.isActive);
      if (activeIdx >= 0) {
        profiles[activeIdx].loginStatus = "expired";
        profiles[activeIdx].updatedAt = new Date().toISOString();
        fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
        await saveProfilesCloudIfChanged(profiles);
      }
    } catch (_) {}

    return res.json({ status: "expired", message: "auth/state.json missing" });
  }

  try {
    const result = await checkLoginReal();
    
    // Update active profile loginStatus
    try {
      let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
      const activeIdx = profiles.findIndex(p => p.isActive);
      if (activeIdx >= 0) {
        profiles[activeIdx].loginStatus = result.status === "success" ? "logged_in" : "expired";
        profiles[activeIdx].updatedAt = new Date().toISOString();
        fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
        await saveProfilesCloudIfChanged(profiles);
      }
    } catch (err) {
      console.error("Error updating profile status in check-login:", (err as Error).message);
    }

    st.botStatus = "Idle";
    return res.json(result);
  } catch (err) {
    addLog("error", `Real login verification failed: ${(err as Error).message}`);
    st.botStatus = "Idle";

    try {
      let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
      const activeIdx = profiles.findIndex(p => p.isActive);
      if (activeIdx >= 0) {
        profiles[activeIdx].loginStatus = "expired";
        profiles[activeIdx].updatedAt = new Date().toISOString();
        fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
        await saveProfilesCloudIfChanged(profiles);
      }
    } catch (_) {}

    return res.json({ status: "failed", message: (err as Error).message });
  } finally {
    releaseProcessLock("checking_login");
  }
});

// 5.1. Start interactive credential login
app.post("/api/start-login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Missing email or password." });
  }

  if (st.isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot start login while the Continuous Automation Loop is active." });
  }
  if (isBusy() || st.activeSystemProcess !== "none") {
    return res.status(409).json({ error: "Another automated process is currently running. Please wait for it to finish." });
  }

  const lock = acquireProcessLock("authenticating", "Interactive credential login");
  if (!lock.success) {
    return res.status(409).json({ error: lock.reason });
  }

  // 1. Check profiles
  let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
  const existingProfile = profiles.find(p => p.name.toLowerCase() === email.toLowerCase());

  // 2. Check if we reached the maximum of 5 accounts only if creating a new profile
  if (!existingProfile && profiles.length >= 5) {
    releaseProcessLock("authenticating");
    return res.status(400).json({ error: "Maximum limit of 5 accounts reached. Please delete an existing profile to add a new one." });
  }

  st.botStatus = "Authenticating";
  st.loginState = { status: "authenticating", message: "Initializing secure credentials login flow..." };

  // Run asynchronously in background to prevent 504 Gateway Timeout on AWS/Nginx proxy
  executeStartLogin(email, password)
    .then((result) => {
      const mappedStatus = result.status === "requires_otp" ? "requires_otp" : (result.status === "success" ? "success" : "failed");
      st.loginState = { status: mappedStatus, message: result.message };
      if (result.status !== "requires_otp") {
        st.botStatus = "Idle";
        releaseProcessLock("authenticating");
      } else {
        st.botStatus = "Verifying Code";
      }
    })
    .catch((error) => {
      st.botStatus = "Idle";
      releaseProcessLock("authenticating");
      st.loginState = { status: "failed", message: (error as Error).message };
    });

  return res.json({ status: "authenticating", message: "Automated login flow initiated. Please wait..." });
});

// 5.2. Submit OTP / Verification Code
app.post("/api/submit-otp", async (req, res) => {
  const { otp } = req.body;
  if (!otp) {
    return res.status(400).json({ error: "Missing OTP verification code." });
  }

  if (st.isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot submit OTP while the Continuous Automation Loop is active." });
  }

  st.botStatus = "Verifying Code";
  st.loginState = { status: "authenticating", message: "Submitting 6-digit verification code..." };

  // Run asynchronously in background to prevent 504 Gateway Timeout on AWS/Nginx proxy
  executeSubmitOtp(otp)
    .then((result) => {
      releaseProcessLock("authenticating");
      st.loginState = { status: result.status, message: result.message };
      st.botStatus = "Idle";
      if (result.status === "success") {
        setTimeout(() => {
          if (st.loginState.status === "success") {
            st.loginState = { status: "idle", message: "" };
          }
        }, 15000);
      }
    })
    .catch((error) => {
      releaseProcessLock("authenticating");
      st.botStatus = "Idle";
      st.loginState = { status: "failed", message: (error as Error).message };
    });

  return res.json({ status: "authenticating", message: "OTP submission initiated. Please wait..." });
});

// 5.3. Cancel active login session
app.post("/api/cancel-login", async (req, res) => {
  if (st.isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot cancel login while the Continuous Automation Loop is active." });
  }
  releaseProcessLock("authenticating");
  try {
    await executeCancelLogin();
    st.botStatus = "Idle";
    st.loginState = { status: "idle", message: "Login session cancelled." };
    return res.json({ success: true, message: "Login session cancelled." });
  } catch (error) {
    st.botStatus = "Idle";
    st.loginState = { status: "idle", message: (error as Error).message };
    return res.status(500).json({ error: (error as Error).message });
  }
});

// 5.3b. Reset login state to idle cleanly (for logging into another account)
app.post("/api/reset-login-state", async (req, res) => {
  releaseProcessLock("authenticating");
  try {
    if (st.activeLoginSession) {
      await st.activeLoginSession.browser.close().catch(() => {});
      st.activeLoginSession = null;
    }
  } catch (_) {}
  st.botStatus = "Idle";
  st.loginState = { status: "idle", message: "" };
  return res.json({ success: true, message: "Login state reset to idle." });
});

// 5.4. Retry manual post for a single coin
app.post("/api/retry-single", async (req, res) => {
  const { symbol } = req.body;
  if (!symbol) {
    return res.status(400).json({ error: "Missing coin symbol." });
  }

  if (isBusy() || st.isPostingRunning || st.isGeneratingRunning || st.isSchedulerCycleRunning) {
    return res.status(409).json({ error: "Another automated process is currently active. Please wait for the current coin to finish." });
  }

  const lock = acquireProcessLock("retry_single", `Retrying post for ${symbol}`);
  if (!lock.success) {
    return res.status(409).json({ error: lock.reason });
  }

  // Lock status to active posting so other frontend elements disable and pause updates correctly
  st.isPostingRunning = true;
  st.botStatus = "Posting";
  st.currentCoinName = symbol;

  try {
    addLog("info", `Initiating manual individual retry for coin ticker ${symbol}...`);
    const messages = readJsonFile<GeneratedMessage[]>(st.GENERATED_MESSAGES_FILE, []);
    let item = messages.find(m => m.symbol.toLowerCase() === symbol.toLowerCase());
    
    if (!item) {
      const resultsList = readJsonFile<PostResult[]>(st.RESULTS_FILE, []);
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
    let targetCheckUrl = item.url;

    addLog("info", `Launching automated Playwright context for manual retry of ${item.name}...`);
    try {
      const resolvedUrl = await resolveToFirstPartyUrl(item.url, item.symbol, item.name);
      const realResult = await runRealPosting(resolvedUrl, item.message, item.sentiment || "bullish");
      outcome = realResult.status;
      messageText = realResult.message;
      if (realResult.postUrl) {
        targetCheckUrl = realResult.postUrl;
      }
    } catch (err) {
      outcome = "failed";
      messageText = `Playwright manual retry error: ${(err as Error).message}`;
      addLog("error", `CRITICAL Error during manual retry automation: ${messageText}`);
    }

    // Update in st.RESULTS_FILE
    const results = readJsonFile<PostResult[]>(st.RESULTS_FILE, []);
    const existingIdx = results.findIndex(r => r.symbol.toLowerCase() === symbol.toLowerCase());
    
    const newResultEntry: PostResult = {
      name: item.name,
      symbol: item.symbol,
      url: targetCheckUrl,
      status: outcome,
      message: messageText,
      timestamp: new Date().toLocaleTimeString(),
      createdAt: Date.now(),
      sentiment: item.sentiment || "bullish",
      profileId: getActiveProfileId() || undefined,
    } as any;

    if (existingIdx !== -1) {
      results[existingIdx] = newResultEntry;
    } else {
      results.push(newResultEntry);
    }

    await writeJsonFile(st.RESULTS_FILE, results);
    const retryPid = getActiveProfileId();
    if (retryPid) savePostResultsCloud(results, retryPid).catch(() => {});
    
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
    releaseProcessLock("retry_single");
    st.isPostingRunning = false;
    st.botStatus = "Idle";
    st.currentCoinName = "N/A";
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

async function executeFetchTrending(options?: { skipSaveToActiveProfile?: boolean }): Promise<{ coins: Coin[]; creditCount: number }> {
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
        const response = await fetch("https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?start=1&limit=100&convert=USD", {
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
        const response = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=1h,24h,7d");
        
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

  const settings = getLocalBotSettings();
  const targetCount = typeof settings.targetCoinsCount === "number" ? settings.targetCoinsCount : 0;
  const targetedCoins = targetCount > 0 ? resolvedCoins.slice(0, targetCount) : resolvedCoins;

  if (!options?.skipSaveToActiveProfile) {
    await writeJsonFile(st.LAST_TRENDING_FILE, targetedCoins);
    updateRealFetchTime();
    // Clear obsolete comments from previous batch so data is never inconsistent
    await writeJsonFile(st.GENERATED_MESSAGES_FILE, []);
    saveBotProgress({ next_index: 0 });
    st.currentPostingIndex = 0;
  }
  return { coins: targetedCoins, creditCount };
}

export function formatCommentWithCashtag(comment: string, symbol: string): string {
  if (!symbol || !comment) return comment || "";
  let cleaned = comment.trim();
  const sym = symbol.trim().replace(/^\$/, "").toUpperCase();
  const cashtag = `$${sym}`;

  // Clean out any doubled leading cashtags e.g. "$BTC $BTC", "$BTC - $BTC", "$BTC with $BTC"
  const doubleTagRegex = new RegExp(`^(\\s*\\$${sym}\\s*[-:,]?\\s*){2,}`, "i");
  if (doubleTagRegex.test(cleaned)) {
    cleaned = cleaned.replace(doubleTagRegex, `${cashtag} `).trim();
  }

  // If the cashtag is already present as a distinct tag, keep as is (no extra prefix)
  if (cleaned.toUpperCase().includes(cashtag)) {
    return cleaned;
  }
  
  // If the symbol appears as a standalone word without $, replace the first occurrence
  const escapedSym = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordRegex = new RegExp(`\\b${escapedSym}\\b`, "i");
  if (wordRegex.test(cleaned)) {
    return cleaned.replace(wordRegex, cashtag);
  }
  
  // Otherwise, prepend the cashtag naturally with a space
  return `${cashtag} ${cleaned}`;
}

async function generateMessagesForCoins(coins: Coin[]): Promise<GeneratedMessage[]> {
  if (!coins || coins.length === 0) {
    return [];
  }

  const generatedMessages: GeneratedMessage[] = [];
  const getCoinKey = (c: { symbol: string; url?: string; name?: string }): string => {
    return (c.url || `${c.name || ''}_${c.symbol}`).trim().toLowerCase();
  };

  // Helper to check which coins are still missing generated comments (1-to-1 match for every coin)
  const getMissingCoins = (): Coin[] => {
    const existingKeys = new Set(generatedMessages.map(m => getCoinKey(m)));
    return coins.filter(c => !existingKeys.has(getCoinKey(c)));
  };

  // 1. Primary Model: OpenAI gpt-4o-mini
  if (process.env.OPENAI_API_KEY) {
    try {
      st.lastOpenAiError = null; // Reset previous error if we have a key and are trying again
      const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
      addLog("info", "Initializing OpenAI SDK with gpt-4o-mini...");
      const openai = new OpenAI({
        apiKey: OPENAI_API_KEY,
      });

      const batchSize = 10;
      for (let i = 0; i < coins.length; i += batchSize) {
        if (!st.isGeneratingRunning) {
          addLog("warning", "Comment generation aborted by user.");
          break;
        }
        const chunk = coins.slice(i, i + batchSize);
        const schedPrefix = st.isSchedulerCycleRunning ? "[SCHEDULER] " : "";
        addLog("info", `${schedPrefix}Generating batch of comments ${Math.floor(i / batchSize) + 1}/${Math.ceil(coins.length / batchSize)} with gpt-4o-mini...`);

        const prompt = `
          Generate ONE unique, insightful, human-sounding crypto community comment for EACH of the following coins, AND classify the sentiment as either "bullish" or "bearish".

          CRITICAL Anti-Spam & Moderation Rules (Preventing Comment Removal & Account Bans):
          - ANTI-REMOVAL DIRECTIVE: CoinMarketCap automated moderation flags and removes repetitive comments, promotional hype, or generic bot spam. Write authentic, analytical commentary as an experienced crypto trader analyzing the chart and order book.
          - STRICTLY FORBIDDEN: NEVER use spam words like "100x", "moon", "pump", "dump", "presale", "airdrop", "telegram", "whatsapp", "dm me", or links.
          - DO NOT write any cashtag prefix like "$BTC", "$ETH", "$DGAI" or "#SYMBOL". CoinMarketCap already attaches and displays the official coin cashtag chip automatically on the comment. Writing "$SYMBOL" causes duplicate tags and glued text.
          - STRICTLY FORBIDDEN REPETITIVE PHRASES: Do NOT use phrases like "struggling to find its footing", "anyone else worried about this recent dip", "could this be the start of something bigger", "making small gains today", "is a bummer", "showing signs of weakness", "turnaround on the horizon".
          - Rotate dynamically across these 5 authentic trader archetypes:
            1. Technical & Price Structure (e.g. "Consolidating tightly above local support on the 4H chart. Clean retest here could trigger the next wave up.")
            2. Volume & Order Flow (e.g. "Noticeable uptick in buy-side volume over the past few hours. Bulls absorbing sell pressure nicely.")
            3. Relative Strength & Accumulation (e.g. "Showing solid relative strength while broader markets remain choppy. Steady accumulation taking place.")
            4. Community & Market Debate (e.g. "Testing the upper bounds of the range on expanding volume. Are you holding spot or scaling out here?")
            5. Short & Punchy Reaction (e.g. "Chart structure looking very constructive into the daily close. Watching key levels.")
          - 1 to 2 natural sentences. Varied lengths (some 10-14 words, some 16-24 words).
          - No emojis. No hashtags (#). No disclaimers ("not financial advice").
          - No two comments should share the same opening words or sentence structure!

          Provide the output as a valid JSON object matching this schema:
          {
            "messages": [
              {
                "symbol": "BTC",
                "sentiment": "bullish",
                "message": "Actual clean comment text here"
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
          temperature: 0.85,
          max_tokens: 4000,
        });

        const rawText = response.choices[0].message.content || "{}";
        const parsed = JSON.parse(rawText.trim());
        if (parsed.messages && Array.isArray(parsed.messages)) {
          parsed.messages.forEach((msg: any, msgIdx: number) => {
            const matchCoin = chunk.find(c => c.symbol.toLowerCase() === msg.symbol?.toLowerCase() && !generatedMessages.some(m => getCoinKey(m) === getCoinKey(c))) || (chunk[msgIdx] && !generatedMessages.some(m => getCoinKey(m) === getCoinKey(chunk[msgIdx])) ? chunk[msgIdx] : null);
            if (matchCoin && !generatedMessages.some(m => getCoinKey(m) === getCoinKey(matchCoin))) {
              const formattedComment = sanitizeCommentForAntiSpam(msg.message, matchCoin.symbol);
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
      st.lastOpenAiError = errMsg;
    }
  }

  // 2. Fallback Model: Gemini gemini-2.5-flash (Send ONLY missing coins - Item 6)
  const missingForGemini = getMissingCoins();
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (missingForGemini.length > 0 && geminiKey) {
    try {
      st.lastGeminiError = null; // Reset previous error if we have a key and are trying again
      addLog("info", `Using Gemini API (gemini-2.5-flash) to generate ${missingForGemini.length} missing comments...`);
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
        if (!st.isGeneratingRunning) {
          addLog("warning", "Comment generation aborted by user.");
          break;
        }
        const chunk = missingForGemini.slice(i, i + batchSize);
        addLog("info", `Generating batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(missingForGemini.length / batchSize)} with gemini-2.5-flash (${chunk.length} coins)...`);

        const prompt = `
          Generate ONE unique, insightful, human-sounding crypto community comment for EACH of the following coins, AND classify the sentiment as either "bullish" or "bearish".

          CRITICAL Anti-Spam & Moderation Rules (Preventing Comment Removal & Account Bans):
          - ANTI-REMOVAL DIRECTIVE: CoinMarketCap automated moderation flags and removes repetitive comments, promotional hype, or generic bot spam. Write authentic, analytical commentary as an experienced crypto trader analyzing the chart and order book.
          - STRICTLY FORBIDDEN: NEVER use spam words like "100x", "moon", "pump", "dump", "presale", "airdrop", "telegram", "whatsapp", "dm me", or links.
          - DO NOT write any cashtag prefix like "$BTC", "$ETH", "$DGAI" or "#SYMBOL". CoinMarketCap already attaches and displays the official coin cashtag chip automatically on the comment. Writing "$SYMBOL" causes duplicate tags and glued text.
          - STRICTLY FORBIDDEN REPETITIVE PHRASES: Do NOT use phrases like "struggling to find its footing", "anyone else worried about this recent dip", "could this be the start of something bigger", "making small gains today", "is a bummer", "showing signs of weakness", "turnaround on the horizon".
          - Rotate dynamically across these 5 authentic trader archetypes:
            1. Technical & Price Structure (e.g. "Consolidating tightly above local support on the 4H chart. Clean retest here could trigger the next wave up.")
            2. Volume & Order Flow (e.g. "Noticeable uptick in buy-side volume over the past few hours. Bulls absorbing sell pressure nicely.")
            3. Relative Strength & Accumulation (e.g. "Showing solid relative strength while broader markets remain choppy. Steady accumulation taking place.")
            4. Community & Market Debate (e.g. "Testing the upper bounds of the range on expanding volume. Are you holding spot or scaling out here?")
            5. Short & Punchy Reaction (e.g. "Chart structure looking very constructive into the daily close. Watching key levels.")
          - 1 to 2 natural sentences. Varied lengths (some 10-14 words, some 16-24 words).
          - No emojis. No hashtags (#). No disclaimers ("not financial advice").
          - No two comments should share the same opening words or sentence structure!

          Provide the output as a valid JSON object matching this schema:
          {
            "messages": [
              {
                "symbol": "BTC",
                "sentiment": "bullish",
                "message": "Actual clean comment text here"
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
              model: "gemini-2.5-flash",
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
            parsed.messages.forEach((msg: any, msgIdx: number) => {
              const matchCoin = chunk.find(c => c.symbol.toLowerCase() === msg.symbol?.toLowerCase() && !generatedMessages.some(m => getCoinKey(m) === getCoinKey(c))) || (chunk[msgIdx] && !generatedMessages.some(m => getCoinKey(m) === getCoinKey(chunk[msgIdx])) ? chunk[msgIdx] : null);
              if (matchCoin && !generatedMessages.some(m => getCoinKey(m) === getCoinKey(matchCoin))) {
                const formattedComment = sanitizeCommentForAntiSpam(msg.message, matchCoin.symbol);
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
      st.lastGeminiError = errMsg;
    }
  }

  // 3. Fill ANY remaining missing coins using high-diversity dynamic anti-spam generator (Item 6)
  const remainingMissing = getMissingCoins();
  if (remainingMissing.length > 0) {
    addLog("warning", `Filling ${remainingMissing.length} remaining comments using dynamic anti-spam generator (100% lexical diversity)...`);
    
    const usedCommentsCache = new Set<string>(generatedMessages.map(m => m.message));

    remainingMissing.forEach((coin) => {
      const isBullish = coin.change_24h >= 0;
      const rawComment = generateDynamicUniqueComment(isBullish, usedCommentsCache);
      const sanitized = sanitizeCommentForAntiSpam(rawComment, coin.symbol);
      usedCommentsCache.add(sanitized);

      generatedMessages.push({
        name: coin.name,
        symbol: coin.symbol,
        url: coin.url,
        message: sanitized,
        sentiment: isBullish ? "bullish" : "bearish",
      });
    });
  }

  return generatedMessages;
}

async function executeGenerateMessages(coinsInput?: Coin[]): Promise<number> {
  let coins = coinsInput || readJsonFile<Coin[]>(st.LAST_TRENDING_FILE, []);
  if (coins.length === 0) {
    throw new Error("No trending coins found in output/last_trending.json. Please fetch trending coins first.");
  }
  const settings = getLocalBotSettings();
  const targetCount = typeof settings.targetCoinsCount === "number" ? settings.targetCoinsCount : 0;
  if (targetCount > 0 && coins.length > targetCount) {
    addLog("info", `[TARGET CAP] Limiting comment generation to top ${targetCount} coins as specified by targetCoinsCount setting.`);
    coins = coins.slice(0, targetCount);
  }
  const generatedMessages = await generateMessagesForCoins(coins);
  await writeJsonFile(st.GENERATED_MESSAGES_FILE, generatedMessages);
  saveBotProgress({ next_index: 0 });
  updateRealGenerateTime();
  return generatedMessages.length;
}

// 6. Fetch Trending Coins Endpoint (Mutex and Progress Locked)
app.post("/api/fetch-trending", async (req, res) => {
  if (st.isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot trigger manual actions while the Continuous Automation Loop is active." });
  }
  const lock = acquireProcessLock("fetching_coins", "Fetching trending coins from CoinMarketCap");
  if (!lock.success) {
    return res.status(409).json({ error: lock.reason });
  }

  if (st.isPostingRunning) {
    releaseProcessLock("fetching_coins");
    addLog("warning", "Operation blocked: A posting run is actively executing in the background. Please stop posting before fetching new coins.");
    return res.status(400).json({
      error: "A posting run is actively executing in the background. Please stop posting before fetching new coins."
    });
  }

  addLog("info", "Starting cryptocurrency listings fetch...");
  st.botStatus = "Fetching";

  try {
    const { coins, creditCount } = await executeFetchTrending();
    addLog("success", `Successfully fetched ${coins.length} coins. (Credits consumed: ${creditCount})`);
    st.botStatus = "Idle";
    const ts = getRealTimestamps();
    res.json({ status: "success", coins, totalCoins: coins.length, credit_count: creditCount, coinsFetchedAt: ts.coinsFetchedAt, coinsFetchedTime: ts.coinsFetchedTime });
  } catch (error) {
    addLog("error", `Failed fetching coins: ${(error as Error).message}`);
    st.botStatus = "Idle";
    res.status(500).json({ status: "error", message: (error as Error).message });
  } finally {
    releaseProcessLock("fetching_coins");
  }
});

// 7. Generate community messages Endpoint (Mutex and Progress Locked)
app.post("/api/generate-messages", async (req, res) => {
  if (st.isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot trigger manual actions while the Continuous Automation Loop is active." });
  }
  const lock = acquireProcessLock("generating_comments", "Generating AI comments for coins");
  if (!lock.success) {
    return res.status(409).json({ error: lock.reason });
  }

  updateActiveProfilePaths();

  if (st.isPostingRunning || st.isSinglePostingRunning || st.isSchedulerCycleRunning) {
    releaseProcessLock("generating_comments");
    addLog("warning", "Operation blocked: A posting run is actively executing in the background. Please stop posting before generating comments.");
    return res.status(400).json({
      error: "A posting run is actively executing in the background. Please stop posting before generating comments."
    });
  }

  // DATA CONSISTENCY CHECK: Ensure we actually have trending coins
  const coins = readJsonFile<Coin[]>(st.LAST_TRENDING_FILE, []);
  if (coins.length === 0) {
    releaseProcessLock("generating_comments");
    addLog("error", "Data inconsistency: Trending coins list is empty. Please fetch trending data first.");
    return res.status(400).json({ error: "Cannot generate comments: Trending coins list is empty. Please fetch trending data first." });
  }

  const prevMessages = readJsonFile<GeneratedMessage[]>(st.GENERATED_MESSAGES_FILE, []);
  const prevProgress = readBotProgress();
  if (prevMessages.length > 0 && prevProgress.next_index > 0 && prevProgress.next_index < prevMessages.length) {
    addLog("info", `Regenerating community comments for trending coins (previous progress was ${prevProgress.next_index}/${prevMessages.length} posted; resetting progress index to 0).`);
  }

  addLog("info", "Starting community comments generation...");
  st.botStatus = "Generating";
  st.isGeneratingRunning = true;

  try {
    const count = await executeGenerateMessages();
    addLog("success", `Successfully generated community comments for all ${count} coins! Saved to generated_messages.json.`);
    st.botStatus = "Idle";
    const ts = getRealTimestamps();
    res.json({ status: "success", count, totalGenerated: count, commentsGeneratedAt: ts.commentsGeneratedAt, commentsGeneratedTime: ts.commentsGeneratedTime });
  } catch (error) {
    addLog("error", `Failed message generation: ${(error as Error).message}`);
    st.botStatus = "Idle";
    res.status(500).json({ status: "error", message: (error as Error).message });
  } finally {
    st.isGeneratingRunning = false;
    releaseProcessLock("generating_comments");
  }
});

// 7.5. Fetch fresh trending coins AND generate comments in one streamlined sequence
app.post("/api/fetch-and-generate-fresh", async (req, res) => {
  if (st.isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot trigger manual actions while Continuous Automation Loop is active." });
  }
  const lock = acquireProcessLock("refresh_fresh", "Refreshing trending coins & AI comments");
  if (!lock.success) {
    return res.status(409).json({ error: lock.reason });
  }

  try {
    addLog("info", "[FRESH RUN] Fetching new cryptocurrency trending listings from CoinMarketCap...");
    st.botStatus = "Fetching";
    const { coins, creditCount } = await executeFetchTrending();
    addLog("success", `[FRESH RUN] Successfully fetched ${coins.length} coins. (Credits consumed: ${creditCount})`);

    addLog("info", "[FRESH RUN] Automatically generating updated AI comments for all coins...");
    st.botStatus = "Generating";
    st.isGeneratingRunning = true;
    const count = await executeGenerateMessages();
    addLog("success", `[FRESH RUN] Successfully generated fresh community comments for all ${count} coins! Ready for posting.`);
    st.botStatus = "Idle";
    st.isGeneratingRunning = false;

    const ts = getRealTimestamps();
    res.json({
      status: "success",
      coinsCount: coins.length,
      messagesCount: count,
      coinsFetchedAt: ts.coinsFetchedAt,
      commentsGeneratedAt: ts.commentsGeneratedAt,
    });
  } catch (error) {
    st.botStatus = "Idle";
    st.isGeneratingRunning = false;
    addLog("error", `[FRESH RUN] Failed to refresh trending data & comments: ${(error as Error).message}`);
    res.status(500).json({ error: (error as Error).message });
  } finally {
    releaseProcessLock("refresh_fresh");
  }
});

// 8. Start posting sequence (Loop)
app.post("/api/post-chat", (req, res) => {
  if (st.isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot trigger manual actions while the Continuous Automation Loop is active." });
  }
  if (st.isPostingRunning || st.isSinglePostingRunning) {
    return res.json({ status: "success", message: "Bot posting sequence is already active." });
  }

  const lock = acquireProcessLock("single_posting", "Posting comments to CoinMarketCap");
  if (!lock.success) {
    return res.status(409).json({ error: lock.reason });
  }

  const coins = readJsonFile<Coin[]>(st.LAST_TRENDING_FILE, []);
  const messages = readJsonFile<GeneratedMessage[]>(st.GENERATED_MESSAGES_FILE, []);

  if (coins.length === 0) {
    releaseProcessLock("single_posting");
    addLog("error", "Data inconsistency: Trending coins list is empty. Please fetch trending data first.");
    return res.status(400).json({ error: "Cannot start posting: Trending coins list is empty. Please fetch trending data and generate comments first." });
  }

  if (messages.length === 0) {
    releaseProcessLock("single_posting");
    addLog("error", "Data inconsistency: Generated comments are empty. Please generate comments first.");
    return res.status(400).json({ error: "Cannot start posting: No generated comments found. Please generate comments first." });
  }

  addLog("info", `Consistency check passed: ${coins.length} coins and ${messages.length} comments are loaded for the active account.`);

  // Stale Market Data Check (2+ days / 48 hours old)
  const ts = getRealTimestamps();
  const now = Date.now();
  const TWO_DAYS_MS = 48 * 60 * 60 * 1000;
  const coinsAgeMs = (coins.length > 0 && ts.coinsFetchedAt) ? (now - ts.coinsFetchedAt) : null;
  const commentsAgeMs = (messages.length > 0 && ts.commentsGeneratedAt) ? (now - ts.commentsGeneratedAt) : null;
  const isDataStale = (coinsAgeMs !== null && coinsAgeMs > TWO_DAYS_MS) || (commentsAgeMs !== null && commentsAgeMs > TWO_DAYS_MS);

  if (isDataStale) {
    const daysOld = Math.max(
      coinsAgeMs ? Math.round(coinsAgeMs / (24 * 3600 * 1000)) : 0,
      commentsAgeMs ? Math.round(commentsAgeMs / (24 * 3600 * 1000)) : 0
    );
    addLog("warning", `[DATA STALE WARNING] Trending data or AI comments are ~${daysOld} days old (>48 hours). Market prices shift rapidly. Recommend fetching fresh trending coins before posting.`);
  }

  if (isDataStale && !req.body?.force) {
    releaseProcessLock("single_posting");
    return res.json({
      status: "stale_warning",
      isDataStale: true,
      message: "Trending coins or AI comments are more than 2 days old (>48 hours). Cryptocurrency market prices shift rapidly. Recommend fetching new trending coins and generating fresh comments first before posting.",
      coinsFetchedAt: ts.coinsFetchedAt,
      commentsGeneratedAt: ts.commentsGeneratedAt,
      coinsAgeMs,
      commentsAgeMs,
    });
  }

  st.isStopping = false;
  st.isSingleStopping = false;
  st.isPostingRunning = true;
  st.isSinglePostingRunning = true;
  st.botStatus = "Posting";
  addLog("info", "Initiating automated posting cycle...");

  st.currentPostingIndex = 0;

  // Start asynchronous runner
  runPostingLoop().catch((err) => {
    addLog("error", `Posting runner encountered error: ${(err as Error).message}`);
  });

  res.json({
    status: "success",
    message: "Posting sequence started successfully.",
    startIndex: 0,
  });
});

export interface PostingLoopOptions {
  scheduleNextCycle?: boolean;
  disableLoopOnFailures?: boolean;
  accountLogPrefix?: string;
}

export interface PostingLoopSummary {
  posted: number;
  failed: number;
  stopReason: "completed" | "stopped_daily_limit" | "stopped_captcha" | "skipped_expired" | "stopped_by_user" | "failed";
}

async function runPostingLoop(options: PostingLoopOptions = {}): Promise<PostingLoopSummary> {
  const isSchedulerCall = Boolean(options.accountLogPrefix);
  const scheduleNextCycle = options.scheduleNextCycle ?? true;
  const disableLoopOnFailures = options.disableLoopOnFailures ?? true;
  const prefix = options.accountLogPrefix || "";

  // Reset cancellation flags for this specific execution context
  if (!isSchedulerCall) {
    st.isStopping = false;
    st.isSingleStopping = false;
    st.isSinglePostingRunning = true;
  }
  st.isPostingRunning = true;

  const isHaltRequested = () => {
    if (isSchedulerCall) {
      return st.stopSchedulerRequested || st.pauseSchedulerRequested;
    }
    return st.isSingleStopping || st.isStopping || !st.isPostingRunning;
  };

  const logWithPrefix = (level: "info" | "success" | "warning" | "error", message: string, profileId?: string) => {
    addLog(level, `${prefix}${message}`, profileId);
  };

  let activeId = getActiveProfileId();
  const runProfileKey = activeId || "active_default";
  if (st.activeProfileRunLocks.has(runProfileKey)) {
    logWithPrefix("warning", `[MUTEX LOCK] Posting run is already active for account profile "${runProfileKey}". Rejecting concurrent trigger to prevent race condition.`);
    return { posted: 0, failed: 0, stopReason: "failed" };
  }
  st.activeProfileRunLocks.add(runProfileKey);

  updateActiveProfilePaths();
  let messages = readJsonFile<GeneratedMessage[]>(st.GENERATED_MESSAGES_FILE, []);
  let results = getIsolatedResults(activeId);
  
  let consecutiveFailures = 0;
  let sharedBrowser: any = null;
  let runPosted = 0;
  let runFailed = 0;
  let stopReason: PostingLoopSummary["stopReason"] = "completed";

  try {
    st.currentCoinName = "Verifying Session...";
    logWithPrefix("info", "Always verifying active session status before posting...");
    try {
      const loginCheck = await checkLoginReal();
      if (loginCheck.status !== "success") {
        const haltReason = loginCheck.status === "expired" ? "skipped_expired" : loginCheck.status === "captcha" ? "stopped_captcha" : "failed";
        logWithPrefix("error", `[SESSION HALT] Automated session check failed: ${loginCheck.status} (${loginCheck.message}). Halting posting sequence to protect account.`);
        st.isPostingRunning = false;
        if (!isSchedulerCall) st.isSinglePostingRunning = false;
        st.botStatus = "Idle";
        st.currentCoinName = "N/A";
        if (st.isContinuousLoopActive && disableLoopOnFailures && !isSchedulerCall) {
          cancelNextAutomationCycle();
          logWithPrefix("error", `[AUTOMATION] Continuous automation loop disabled due to unauthenticated / ${loginCheck.status} session.`);
        }
        return { posted: 0, failed: 0, stopReason: haltReason };
      } else {
        logWithPrefix("success", "[SESSION SUCCESS] Session verified as ACTIVE!");
      }
    } catch (err) {
      logWithPrefix("error", `[SESSION ERROR] Failed to run automated session check: ${(err as Error).message}`);
      st.isPostingRunning = false;
      if (!isSchedulerCall) st.isSinglePostingRunning = false;
      st.botStatus = "Idle";
      st.currentCoinName = "N/A";
      return { posted: 0, failed: 0, stopReason: "failed" };
    }

    if (isHaltRequested()) {
      logWithPrefix("warning", "Posting loop paused: stop command was received during session verification.");
      return { posted: 0, failed: 0, stopReason: "stopped_by_user" };
    }

    // CRITICAL: Re-read active paths, messages, and results after session check and autoSyncSessionToProfiles!
    updateActiveProfilePaths();
    activeId = getActiveProfileId();
    messages = readJsonFile<GeneratedMessage[]>(st.GENERATED_MESSAGES_FILE, []);
    results = getIsolatedResults(activeId);

    const botSettings = getLocalBotSettings();
    const targetCount = typeof botSettings.targetCoinsCount === "number" ? botSettings.targetCoinsCount : 0;
    if (!isSchedulerCall && targetCount > 0 && messages.length > targetCount) {
      logWithPrefix("info", `[TARGET CAP] Limiting queue to top ${targetCount} coins as specified by targetCoinsCount setting.`);
      messages = messages.slice(0, targetCount);
    }

    if (messages.length === 0) {
      logWithPrefix("error", "Data inconsistency: Generated comments queue is empty for this account. Please generate comments before posting.");
      st.isPostingRunning = false;
      if (!isSchedulerCall) st.isSinglePostingRunning = false;
      st.botStatus = "Idle";
      st.currentCoinName = "N/A";
      return { posted: 0, failed: 0, stopReason: "completed" };
    }

    const matchSymbol = (a?: string, b?: string) => {
      const sa = String(a || "").trim().toLowerCase();
      const sb = String(b || "").trim().toLowerCase();
      return sa.length > 0 && sa === sb;
    };

    // Get current batch timestamp so we do NOT falsely skip coins using historical posts from old cycles/days
    const profileTimestamps = getRealTimestamps(activeId);
    // Any successful post since comments were generated is part of this batch.
    // If commentsGeneratedAt is missing or 0, fallback to in-memory session only (never lock out coins based on old history).
    const batchGeneratedTimestamp = profileTimestamps.commentsGeneratedAt || 0;
    const inMemoryProcessedSymbols = new Set<string>();

    const isProcessedInCurrentBatch = (sym?: string, checkResultsList: PostResult[] = results): { processed: boolean; status?: string } => {
      if (!sym) return { processed: false };
      const s = sym.trim().toLowerCase();
      if (inMemoryProcessedSymbols.has(s)) {
        return { processed: true, status: "success" };
      }
      if (batchGeneratedTimestamp > 0) {
        const found = checkResultsList.find(r => {
          if (!matchSymbol(r.symbol, sym)) return false;
          // Only count SUCCESSFUL posts as processed. If a post failed or timed out, allow retry!
          if (r.status !== "success") return false;
          // CRITICAL BUG FIX: Only count posts that occurred during the CURRENT comment batch.
          // Never allow historical posts from previous cycles/days to permanently skip coins in new cycles!
          const rTime = (r as any).createdAt ? Number((r as any).createdAt) : new Date(r.timestamp).getTime();
          // Buffer by 2 minutes to prevent slight clock skew
          return !isNaN(rTime) && rTime >= (batchGeneratedTimestamp - 120000);
        });
        if (found) {
          return { processed: true, status: found.status };
        }
      }
      return { processed: false };
    };

    // Find truly pending coins for the current batch
    const pendingList = messages.filter(msgItem => !isProcessedInCurrentBatch(msgItem.symbol, results).processed);
    if (pendingList.length === 0) {
      logWithPrefix("success", `All ${messages.length} coins in the queue have already been processed in this cycle. No pending coins left to post.`);
      st.isPostingRunning = false;
      if (!isSchedulerCall) st.isSinglePostingRunning = false;
      st.botStatus = "Completed";
      st.currentCoinName = "N/A";
      if (st.isContinuousLoopActive && scheduleNextCycle && !isSchedulerCall) {
        logWithPrefix("info", `[AUTOMATION] All coins already processed. Triggering ${st.continuousLoopIntervalMinutes}-minute gap interval before next cycle...`);
        scheduleNextAutomationCycle();
      }
      return { posted: 0, failed: 0, stopReason: "completed" };
    }

    const firstPendingIdx = messages.findIndex(msgItem => !isProcessedInCurrentBatch(msgItem.symbol, results).processed);
    st.currentPostingIndex = firstPendingIdx !== -1 ? firstPendingIdx : 0;
    const initialPendingCount = pendingList.length;
    let activeQueueNum = 0;

    logWithPrefix("info", `Queue verified: ${initialPendingCount} coins pending out of ${messages.length} total comments.`);

    if (isHaltRequested()) {
      return { posted: 0, failed: 0, stopReason: "stopped_by_user" };
    }

    // Re-assert posting state
    st.isPostingRunning = true;
    if (!isSchedulerCall) {
      st.isSinglePostingRunning = true;
    }
    st.botStatus = "Posting";

    if (isHaltRequested()) {
      return { posted: 0, failed: 0, stopReason: "stopped_by_user" };
    }

    try {
      logWithPrefix("info", "Pre-launching single shared Playwright browser instance for full posting sequence...");
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
      if (sharedBrowser) {
        st.activePostingBrowser = sharedBrowser;
        logWithPrefix("info", "Shared Playwright browser instance pre-launched successfully.");
      }
    } catch (browserErr) {
      logWithPrefix("warning", `Pre-launching shared browser failed: ${(browserErr as Error).message}. Will launch context on-demand for individual posts.`);
      sharedBrowser = null;
      st.activePostingBrowser = null;
    }

    while (st.isPostingRunning && !isHaltRequested() && st.currentPostingIndex < messages.length) {
      touchProcessLock();
      const item = messages[st.currentPostingIndex];
      
      const MAX_DAILY_POSTS = getAccountDailyPostLimit(activeId);
      const progressData = readBotProgress(activeId || undefined);
      const todayStr = getTodayDateString();
      let dailyPostCount = progressData.daily_post_count || 0;

      if (dailyPostCount >= MAX_DAILY_POSTS) {
        stopReason = "stopped_daily_limit";
        logWithPrefix("warning", `[DAILY LIMIT] Account reached daily limit of ${MAX_DAILY_POSTS} posts for ${todayStr} (Count: ${dailyPostCount}/${MAX_DAILY_POSTS}). Halting run.`);
        st.isPostingRunning = false;
        if (!isSchedulerCall) st.isSinglePostingRunning = false;
        st.botStatus = "Completed";
        if (st.isContinuousLoopActive && scheduleNextCycle && !isSchedulerCall) {
          scheduleNextAutomationCycle();
        }
        break;
      }

      // Check if this coin has already been posted in the current batch
      const currentResults = getIsolatedResults(activeId);
      const batchCheck = isProcessedInCurrentBatch(item?.symbol, currentResults);
      if (batchCheck.processed) {
        logWithPrefix("info", `[SKIP] Coin ${item.symbol} was already posted in this cycle/batch (${batchCheck.status}). Moving to next.`);
        st.currentPostingIndex++;
        saveBotProgress({ next_index: st.currentPostingIndex, daily_post_count: dailyPostCount, last_post_date: todayStr });
        continue;
      }

      activeQueueNum++;
      st.currentCoinName = `${item.name} (${item.symbol})`;
      saveBotProgress({ next_index: st.currentPostingIndex, daily_post_count: dailyPostCount, last_post_date: todayStr });

      logWithPrefix("info", `----------------------------------------`);
      logWithPrefix("info", `Executing Post Sequence [Queue Item #${activeQueueNum} of ${initialPendingCount} remaining]: ${st.currentCoinName}`);

      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

      if (!st.isPostingRunning || isHaltRequested()) {
        stopReason = "stopped_by_user";
        break;
      }

      let outcome: PostResult["status"] = "success";
      let messageText = "Posted successfully";
      let targetCheckUrl = item.url;

      logWithPrefix("info", `Launching automated Playwright context for ${item.name}...`);
      try {
        const resolvedUrl = await resolveToFirstPartyUrl(item.url, item.symbol, item.name);
        const realResult = await runRealPosting(resolvedUrl, item.message, item.sentiment || "bullish", sharedBrowser);
        outcome = realResult.status;
        messageText = realResult.message;
        if (realResult.postUrl) {
          targetCheckUrl = realResult.postUrl;
        }
      } catch (err) {
        outcome = "failed";
        messageText = `Playwright runtime error: ${(err as Error).message}`;
        logWithPrefix("error", `CRITICAL Error during automation: ${messageText}`);
      }

      // Check if user requested stop during or before this post action (CRITICAL: Do NOT mark as failure!)
      if (!st.isPostingRunning || isHaltRequested() || st.isStopping || st.isSingleStopping || messageText.toLowerCase().includes("closed") || messageText.toLowerCase().includes("destroyed") || messageText.toLowerCase().includes("disconnected") || messageText.toLowerCase().includes("interrupted")) {
        stopReason = "stopped_by_user";
        logWithPrefix("warning", `[HALTED BY OPERATOR] Posting gracefully paused for ${item.symbol}. Queue position safely preserved at #${st.currentPostingIndex + 1} with no failure logged.`);
        break;
      }

      if (outcome === "success") {
        consecutiveFailures = 0;
        dailyPostCount++;
        runPosted++;
        inMemoryProcessedSymbols.add(item.symbol.trim().toLowerCase());
        logWithPrefix("success", `SUCCESS: Completed comment posted for ${item.symbol}! (Account daily count: ${dailyPostCount}/${MAX_DAILY_POSTS})`);
        
        results.push({
          name: item.name,
          symbol: item.symbol,
          url: targetCheckUrl,
          status: outcome,
          message: messageText,
          timestamp: new Date().toLocaleTimeString(),
          createdAt: Date.now(),
          sentiment: item.sentiment || "bullish",
          profileId: activeId || undefined,
        } as any);
        if (results.length > 500) results = results.slice(-500);
        writeJsonFile(st.RESULTS_FILE, results);
        
        st.currentPostingIndex++;
        saveBotProgress({ next_index: st.currentPostingIndex, daily_post_count: dailyPostCount, last_post_date: todayStr });

        // [ANTI-BAN SAFEGUARD] Organic Trader Simulation: Every 6 posts, take a natural browsing/reading pause (60-90s)
        if (runPosted > 0 && runPosted % 6 === 0) {
          const breakSec = 60 + Math.floor(Math.random() * 35);
          logWithPrefix("info", `[ANTI-BAN SAFEGUARD] Organic Trader Simulation: Taking a ${breakSec}s browsing/reading pause after batch of 6 posts to break automated patterns and protect account...`);
          await interruptibleSleep(breakSec * 1000);
        }
      } else if (outcome === "skipped") {
        logWithPrefix("warning", `SKIPPED: Skipped posting for ${item.symbol} (${messageText}).`);
        
        results.push({
          name: item.name,
          symbol: item.symbol,
          url: item.url,
          status: outcome,
          message: messageText,
          timestamp: new Date().toLocaleTimeString(),
          createdAt: Date.now(),
          sentiment: item.sentiment || "bullish",
          profileId: activeId || undefined,
        } as any);
        if (results.length > 500) results = results.slice(-500);
        writeJsonFile(st.RESULTS_FILE, results);
        
        st.currentPostingIndex++;
        saveBotProgress({ next_index: st.currentPostingIndex, daily_post_count: dailyPostCount, last_post_date: todayStr });
      } else if (outcome === "retry") {
        // [ANTI-BAN PROTECTION] Rate limited by CoinMarketCap: DO NOT immediately hammer the next coin!
        logWithPrefix("warning", `[ANTI-BAN PROTECTION] CoinMarketCap temporary rate-limit detected for ${item.symbol}: "${messageText}".`);
        logWithPrefix("warning", `Initiating anti-ban backoff: cooling down for 180s (3 minutes) before continuing to protect account from suspension...`);
        
        results.push({
          name: item.name,
          symbol: item.symbol,
          url: item.url,
          status: "failed",
          message: `Temporary rate limit by CMC: ${messageText}`,
          timestamp: new Date().toLocaleTimeString(),
          createdAt: Date.now(),
          sentiment: item.sentiment || "bullish",
          profileId: activeId || undefined,
        } as any);
        if (results.length > 500) results = results.slice(-500);
        writeJsonFile(st.RESULTS_FILE, results);
        
        st.currentPostingIndex++;
        saveBotProgress({ next_index: st.currentPostingIndex, daily_post_count: dailyPostCount, last_post_date: todayStr });
        
        // Deep cooling period to allow CMC rate limit window to completely expire
        await interruptibleSleep(180000);
        continue;
      } else {
        // Captcha, expired or failed
        consecutiveFailures++;
        runFailed++;
        logWithPrefix("warning", `WARNING: Post failed for ${item.symbol} with status '${outcome}' (${consecutiveFailures}/3 consecutive failures).`);
        
        results.push({
          name: item.name,
          symbol: item.symbol,
          url: item.url,
          status: outcome,
          message: messageText,
          timestamp: new Date().toLocaleTimeString(),
          createdAt: Date.now(),
          sentiment: item.sentiment || "bullish",
          profileId: activeId || undefined,
        } as any);
        if (results.length > 500) results = results.slice(-500);
        writeJsonFile(st.RESULTS_FILE, results);
        
        st.currentPostingIndex++;
        saveBotProgress({ next_index: st.currentPostingIndex, daily_post_count: dailyPostCount, last_post_date: todayStr });

        if (outcome === "expired" || outcome === "captcha") {
          stopReason = outcome === "expired" ? "skipped_expired" : "stopped_captcha";
          logWithPrefix("error", `CRITICAL: Automated posting halted immediately because account session is ${outcome.toUpperCase()} (${messageText}). Stopping run to protect account.`);
          if (!isSchedulerCall) {
            sendTelegramAlert(
              "CRITICAL: Posting Halted - Session Out",
              `⚠️ Active account session encountered ${outcome.toUpperCase()} (${messageText}). Automated posting has stopped.\n\n👉 ACTION REQUIRED: Please log in again in the Profiles tab to restore posting.`,
              "error",
              "single_session_out"
            ).catch(() => {});
          }
          st.isPostingRunning = false;
          if (!isSchedulerCall) st.isSinglePostingRunning = false;
          st.botStatus = "Idle";
          if (st.isContinuousLoopActive && disableLoopOnFailures && !isSchedulerCall) {
            cancelNextAutomationCycle();
            logWithPrefix("error", `[AUTOMATION] Continuous automation loop disabled due to ${outcome} session state. Re-authenticate account to resume.`);
          }
          break;
        }

        if (consecutiveFailures >= 3) {
          stopReason = "failed";
          logWithPrefix("error", "CRITICAL: Automated posting paused due to 3 consecutive failures. Please verify your CoinMarketCap login session and cookies.");
          if (!isSchedulerCall) {
            sendTelegramAlert(
              "CRITICAL: Continuous Posting Paused (3 Failures)",
              "Automated posting paused after 3 consecutive failures. Likely invalid cookies or CoinMarketCap temporary block.\n\n👉 ACTION REQUIRED: Verify session and cookies in the Profiles tab.",
              "warning",
              "single_consecutive_failures"
            ).catch(() => {});
          } else {
            sendTelegramAlert(
              `CRITICAL: Scheduler Turn Paused (3 Failures) - ${activeId || "Account"}`,
              `Automated posting paused for profile [${activeId || "Account"}] after 3 consecutive failures. Moving to next account in scheduler queue.\n\n👉 ACTION REQUIRED: Verify session and cookies for this profile.`,
              "warning",
              `scheduler_consecutive_failures_${activeId}`
            ).catch(() => {});
          }
          st.isPostingRunning = false;
          if (!isSchedulerCall) st.isSinglePostingRunning = false;
          st.botStatus = "Idle";
          if (st.isContinuousLoopActive && disableLoopOnFailures && !isSchedulerCall) {
            cancelNextAutomationCycle();
            logWithPrefix("error", "[AUTOMATION] Continuous automation loop disabled due to 3 consecutive authentication failures.");
          }
          break;
        }
        logWithPrefix("info", "Skipping to next coin to maintain end-to-end automation run...");
      }

      if (!st.isPostingRunning || isHaltRequested()) {
        stopReason = "stopped_by_user";
        break;
      }

      // Interval spacing between posts:
      // Configurable via POST_COOLDOWN_SECONDS env variable, or defaults:
      // Production Default: 35-45 seconds (safe human pacing, protects account from WAF rate limits & spam bans)
      // Development Default: 4-7 seconds (fast for developer testing & verification)
      const isProd = process.env.NODE_ENV === "production";
      const customCooldownSec = Number(process.env.POST_COOLDOWN_SECONDS);
      let spacing: number;
      let cadenceLabel = "";

      if (!isNaN(customCooldownSec) && customCooldownSec >= 5) {
        // Natural human jitter (±15%) so intervals look organic to anti-bot WAFs
        const jitter = (Math.random() * 0.3 - 0.15) * customCooldownSec;
        spacing = Math.max(5000, Math.round((customCooldownSec + jitter) * 1000));
        cadenceLabel = `Custom Pacing: ${customCooldownSec}s`;
      } else {
        spacing = isProd ? (35000 + Math.random() * 10000) : (4000 + Math.random() * 3000);
        cadenceLabel = isProd ? "Safe Production Cadence: 35-45s" : "Development Mode Testing";
      }

      logWithPrefix("info", `Cooling down for ${(spacing / 1000).toFixed(1)}s (${cadenceLabel}, 0% CPU kernel sleep)...`);
      await interruptibleSleep(spacing);
    }

    if (isHaltRequested()) {
      stopReason = "stopped_by_user";
      logWithPrefix("warning", "Posting loop paused: stop command was received.");
    } else if (st.currentPostingIndex >= messages.length || runPosted + runFailed >= initialPendingCount) {
      stopReason = "completed";
      if (runFailed > 0) {
        logWithPrefix("warning", `Automated posting run finished with partial failures: ${runPosted} verified posted on CoinMarketCap, ${runFailed} failed/unposted.`);
      } else {
        logWithPrefix("success", `CONGRATULATIONS: Complete automated posting run finished successfully! (Verified Posted: ${runPosted}, Failed: 0)`);
      }
      st.botStatus = "Completed";
      st.isPostingRunning = false;
      if (!isSchedulerCall) st.isSinglePostingRunning = false;

      // Auto-prune old data and clean completed batch pointers ONLY when all items succeeded (runFailed === 0)
      try {
        const botSettings = getLocalBotSettings();
        if (botSettings.autoPruneCompletedBatches !== false && runFailed === 0) {
          saveBotProgress({ next_index: 0 });
          st.currentPostingIndex = 0;
          logWithPrefix("info", `[BATCH COMPLETED] All assigned comments verified posted in this cycle. Ephemeral queue pointer reset to 0.`);
        }
        if (botSettings.autoPruneOldDataEnabled !== false && runFailed === 0) {
          pruneOldAndCompletedData(getActiveProfileId());
        }
      } catch (cleanErr) {
        console.error("[BATCH COMPLETED] Cleanup error:", cleanErr);
      }

      if (st.isContinuousLoopActive && scheduleNextCycle && !isSchedulerCall) {
        logWithPrefix("info", `[AUTOMATION] Continuous automation mode is enabled. Triggering ${st.continuousLoopIntervalMinutes}-minute gap interval...`);
        scheduleNextAutomationCycle();
      }
    } else if (stopReason === "stopped_daily_limit" || stopReason === "stopped_captcha" || stopReason === "skipped_expired" || stopReason === "failed") {
      st.botStatus = "Idle";
      st.isPostingRunning = false;
      if (!isSchedulerCall) st.isSinglePostingRunning = false;
    } else if (!st.isPostingRunning) {
      logWithPrefix("info", `Posting run settled. (Posted: ${runPosted}, Failed: ${runFailed})`);
      st.botStatus = "Idle";
    }
  } catch (loopErr) {
    stopReason = "failed";
    logWithPrefix("error", `Critical error in automated posting loop: ${(loopErr as Error).message}`);
  } finally {
    st.activeProfileRunLocks.delete(runProfileKey);
    if (sharedBrowser) {
      logWithPrefix("info", "Closing shared Playwright browser instance...");
      await sharedBrowser.close().catch(() => {});
      sharedBrowser = null;
    }
    st.activePostingBrowser = null;
    st.activePostingPage = null;
    if (!isSchedulerCall) {
      st.isSinglePostingRunning = false;
      st.isSingleStopping = false;
      releaseProcessLock("single_posting");
      releaseProcessLock("continuous_loop");
    }
    st.isPostingRunning = st.isSchedulerCycleRunning;
    st.isStopping = false;
    if (st.botStatus !== "Completed") {
      st.botStatus = "Idle";
    }
    st.currentCoinName = "N/A";
    logWithPrefix("info", "Posting engine has fully halted and settled.");
  }

  return { posted: runPosted, failed: runFailed, stopReason };
}

// 9. Stop posting loop
app.post("/api/stop-posting", async (req, res) => {
  const wasRunning =
    st.isPostingRunning ||
    st.isSinglePostingRunning ||
    st.isSchedulerCycleRunning ||
    st.isGeneratingRunning ||
    st.botStatus === "Posting" ||
    st.botStatus === "Generating" ||
    st.botStatus === "Stopping";

  st.isStopping = false;
  st.isSingleStopping = false;
  st.isPostingRunning = false;
  st.isSinglePostingRunning = false;
  st.isGeneratingRunning = false;
  st.isFullFlowAborted = true;
  st.isContinuousLoopActive = false;
  cancelNextAutomationCycle();
  cancelNextSchedulerCycle();
  st.stopSchedulerRequested = true;

  const currentBotSettings = getLocalBotSettings();
  if (currentBotSettings.schedulerEnabled) {
    saveLocalBotSettings({ ...currentBotSettings, schedulerEnabled: false });
    addLog("warning", "[SCHEDULER] 24-hour continuous scheduler halted and disabled by stop command.");
  }

  if (st.isSchedulerCycleRunning) {
    addLog("warning", "[SCHEDULER] Stop requested during scheduled multi-account cycle. Halting current account cleanly and skipping remaining queue.");
  }

  // Abort any active Playwright browser/page immediately to prevent lingering
  if (st.activePostingPage) {
    try {
      await st.activePostingPage.close().catch(() => {});
    } catch (_) {}
    st.activePostingPage = null;
  }
  if (st.activePostingBrowser) {
    try {
      addLog("info", "Closing active browser instance immediately to halt posting action...");
      await st.activePostingBrowser.close().catch(() => {});
    } catch (_) {}
    st.activePostingBrowser = null;
  }

  releaseProcessLock("all" as any);
  st.botStatus = "Idle";
  st.currentCoinName = "N/A";

  if (wasRunning) {
    addLog("info", "Automated posting engine halted cleanly. All background tasks and locks released.");
  } else {
    addLog("info", "Posting engine is already idle. State settled.");
  }

  res.json({ success: true, message: "Posting sequence stopped cleanly. Engine settled." });
});

// 10. Full flow execution
app.post("/api/full-flow", async (req, res) => {
  if (st.isPostingRunning || st.isSinglePostingRunning || st.isSchedulerCycleRunning || st.isGeneratingRunning) {
    return res.status(409).json({ error: "Another automated process is currently running. Please wait for it to finish or stop it first." });
  }
  if (isBusy() || st.isPostingRunning || st.isSinglePostingRunning || st.isSchedulerCycleRunning) {
    return res.status(409).json({ error: "Another automated process is currently running. Please wait for it to finish or stop it first." });
  }
  const lock = acquireProcessLock("continuous_loop", "Full bot flow cycle");
  if (!lock.success) {
    return res.status(409).json({ error: lock.reason });
  }

  const activeId = getActiveProfileId();
  const rawProfiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
  const activeProfile = rawProfiles.find(p => p.id === activeId);
  const sessionExists = fs.existsSync(st.AUTH_STATE_FILE);
  const hasValidAuth = sessionExists && activeProfile?.stateJson && sessionHasValidCookies(activeProfile.stateJson);

  if (!activeId || !hasValidAuth) {
    releaseProcessLock("continuous_loop");
    addLog("error", "Cannot start full cycle: No active account with valid authentication session. Please log in or import cookies in Profiles first.");
    return res.status(400).json({ error: "Cannot start full cycle without an active, authenticated account session. Please log in or import cookies in Profiles first." });
  }

  addLog("info", "========================================");
  addLog("info", "Starting Full Bot Flow End-to-End Sequence...");
  addLog("info", "========================================");

  try {
    const prevMessages = readJsonFile<GeneratedMessage[]>(st.GENERATED_MESSAGES_FILE, []);
    const prevProgress = readBotProgress();

    const reqContinuous = req.body.continuous !== undefined ? !!req.body.continuous : true;
    st.isContinuousLoopActive = reqContinuous;
    const reqInterval = req.body.intervalMinutes !== undefined ? Math.max(5, Math.round(Number(req.body.intervalMinutes))) : st.continuousLoopIntervalMinutes;
    if (reqInterval > 0) {
      st.continuousLoopIntervalMinutes = Math.max(5, reqInterval);
    }
    if (st.isContinuousLoopActive) {
      addLog("info", `[AUTOMATION] Continuous Loop Mode has been ENABLED for this execution sequence (${st.continuousLoopIntervalMinutes}-minute gap).`);
    }

    if (prevMessages.length > 0 && prevProgress.next_index < prevMessages.length) {
      addLog("info", `[FLOW RESUME] A posting run is already in progress (${prevProgress.next_index}/${prevMessages.length} posted). Skipping storage reset.`);
      addLog("info", `[FLOW RESUME] Resuming the posting sequence from index ${prevProgress.next_index}...`);
      
      if (!st.isPostingRunning) {
        st.isStopping = false;
        st.isSingleStopping = false;
        st.isPostingRunning = true;
        st.botStatus = "Posting";
        st.currentPostingIndex = prevProgress.next_index;
        runPostingLoop();
      }

      return res.json({
        success: true,
        message: `End-to-End sequence resumed successfully from index ${prevProgress.next_index}. Monitoring logs...`,
      });
    }

    addLog("info", "[FLOW FRESH] All previous coins posted or no previous run. Starting clean full cycle...");
    writeJsonFile(st.RESULTS_FILE, []);
    saveBotProgress({ next_index: 0 });

    st.isFullFlowAborted = false;

    // Step 1: Fetch
    addLog("info", "[FLOW STEP 1/3] Fetching latest trending coins...");
    st.botStatus = "Fetching";
    await executeFetchTrending();

    if (st.isFullFlowAborted) {
      addLog("warning", "Full automated sequence aborted by user during Fetching phase.");
      st.botStatus = "Idle";
      return res.json({ success: false, message: "Sequence aborted by user." });
    }

    // Step 2: Generate
    addLog("info", "[FLOW STEP 2/3] Generating custom community comments...");
    st.botStatus = "Generating";
    st.isGeneratingRunning = true;
    try {
      await executeGenerateMessages();
    } finally {
      st.isGeneratingRunning = false;
    }

    if (st.isFullFlowAborted) {
      addLog("warning", "Full automated sequence aborted by user during Generation phase.");
      st.botStatus = "Idle";
      releaseProcessLock("continuous_loop");
      return res.json({ success: false, message: "Sequence aborted by user." });
    }

    // Step 3: Post
    addLog("info", "[FLOW STEP 3/3] Launching automated comment submitter...");
    st.isStopping = false;
    st.isSingleStopping = false;
    st.isPostingRunning = true;
    st.botStatus = "Posting";
    st.currentPostingIndex = 0;
    runPostingLoop();

    res.json({
      success: true,
      message: "End-to-End sequence started successfully. Monitoring logs...",
    });
  } catch (error) {
    releaseProcessLock("continuous_loop");
    addLog("error", `Full Flow failed: ${(error as Error).message}`);
    st.botStatus = "Idle";
    st.isPostingRunning = false;
    st.isGeneratingRunning = false;
    if (st.isContinuousLoopActive) {
      scheduleNextAutomationCycle();
    }
    res.status(500).json({ error: (error as Error).message });
  }
});

// 11. Clear Logs & Stats
app.post("/api/clear-all", async (req, res) => {
  const forceReset = Boolean(req.body?.force);
  const processRunning =
    st.isPostingRunning ||
    st.isSinglePostingRunning ||
    st.isSchedulerCycleRunning ||
    st.isGeneratingRunning ||
    st.isContinuousLoopActive ||
    (isBusy() && st.activeSystemProcess !== "none");

  if (processRunning && !forceReset) {
    return res.status(409).json({
      error: "Cannot reset storage while an active bot process is running. Please stop the active process first.",
    });
  }

  cancelNextAutomationCycle();
  st.isContinuousLoopActive = false;
  st.isPostingRunning = false;
  st.isSinglePostingRunning = false;
  st.isGeneratingRunning = false;
  st.isStopping = false;
  st.isSingleStopping = false;
  st.botStatus = "Idle";
  releaseProcessLock("all" as any);

  const lock = acquireProcessLock("clearing_storage", "Resetting storage and clearing stats");
  if (!lock.success) {
    return res.status(409).json({ error: lock.reason });
  }
  try {
    updateActiveProfilePaths();
    st.logs = [];
    const activeId = getActiveProfileId();

    // Safely archive any current results into the 7-day retention archive before clearing active display
    try {
      const activeResults = getIsolatedResults(activeId);
      if (activeResults.length > 0) {
        const arcFile = activeId ? path.join(st.OUTPUT_DIR, activeId, "archived_results.json") : path.join(st.OUTPUT_DIR, "archived_results.json");
        const existingArchive = readJsonFile<PostResult[]>(arcFile, []);
        const mergedArchive = [...existingArchive, ...activeResults];
        writeJsonFile(arcFile, mergedArchive.slice(-3000));
        addLog("info", `[RETENTION ARCHIVE] Safely preserved ${activeResults.length} post records in 7-day archive.`);
      }
    } catch (_) {}

    writeJsonFile(st.LAST_TRENDING_FILE, []);
    writeJsonFile(st.GENERATED_MESSAGES_FILE, []);
    writeJsonFile(st.RESULTS_FILE, []);
    
    // Preserve daily limit count unless explicitly requested
    saveBotProgress({ next_index: 0 });
    clearRealTimestamps();
    st.currentPostingIndex = 0;
    st.currentCoinName = "N/A";
    st.botStatus = "Idle";
    st.isStopping = false;
    st.isSingleStopping = false;

    // Dynamic Cloud Firestore synchronization for active profile
    try {
      await saveTrendingCoinsCloud([], activeId || undefined);
      await saveGeneratedMessagesCloud([], activeId || undefined);
      await savePostResultsCloud([], activeId || undefined);
      await saveBotProgressCloud(readBotProgress(), activeId || undefined);
    } catch (err) {
      console.error("[FIREBASE] Error syncing cleared state to cloud for active profile:", (err as Error).message);
    }

    addLog("success", "Console cleared. Reset active trending data and queue for active account. (All prior submissions safely retained in 7-day archive; profiles and logins untouched).");
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  } finally {
    releaseProcessLock("clearing_storage");
  }
});

// 11b. Safe Reset Today's Queue & Submissions (Safely archives submissions to 7-day retention; preserves logins, cookies, and profiles)
app.post("/api/queue/reset-daily", async (req, res) => {
  if (
    st.isPostingRunning ||
    st.isSinglePostingRunning ||
    st.isSchedulerCycleRunning ||
    st.isGeneratingRunning ||
    st.isContinuousLoopActive ||
    (isBusy() && st.activeSystemProcess !== "none")
  ) {
    return res.status(409).json({
      success: false,
      error: "Cannot reset or archive the queue while a bot process is running. Please stop the active process first.",
    });
  }
  try {
    const activeId = getActiveProfileId();
    const { resetDailyCap } = req.body || {};

    // 1. Safely archive all current post results into 7-day retention archive before clearing
    try {
      const currentResults = getIsolatedResults(activeId);
      if (currentResults.length > 0) {
        const arcFile = activeId ? path.join(st.OUTPUT_DIR, activeId, "archived_results.json") : path.join(st.OUTPUT_DIR, "archived_results.json");
        const existingArchive = readJsonFile<PostResult[]>(arcFile, []);
        const mergedArchive = [...existingArchive, ...currentResults];
        writeJsonFile(arcFile, mergedArchive.slice(-3000));
        addLog("info", `[RETENTION] Archived ${currentResults.length} submission records to 7-day historical database.`);
      }
    } catch (arcErr) {
      console.warn("Could not archive existing results prior to reset:", (arcErr as Error).message);
    }

    writeJsonFile(st.RESULTS_FILE, []);
    
    // 2. Reset queue pointer back to 0; only reset daily post count if explicitly requested
    const progressUpdate: Partial<BotProgressData> = { next_index: 0 };
    if (resetDailyCap === true) {
      progressUpdate.daily_post_count = 0;
    }
    saveBotProgress(progressUpdate);
    st.currentPostingIndex = 0;
    st.currentCoinName = "N/A";
    
    if (activeId) {
      await savePostResultsCloud([], activeId).catch(() => {});
      await saveBotProgressCloud(readBotProgress(), activeId).catch(() => {});
    }
    
    addLog("success", `[QUEUE] Reset queue pointer back to Coin #1. Prior submissions safely preserved in 7-day archive. Logins, cookies, and accounts 100% intact.`);
    res.json({ success: true, message: "Queue safely reset to Coin #1. Previous submissions archived in 7-day storage." });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// 11b.2. Data Retention & Completed Batch Auto-Pruning
app.post("/api/data/prune", async (req, res) => {
  try {
    const profileId = (req.body.profileId as string)?.trim() || null;
    const result = pruneOldAndCompletedData(profileId);
    res.json({
      success: true,
      prunedCount: result.prunedCount,
      remainingCount: result.remainingCount,
      archivedCount: result.archivedCount,
      details: result.details,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

app.get("/api/data/retention-stats", (req, res) => {
  try {
    const activeId = getActiveProfileId();
    const settings = getLocalBotSettings();
    const activeResults = getIsolatedResults(activeId);
    
    // Check archive count
    const arcFile = activeId ? path.join(st.OUTPUT_DIR, activeId, "archived_results.json") : path.join(st.OUTPUT_DIR, "archived_results.json");
    const archivedResults = readJsonFile<PostResult[]>(arcFile, []);

    res.json({
      success: true,
      activeCount: activeResults.length,
      archivedCount: archivedResults.length,
      retentionDays: settings.dataRetentionDays || 7,
      autoPruneEnabled: settings.autoPruneOldDataEnabled !== false,
      maxKeep: settings.maxResultsHistoryCount || 300,
      autoPruneCompletedBatches: settings.autoPruneCompletedBatches !== false,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

app.post("/api/settings/data-retention", (req, res) => {
  try {
    const { autoPruneOldDataEnabled, dataRetentionDays, maxResultsHistoryCount, autoPruneCompletedBatches } = req.body;
    const settings = getLocalBotSettings();

    if (typeof autoPruneOldDataEnabled === "boolean") {
      settings.autoPruneOldDataEnabled = autoPruneOldDataEnabled;
    }
    if (typeof dataRetentionDays === "number" && dataRetentionDays > 0) {
      settings.dataRetentionDays = Math.min(30, Math.max(1, dataRetentionDays));
    }
    if (typeof maxResultsHistoryCount === "number" && maxResultsHistoryCount > 0) {
      settings.maxResultsHistoryCount = Math.min(2000, Math.max(50, maxResultsHistoryCount));
    }
    if (typeof autoPruneCompletedBatches === "boolean") {
      settings.autoPruneCompletedBatches = autoPruneCompletedBatches;
    }

    saveLocalBotSettings(settings);
    addLog("info", `[SETTINGS] Data retention policy updated: ${settings.dataRetentionDays} days retention, max ${settings.maxResultsHistoryCount} records, autoPruneCompletedBatches: ${settings.autoPruneCompletedBatches}.`);
    
    // Run an immediate prune with new settings
    pruneOldAndCompletedData();

    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

app.get("/api/download/archived_submissions.csv", (req, res) => {
  try {
    updateActiveProfilePaths();
    const activeId = getActiveProfileId();
    const arcFile = activeId ? path.join(st.OUTPUT_DIR, activeId, "archived_results.json") : path.join(st.OUTPUT_DIR, "archived_results.json");
    const archived = readJsonFile<PostResult[]>(arcFile, []);

    let csv = "Timestamp,Asset Name,Symbol,Sentiment,Post Status,Log Message,Target URL\n";
    archived.forEach(r => {
      csv += `${escapeCsvField(r.timestamp || "N/A")},${escapeCsvField(r.name)},${escapeCsvField(r.symbol)},${escapeCsvField(r.sentiment || "bullish")},${escapeCsvField(r.status)},${escapeCsvField(r.message || "")},${escapeCsvField(r.url)}\n`;
    });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=archived_submissions.csv");
    res.send(csv);
  } catch (err) {
    res.status(500).send((err as Error).message);
  }
});

// ==========================================
// 11b.3. Company Admin Authentication & Sharing Gate
// ==========================================
function generateAdminToken(): string {
  const token = "admin_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) + "_" + Date.now();
  st.activeAdminSessions.add(token);
  return token;
}

function verifyAdminRequest(req: express.Request): boolean {
  const settings = getLocalBotSettings();
  if (settings.adminAuthEnabled === false) return true; // Disabled by admin

  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const tokenFromQuery = (req.query.token || req.query.access_token || req.query.key || req.query.pass) as string;
  const customHeader = req.headers["x-admin-token"] as string;
  const token = tokenFromHeader || customHeader || tokenFromQuery;

  if (!token) return false;

  const currentPassword = settings.adminPassword || process.env.ADMIN_PASSWORD || "admin123";
  if (token === currentPassword) {
    return true;
  }

  return st.activeAdminSessions.has(token);
}

app.post("/api/auth/login", (req, res) => {
  try {
    const { password } = req.body;
    const settings = getLocalBotSettings();
    const currentPassword = settings.adminPassword || process.env.ADMIN_PASSWORD || "admin123";

    if (!password || typeof password !== "string") {
      return res.status(400).json({ success: false, error: "Password is required" });
    }

    if (password.trim() === currentPassword.trim()) {
      const token = generateAdminToken();
      addLog("info", "[SECURITY] Company admin logged in successfully.");
      return res.json({
        success: true,
        token,
        role: "admin",
        message: "Company admin authentication successful."
      });
    } else {
      addLog("warning", "[SECURITY] Failed company admin login attempt.");
      return res.status(401).json({ success: false, error: "Incorrect admin password. Please try again or use the 1-click team link." });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

app.get("/api/auth/status", (req, res) => {
  try {
    const settings = getLocalBotSettings();
    const authRequired = settings.adminAuthEnabled !== false;
    const currentPassword = settings.adminPassword || process.env.ADMIN_PASSWORD || "admin123";
    const authenticated = !authRequired || verifyAdminRequest(req);
    const schedulerState = {
      enabled: !!settings.schedulerEnabled,
      cycleRunning: st.isSchedulerCycleRunning,
      postingRunning: st.isPostingRunning || st.isSinglePostingRunning,
      botStatus: st.botStatus,
      nextCycleAt: st.nextSchedulerCycleStartTime ? new Date(st.nextSchedulerCycleStartTime).toISOString() : null,
      isContinuousLoopActive: st.isContinuousLoopActive,
    };

    res.json({
      success: true,
      authRequired,
      authenticated,
      currentPassword: authenticated ? currentPassword : (authRequired ? undefined : currentPassword),
      scheduler: schedulerState,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});


app.post("/api/auth/update-password", (req, res) => {
  try {
    if (!verifyAdminRequest(req)) {
      return res.status(401).json({ success: false, error: "Unauthorized. Admin session required." });
    }
    const { newPassword } = req.body;
    if (!newPassword || typeof newPassword !== "string" || newPassword.trim().length < 3) {
      return res.status(400).json({ success: false, error: "New password must be at least 3 characters." });
    }
    const settings = getLocalBotSettings();
    settings.adminPassword = newPassword.trim();
    saveLocalBotSettings(settings);
    addLog("success", `[SECURITY] Company admin password updated successfully.`);
    const newToken = generateAdminToken();
    res.json({ success: true, message: "Admin password updated successfully.", token: newToken, newPassword: settings.adminPassword });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

app.post("/api/auth/toggle-auth", (req, res) => {
  try {
    if (!verifyAdminRequest(req)) {
      return res.status(401).json({ success: false, error: "Unauthorized. Admin session required." });
    }
    const { enabled } = req.body;
    const settings = getLocalBotSettings();
    settings.adminAuthEnabled = typeof enabled === "boolean" ? enabled : true;
    saveLocalBotSettings(settings);
    addLog("info", `[SECURITY] Company admin password requirement set to: ${settings.adminAuthEnabled}`);
    res.json({ success: true, authRequired: settings.adminAuthEnabled });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// 11c. Fleet Health Check: Probe & Verify All Account Sessions at Once
app.post("/api/profiles/verify-all", async (req, res) => {
  try {
    const rawProfiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
    const profiles = normalizeProfilesWithSchedule(rawProfiles);
    const results: any[] = [];
    let healthyCount = 0;
    let expiredCount = 0;

    for (const p of profiles) {
      let status: "valid" | "expired" | "missing_cookies" = "missing_cookies";
      let message = "No cookie state JSON found.";

      if (p.stateJson && p.stateJson.trim()) {
        try {
          const parsed = JSON.parse(p.stateJson);
          const cookies = Array.isArray(parsed) ? parsed : (parsed.cookies || []);
          if (!Array.isArray(cookies) || cookies.length === 0) {
            status = "missing_cookies";
            message = "State JSON contains no cookies array.";
          } else {
            const authCookie = cookies.find((c: any) =>
              (c.name === "Authorization" && typeof c.value === "string" && c.value.length > 20) ||
              (c.name === "u-prod" && typeof c.value === "string" && c.value.length > 20) ||
              (c.name === "cmc_user_session" && typeof c.value === "string" && c.value.length > 10)
            );
            if (!authCookie) {
              status = "missing_cookies";
              message = "Missing CoinMarketCap authentication tokens (Authorization, u-prod, or cmc_user_session).";
            } else if (authCookie.expires && authCookie.expires > 0 && authCookie.expires < Date.now() / 1000) {
              status = "expired";
              message = `Authentication cookie expired on ${new Date(authCookie.expires * 1000).toLocaleDateString()}.`;
            } else {
              const cookieHeader = cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");
              try {
                const probeRes = await fetch("https://api.coinmarketcap.com/data-api/v3/user/profile", {
                  headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                    "Cookie": cookieHeader,
                    "Accept": "application/json",
                  },
                  signal: AbortSignal.timeout(4000),
                });
                if (probeRes.status === 200) {
                  status = "valid";
                  message = "Live session active & authenticated.";
                } else if (probeRes.status === 401 || probeRes.status === 403) {
                  status = "expired";
                  message = "CoinMarketCap API rejected session (HTTP 401/403). Cookie expired or invalidated.";
                } else {
                  status = "valid";
                  message = "Cookie tokens present with valid future timestamps.";
                }
              } catch (_) {
                status = "valid";
                message = "Cookie tokens present and structurally valid.";
              }
            }
          }
        } catch (jsonErr) {
          status = "missing_cookies";
          message = "Corrupted or non-JSON state data.";
        }
      }

      if (status === "valid") healthyCount++;
      else expiredCount++;

      updateProfileLastRun(p.id, {
        at: new Date().toISOString(),
        status: status === "valid" ? "completed" : "skipped_expired",
        posted: p.lastRun?.posted || 0,
        failed: p.lastRun?.failed || 0,
      });

      results.push({
        id: p.id,
        name: p.name,
        status,
        message,
        order: p.schedule?.order || 1,
        frequency: p.schedule?.frequency || "every_cycle",
      });
    }

    addLog(
      healthyCount > 0 ? "info" : "warning",
      `[FLEET CHECK] Account verification complete: ${healthyCount}/${profiles.length} healthy, ${expiredCount} need attention.`
    );

    res.json({
      success: true,
      totalAccounts: profiles.length,
      healthyCount,
      expiredCount,
      accounts: results,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// 11d. Target Coins Selector Setting
app.post("/api/settings/target-coins", (req, res) => {
  if (isSchedulerRunning()) {
    return res.status(409).json({ error: "Pause or stop the scheduler to change settings" });
  }
  try {
    const { targetCoinsCount } = req.body;
    const count = typeof targetCoinsCount === "number" ? targetCoinsCount : 0;
    const settings = getLocalBotSettings();
    settings.targetCoinsCount = count;
    saveLocalBotSettings(settings);
    addLog("info", `[SETTINGS] Target coins per cycle updated to ${count === 0 ? "All Available" : `Top ${count}`}.`);
    res.json({ success: true, targetCoinsCount: count });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// 12. Get current st.logs stream with per-profile isolation
app.get("/api/logs", (req, res) => {
  const queryProfileId = req.query.profileId as string | undefined;
  const activeId = queryProfileId || getActiveProfileId();
  if (activeId) {
    const profileLogs = st.logs.filter(l => !l.profileId || l.profileId === activeId);
    return res.json({ logs: profileLogs.slice(-100) });
  }
  res.json({ logs: st.logs.slice(-100) });
});

// ============================================================================
// CSV DOWNLOAD EXPORTERS (Item 11: RFC 4180 Escaping)
// ============================================================================
function escapeCsvField(val: any): string {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  // Neutralize CSV Formula Injection (=, +, -, @, \t, \r)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

app.get("/api/download/trending_coins.csv", (req, res) => {
  updateActiveProfilePaths();
  const activeId = getActiveProfileId();
  const sessionExists = fs.existsSync(st.AUTH_STATE_FILE);
  const coins = (!activeId || !sessionExists) ? [] : readJsonFile<Coin[]>(st.LAST_TRENDING_FILE, []);
  let csv = "Name,Symbol,Price,Change_1h,Change_24h,Change_7d,Market_Cap,Volume_24h,Rank,Slug,Url\n";
  coins.forEach(c => {
    csv += `${escapeCsvField(c.name)},${escapeCsvField(c.symbol)},${escapeCsvField(c.price)},${escapeCsvField(c.change_1h || 0)},${escapeCsvField(c.change_24h)},${escapeCsvField(c.change_7d || 0)},${escapeCsvField(c.market_cap)},${escapeCsvField(c.volume_24h)},${escapeCsvField(c.cmc_rank || "")},${escapeCsvField(c.slug)},${escapeCsvField(c.url)}\n`;
  });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=trending_coins.csv");
  res.send(csv);
});

app.get("/api/download/generated_comments.csv", (req, res) => {
  updateActiveProfilePaths();
  const activeId = getActiveProfileId();
  const sessionExists = fs.existsSync(st.AUTH_STATE_FILE);
  const messages = (!activeId || !sessionExists) ? [] : readJsonFile<GeneratedMessage[]>(st.GENERATED_MESSAGES_FILE, []);
  let csv = "Asset Name,Symbol,Sentiment,Generated Comment,Target URL\n";
  messages.forEach(m => {
    csv += `${escapeCsvField(m.name)},${escapeCsvField(m.symbol)},${escapeCsvField(m.sentiment || "bullish")},${escapeCsvField(m.message || "")},${escapeCsvField(m.url)}\n`;
  });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=generated_comments.csv");
  res.send(csv);
});

app.get("/api/download/post_submissions.csv", (req, res) => {
  updateActiveProfilePaths();
  const activeId = getActiveProfileId();
  const sessionExists = fs.existsSync(st.AUTH_STATE_FILE);
  const results = (!activeId || !sessionExists) ? [] : getIsolatedResults(activeId);
  let csv = "Timestamp,Asset Name,Symbol,Sentiment,Post Status,Log Message,Target URL\n";
  results.forEach(r => {
    csv += `${escapeCsvField(r.timestamp || "N/A")},${escapeCsvField(r.name)},${escapeCsvField(r.symbol)},${escapeCsvField(r.sentiment || "bullish")},${escapeCsvField(r.status)},${escapeCsvField(r.message || "")},${escapeCsvField(r.url)}\n`;
  });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=post_submissions.csv");
  res.send(csv);
});

app.get("/api/download/overall_report.csv", (req, res) => {
  updateActiveProfilePaths();
  const activeId = getActiveProfileId();
  const sessionExists = fs.existsSync(st.AUTH_STATE_FILE);
  const coins = (!activeId || !sessionExists) ? [] : readJsonFile<Coin[]>(st.LAST_TRENDING_FILE, []);
  const messages = (!activeId || !sessionExists) ? [] : readJsonFile<GeneratedMessage[]>(st.GENERATED_MESSAGES_FILE, []);
  const results = (!activeId || !sessionExists) ? [] : getIsolatedResults(activeId);
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
  csv += `${escapeCsvField("Execution Mode")},${escapeCsvField(st.runMode)},${escapeCsvField("Execution environment configuration")}\n`;
  csv += `${escapeCsvField("Report Generated At")},${escapeCsvField(new Date().toLocaleString())},${escapeCsvField("Timestamp of export")}\n`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=overall_report.csv");
  res.send(csv);
});

// ============================================================================
// SEQUENTIAL MULTI-ACCOUNT SCHEDULER ENGINE (PARTS 2 & 3)
// ============================================================================

function updateProfileLastRun(
  profileId: string,
  lastRunData: { at: string; status: LastRunStatus; posted: number; failed: number }
): void {
  try {
    let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
    profiles = normalizeProfilesWithSchedule(profiles);
    const targetIdx = profiles.findIndex(p => p.id === profileId);
    if (targetIdx !== -1) {
      profiles[targetIdx].lastRun = lastRunData;
      profiles[targetIdx].updatedAt = new Date().toISOString();
      fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
      saveProfilesCloud(profiles).catch(err => console.error("[STORAGE] Error syncing lastRun to cloud:", err));
    }
  } catch (err) {
    console.error("[SCHEDULER] Error saving profile lastRun:", err);
  }
}

function updateProfileSchedule(
  profileId: string,
  schedulePatch: { enabled?: boolean; frequency?: ScheduleFrequency; customHours?: number; order?: number; useForNow?: boolean }
): any {
  let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
  profiles = normalizeProfilesWithSchedule(profiles);
  const targetIdx = profiles.findIndex(p => p.id === profileId);
  if (targetIdx === -1) {
    throw new Error("Profile not found.");
  }
  const current = profiles[targetIdx].schedule;
  const updatedSchedule: ProfileSchedule = {
    ...current,
    ...(typeof schedulePatch.enabled === "boolean" ? { enabled: schedulePatch.enabled } : {}),
    ...(schedulePatch.frequency ? { frequency: schedulePatch.frequency } : {}),
    ...(typeof schedulePatch.customHours === "number" ? { customHours: schedulePatch.customHours } : {}),
    ...(typeof schedulePatch.order === "number" ? { order: schedulePatch.order } : {}),
    ...(typeof schedulePatch.useForNow === "boolean" ? { useForNow: schedulePatch.useForNow } : {}),
  };
  profiles[targetIdx].schedule = updatedSchedule;
  profiles[targetIdx].updatedAt = new Date().toISOString();
  fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
  saveProfilesCloud(profiles).catch(err => console.error("[STORAGE] Error syncing schedule to cloud:", err));
  return profiles[targetIdx];
}

function cancelNextSchedulerCycle() {
  if (st.schedulerCycleTimeout) {
    clearTimeout(st.schedulerCycleTimeout);
    st.schedulerCycleTimeout = null;
  }
  st.nextSchedulerCycleStartTime = null;
}

function scheduleNextSchedulerCycle(delayMsOverride?: number) {
  cancelNextSchedulerCycle();
  const settings = getLocalBotSettings();
  if (!settings.schedulerEnabled) return;

  const rawProfiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
  const profiles = normalizeProfilesWithSchedule(rawProfiles);
  const hasAnyAuth = profiles.some(p => p.stateJson && sessionHasValidCookies(p.stateJson));
  if (!hasAnyAuth) {
    addLog("warning", "[SCHEDULER] 24-hr multi-account scheduler stopped: No active profiles with valid authentication sessions found. Please log in or import cookies to enable scheduling.");
    saveLocalBotSettings({ ...settings, schedulerEnabled: false });
    return;
  }

  const todayStr = getTodayDateString();
  let dailyCycles = settings.dailyCycleCount || 0;
  if (settings.lastCycleDate !== todayStr) {
    dailyCycles = 0;
    saveLocalBotSettings({ ...settings, dailyCycleCount: 0, lastCycleDate: todayStr });
  }

  const maxCycles = settings.maxCyclesPerDay || 4;
  let gapMs = 0;
  let sessionDesc = "";

  if (delayMsOverride !== undefined) {
    gapMs = delayMsOverride;
    sessionDesc = `Retry postponed by ${Math.round(gapMs / 60000)}m`;
  } else if (dailyCycles >= maxCycles) {
    // All 4 cycles for today completed! Pause until tomorrow's 00:00 UTC session
    const now = new Date();
    const currentUtcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
    const minsToMidnight = (24 * 60) - currentUtcMins;
    gapMs = Math.max(5 * 60 * 1000, minsToMidnight * 60 * 1000 - (now.getUTCSeconds() * 1000));
    sessionDesc = `All ${maxCycles}/${maxCycles} cycles completed for today (${todayStr}). Next cycle scheduled for Tomorrow Asia Open (00:00 UTC)`;
  } else if (settings.schedulerMode === "interval") {
    // 24 Hours / 4 cycles = 360 minutes total time per cycle slot
    const targetIntervalMins = settings.schedulerIntervalMinutes || 360;
    const targetIntervalMs = targetIntervalMins * 60 * 1000;
    
    // Deduct the actual execution duration of the completed cycle
    // e.g. If posting ~85 coins across 3 accounts took 88 minutes, sleep 272 minutes so cycle + rest gap = 360 minutes (6 hours = 4 cycles in 24h)
    if (st.lastSchedulerCycleStartTime) {
      const cycleDurationMs = Math.max(0, Date.now() - st.lastSchedulerCycleStartTime);
      gapMs = Math.max(15 * 60 * 1000, targetIntervalMs - cycleDurationMs);
      const cycleDurationMins = Math.round(cycleDurationMs / 60000);
      const remainingCooldownMins = Math.round(gapMs / 60000);
      sessionDesc = `Next cycle in ${remainingCooldownMins}m (${targetIntervalMins}m slot - ${cycleDurationMins}m execution duration)`;
    } else {
      gapMs = targetIntervalMs;
      sessionDesc = `Every ${targetIntervalMins}m (${Math.round(targetIntervalMins / 60)}h cadence)`;
    }
  } else {
    // Default: "peak_hours" (4 Global Peak Trading Sessions: 00:00, 08:00, 14:00, 20:00 UTC)
    // Wall-clock anchored: automatically calculates the exact remaining time from NOW to the next market open
    const peakInfo = getNextPeakTradingSession(new Date());
    gapMs = peakInfo.delayMs;
    sessionDesc = `${peakInfo.session.label}`;
  }

  st.nextSchedulerCycleStartTime = Date.now() + gapMs;
  addLog(
    "info",
    `[SCHEDULER] Next cycle: ${sessionDesc} (at ${new Date(st.nextSchedulerCycleStartTime).toLocaleTimeString()}). Today's progress: ${dailyCycles}/${maxCycles} cycles.`
  );

  st.schedulerCycleTimeout = setTimeout(async () => {
    st.schedulerCycleTimeout = null;
    st.nextSchedulerCycleStartTime = null;
    const currentSettings = getLocalBotSettings();
    if (!currentSettings.schedulerEnabled) return;

    if (st.isPostingRunning || st.isSinglePostingRunning || st.isContinuousLoopActive || isBusy() || st.activeSystemProcess !== "none") {
      addLog("warning", "[SCHEDULER] Another task is currently active. Postponing scheduled cycle by 2 minutes...");
      scheduleNextSchedulerCycle(2 * 60 * 1000);
      return;
    }

    try {
      await runScheduledCycle();
    } catch (err) {
      addLog("error", `[SCHEDULER] Error during scheduled cycle: ${(err as Error).message}`);
    }
  }, gapMs);
}

async function runScheduledCycle(): Promise<void> {
  if (st.isSchedulerCycleRunning) {
    addLog("warning", "[SCHEDULER] A scheduled multi-account cycle is already running. Skipping overlapping execution.");
    return;
  }
  if ((isBusy() && st.activeSystemProcess !== "none") || st.isSinglePostingRunning || st.isPostingRunning) {
    addLog("warning", "[SCHEDULER] Another process or manual posting is currently active. Postponing scheduled cycle by 2 minutes...");
    scheduleNextSchedulerCycle(2 * 60 * 1000);
    return;
  }
  const lock = acquireProcessLock("scheduler_cycle", "Sequential multi-account cycle");
  if (!lock.success) {
    addLog("warning", `[SCHEDULER] Cannot start scheduled cycle: ${lock.reason}. Postponing by 2 minutes...`);
    scheduleNextSchedulerCycle(2 * 60 * 1000);
    return;
  }

  const settings = getLocalBotSettings();
  if (!settings.schedulerEnabled) {
    releaseProcessLock("scheduler_cycle");
    addLog("info", "[SCHEDULER] Scheduler is disabled in settings. Skipping cycle.");
    return;
  }

  const rawProfiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
  const profiles = normalizeProfilesWithSchedule(rawProfiles);
  const hasAnyAuth = profiles.some(p => p.stateJson && sessionHasValidCookies(p.stateJson));
  if (!hasAnyAuth) {
    addLog("error", "[SCHEDULER] Cannot execute scheduled cycle: No accounts have valid authenticated sessions. Stopping 24-hr scheduler.");
    releaseProcessLock("scheduler_cycle");
    st.isSchedulerCycleRunning = false;
    const currentSettings = getLocalBotSettings();
    saveLocalBotSettings({ ...currentSettings, schedulerEnabled: false });
    cancelNextSchedulerCycle();
    st.botStatus = "Idle";
    return;
  }

  // Preserve user's current active profile so their manual view & work are NEVER displaced!
  const initialActiveProfileId = getActiveProfileId();

  st.isSchedulerCycleRunning = true;
  st.lastSchedulerCycleStartTime = Date.now();
  st.stopSchedulerRequested = false;
  st.pauseSchedulerRequested = false;
  st.isStopping = false;
  st.botStatus = "Fetching";

  try {
    addLog("info", "==================================================");
    addLog("info", "[SCHEDULER] Starting sequential multi-account cycle...");
    addLog("info", "==================================================");

    const initialSettings = getLocalBotSettings();
    const savedPos = initialSettings.schedulerSavedPosition;
    const schedulerCoinsFile = path.join(st.OUTPUT_DIR, "scheduler_cycle_coins.json");
    const schedulerMessagesFile = path.join(st.OUTPUT_DIR, "scheduler_cycle_messages.json");
    const schedulerPartitionsFile = path.join(st.OUTPUT_DIR, "scheduler_cycle_partitions.json");
    let coins: Coin[] = [];
    let messages: GeneratedMessage[] = [];
    let dueAccounts: SchedulableProfile[] = [];
    let standbyPool: SchedulableProfile[] = [];
    let savedPartitions: Record<string, { coins: Coin[]; messages: GeneratedMessage[] }> = {};

    if (savedPos && savedPos.currentAccountId && Array.isArray(savedPos.queue) && savedPos.queue.length > 0) {
      addLog("info", `[SCHEDULER] Resuming cycle from saved position: Account [${savedPos.currentAccountId}] paused at ${savedPos.pausedAt}`);

      // Continue with the full cycle coins, messages, and pre-sliced partitions without re-fetching or generating
      coins = readJsonFile<Coin[]>(schedulerCoinsFile, readJsonFile<Coin[]>(st.LAST_TRENDING_FILE, []));
      messages = readJsonFile<GeneratedMessage[]>(schedulerMessagesFile, readJsonFile<GeneratedMessage[]>(st.GENERATED_MESSAGES_FILE, []));
      savedPartitions = readJsonFile<Record<string, { coins: Coin[]; messages: GeneratedMessage[] }>>(schedulerPartitionsFile, {});
      if (messages.length === 0 && savedPos.currentAccountId) {
        const accDir = path.join(st.OUTPUT_DIR, savedPos.currentAccountId);
        coins = readJsonFile<Coin[]>(path.join(accDir, "last_trending.json"), []);
        messages = readJsonFile<GeneratedMessage[]>(path.join(accDir, "generated_messages.json"), []);
      }

      const allProfiles = normalizeProfilesWithSchedule(readJsonFile<any[]>(st.PROFILES_FILE, []));
      const savedQueue = savedPos.queue;
      const currentAccIndex = savedQueue.indexOf(savedPos.currentAccountId);
      const remainingAccountIds = currentAccIndex !== -1 ? savedQueue.slice(currentAccIndex) : savedQueue;

      dueAccounts = remainingAccountIds
        .map(id => allProfiles.find(p => p.id === id))
        .filter((p): p is SchedulableProfile => Boolean(p));

      st.schedulerQueue = remainingAccountIds;
      addLog("info", `[SCHEDULER] Resuming queue (${dueAccounts.length} accounts): ${dueAccounts.map(a => a.name).join(" -> ")}`);
    } else {
      // 0. Auto-prune old submission records before cycle begins
      try {
        pruneOldAndCompletedData();
      } catch (_) {}

      // 1. Fetch trending coins ONCE (isolated from single-account manual queue)
      try {
        addLog("info", "[SCHEDULER] Fetching trending coins from CoinMarketCap for this cycle...");
        const fetchRes = await executeFetchTrending({ skipSaveToActiveProfile: true });
        coins = fetchRes.coins;
        if (!coins || coins.length === 0) {
          throw new Error("No trending coins returned from fetch endpoint.");
        }
        writeJsonFile(schedulerCoinsFile, coins);
      } catch (fetchErr) {
        addLog("error", `[SCHEDULER] Failed to fetch trending coins: ${(fetchErr as Error).message}. Marking cycle failed.`);
        st.botStatus = "Idle";
        return;
      }

      if (st.stopSchedulerRequested || st.pauseSchedulerRequested) {
        addLog("warning", "[SCHEDULER] Cycle stopped by user after fetching.");
        st.botStatus = "Idle";
        return;
      }

      // 2. Generate comments ONCE for the coin list
      try {
        addLog("info", `[SCHEDULER] Generating comments for ${coins.length} coins once for all accounts...`);
        st.botStatus = "Generating";
        st.isGeneratingRunning = true;
        messages = await generateMessagesForCoins(coins);
        if (!messages || messages.length === 0) {
          throw new Error("No comments were generated.");
        }
        writeJsonFile(schedulerMessagesFile, messages);
      } catch (genErr) {
        addLog("error", `[SCHEDULER] Failed to generate comments: ${(genErr as Error).message}. Marking cycle failed.`);
        st.botStatus = "Idle";
        return;
      } finally {
        st.isGeneratingRunning = false;
      }

      if (st.stopSchedulerRequested || st.pauseSchedulerRequested) {
        addLog("warning", "[SCHEDULER] Cycle stopped by user after comment generation.");
        st.botStatus = "Idle";
        return;
      }

      // 3. Due accounts calculation
      let rawProfiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
      let profiles = normalizeProfilesWithSchedule(rawProfiles);
      const now = new Date();
      dueAccounts = orderDueAccounts(profiles, now);

      // Accounts that are not due get logged with status skipped_not_due (not saved to profile)
      profiles.forEach(p => {
        const { schedule, lastRun } = normalizeProfileSchedule(p);
        if (!schedule.enabled) {
          addLog("info", `[${p.name}] Schedule disabled. Skipped.`);
        } else if (!isDue(schedule, lastRun.at, now)) {
          addLog("info", `[${p.name}] Schedule not due (${schedule.frequency}). Status: skipped_not_due.`);
        }
      });

      st.schedulerQueue = dueAccounts.map(a => a.id);
      addLog("info", `[SCHEDULER] Due queue (${dueAccounts.length} accounts): ${dueAccounts.map(a => a.name).join(" -> ") || "No accounts due"}`);

      if (dueAccounts.length === 0) {
        addLog("info", "[SCHEDULER] No accounts are currently due. Cycle complete.");
        st.botStatus = "Completed";
        return;
      }

      // Balanced partitioning of all fetched coins across due accounts (e.g. ~85-90 coins across 3 accounts => ~28-30 coins each)
      const numAccs = dueAccounts.length;
      const basePerAccount = Math.floor(messages.length / numAccs);
      const remainderCoins = messages.length % numAccs;
      let cursor = 0;
      const partitionSummary: string[] = [];
      for (let i = 0; i < numAccs; i++) {
        const acc = dueAccounts[i];
        const countForAcc = basePerAccount + (i < remainderCoins ? 1 : 0);
        const sliceStart = cursor;
        const sliceEnd = Math.min(messages.length, sliceStart + countForAcc);
        cursor = sliceEnd;
        savedPartitions[acc.id] = {
          coins: coins.slice(sliceStart, sliceEnd),
          messages: messages.slice(sliceStart, sliceEnd),
        };
        partitionSummary.push(`${acc.name}: ${ sliceEnd - sliceStart } coins (#${sliceStart + 1}-${sliceEnd})`);
      }
      writeJsonFile(schedulerPartitionsFile, savedPartitions);
      addLog("info", `[SCHEDULER] Partitioned ${messages.length} coins across ${numAccs} accounts: ${partitionSummary.join(" | ")}`);

      // Standby reserve pool for automatic single-hop failover
      standbyPool = profiles.filter(
        p => !dueAccounts.some(d => d.id === p.id) && p.stateJson && sessionHasValidCookies(p.stateJson)
      );
      if (standbyPool.length > 0) {
        addLog("info", `[SCHEDULER] Standby reserve pool ready: ${standbyPool.map(s => s.name).join(", ")} held in reserve.`);
      }
    }

    const totalDue = dueAccounts.length;
    const perAccountTarget = Math.ceil(messages.length / Math.max(1, totalDue));
    let totalCyclePosted = 0;
    let totalCycleFailed = 0;

    // Helper: Redistribute unposted coins from a failed/partial account evenly across upcoming accounts in the cycle queue
    const redistributeUnpostedToUpcoming = (
      unpostedCoins: Coin[],
      unpostedMessages: GeneratedMessage[],
      failedAccName: string,
      currentIdx: number
    ) => {
      if (unpostedMessages.length === 0) return;
      let upcomingAccounts = dueAccounts.slice(currentIdx + 1);
      // If the last account in the queue failed and a standby backup account is available, append standby to the queue
      if (upcomingAccounts.length === 0 && standbyPool.length > 0 && !st.stopSchedulerRequested && !st.isStopping) {
        const standby = standbyPool.shift()!;
        dueAccounts.push(standby);
        st.schedulerQueue.push(standby.id);
        savedPartitions[standby.id] = { coins: [], messages: [] };
        upcomingAccounts = [standby];
        addLog("info", `[SCHEDULER] Added standby account [${standby.name}] to end of queue to handle ${unpostedMessages.length} remaining unposted coins from [${failedAccName}].`);
      }
      if (upcomingAccounts.length === 0) {
        addLog("warning", `[SCHEDULER] No remaining accounts available in this cycle to absorb ${unpostedMessages.length} unposted coins from [${failedAccName}].`);
        return;
      }

      const countUpcoming = upcomingAccounts.length;
      const baseExtra = Math.floor(unpostedMessages.length / countUpcoming);
      const remExtra = unpostedMessages.length % countUpcoming;
      let extraCursor = 0;
      const redistLog: string[] = [];

      for (let u = 0; u < countUpcoming; u++) {
        const targetAcc = upcomingAccounts[u];
        const addCount = baseExtra + (u < remExtra ? 1 : 0);
        if (addCount <= 0) continue;
        const extraCoinsSlice = unpostedCoins.slice(extraCursor, extraCursor + addCount);
        const extraMsgsSlice = unpostedMessages.slice(extraCursor, extraCursor + addCount);
        extraCursor += addCount;

        const existingPart = savedPartitions[targetAcc.id] || { coins: [], messages: [] };
        savedPartitions[targetAcc.id] = {
          coins: [...existingPart.coins, ...extraCoinsSlice],
          messages: [...existingPart.messages, ...extraMsgsSlice],
        };
        redistLog.push(`${targetAcc.name} (+${addCount} -> ${savedPartitions[targetAcc.id].messages.length} coins)`);
      }

      writeJsonFile(schedulerPartitionsFile, savedPartitions);
      addLog(
        "info",
        `[SCHEDULER] Redistributed ${unpostedMessages.length} unposted coins from [${failedAccName}] across ${countUpcoming} remaining account(s): ${redistLog.join(" | ")}`
      );
    };

    // 4. Run each due account sequentially, awaiting each one fully before the next
    for (let idx = 0; idx < dueAccounts.length; idx++) {
      let account = dueAccounts[idx];
      st.currentSchedulerAccountId = account.id;

      // a. Check if pause or stop was requested
      if (st.stopSchedulerRequested || st.isStopping || st.pauseSchedulerRequested) {
        const remQueue = st.schedulerQueue.slice(idx);
        const curSettings = getLocalBotSettings();
        saveLocalBotSettings({
          ...curSettings,
          schedulerStatus: st.pauseSchedulerRequested ? "paused" : "stopped",
          schedulerSavedPosition: {
            queue: remQueue.length > 0 ? remQueue : st.schedulerQueue,
            currentAccountId: account.id,
            pausedAt: new Date().toISOString(),
          },
        });
        addLog("warning", `[SCHEDULER] ${st.pauseSchedulerRequested ? "Pause" : "Stop"} active. Saved position for account [${account.name || account.id}].`);
        break;
      }

      const preSliced = savedPartitions[account.id];
      const startIdx = idx * perAccountTarget;
      const endIdx = Math.min(messages.length, startIdx + perAccountTarget);
      const accountMessages = preSliced ? preSliced.messages : messages.slice(startIdx, endIdx);
      const accountCoins = preSliced ? preSliced.coins : coins.slice(startIdx, endIdx);

      if (accountMessages.length === 0) {
        addLog("info", `[${account.name}] No assigned coins in queue for this cycle. Skipping.`);
        continue;
      }

      addLog("info", `--------------------------------------------------`);
      addLog("info", `[${account.name}] Beginning turn (Account ${idx + 1}/${dueAccounts.length}) • Assigned ${accountMessages.length} coins...`);

      // b. Verify primary account session cookies
      let preCheckOk = false;
      let skipStatus: LastRunStatus = "failed";

      if (!account.stateJson || !sessionHasValidCookies(account.stateJson)) {
        addLog("warning", `[${account.name}] Missing or invalid session cookies. Status: skipped_missing_session.`);
        skipStatus = "skipped_missing_session";
      } else {
        try {
          await activateProfileInternal(account.id);
          addLog("info", `[${account.name}] Verifying live session status...`);
          const loginCheck = await checkLoginReal();
          if (loginCheck.status === "captcha") {
            addLog("error", `[${account.name}] Captcha detected during pre-check. Status: stopped_captcha.`);
            skipStatus = "stopped_captcha";
          } else if (loginCheck.status === "expired" || loginCheck.status === "failed") {
            addLog("warning", `[${account.name}] Session check expired (${loginCheck.message}). Status: skipped_expired.`);
            skipStatus = "skipped_expired";
          } else {
            const maxDaily = getAccountDailyPostLimit(account.id);
            const progressData = readBotProgress(account.id);
            const dailyCount = progressData.daily_post_count || 0;
            if (dailyCount >= maxDaily) {
              addLog("warning", `[${account.name}] Account reached daily limit of ${maxDaily} posts for ${getTodayDateString()}. Status: stopped_daily_limit.`);
              skipStatus = "stopped_daily_limit";
            } else {
              preCheckOk = true;
            }
          }
        } catch (actErr) {
          addLog("error", `[${account.name}] Failed to activate profile: ${(actErr as Error).message}`);
          skipStatus = "failed";
        }
      }

      // If primary account pre-check failed, record status, try standby failover, or redistribute its coins to remaining accounts
      if (!preCheckOk) {
        const failedPrimaryName = account.name;
        updateProfileLastRun(account.id, {
          at: new Date().toISOString(),
          status: skipStatus,
          posted: 0,
          failed: 0,
        });

        let standbyReady = false;
        if (standbyPool.length > 0 && !st.stopSchedulerRequested && !st.isStopping) {
          const standby = standbyPool.shift()!;
          addLog("info", `[SCHEDULER] Auto-Failover: Primary account [${account.name}] was skipped (${skipStatus}). Deploying standby account [${standby.name}] for this partition of ${accountMessages.length} coins...`);
          account = standby;
          st.currentSchedulerAccountId = account.id;

          try {
            await activateProfileInternal(account.id);
            addLog("info", `[${account.name}] Verifying standby account session...`);
            const sCheck = await checkLoginReal();
            if (sCheck.status === "captcha" || sCheck.status === "expired" || sCheck.status === "failed") {
              addLog("warning", `[${account.name}] Standby account session check failed (${sCheck.message || sCheck.status}). Redistributing coins to remaining accounts.`);
              updateProfileLastRun(account.id, {
                at: new Date().toISOString(),
                status: sCheck.status === "captcha" ? "stopped_captcha" : "skipped_expired",
                posted: 0,
                failed: 0,
              });
            } else {
              const sLimit = getAccountDailyPostLimit(account.id);
              const sProg = readBotProgress(account.id);
              if ((sProg.daily_post_count || 0) >= sLimit) {
                addLog("warning", `[${account.name}] Standby account reached daily limit. Redistributing coins to remaining accounts.`);
                updateProfileLastRun(account.id, {
                  at: new Date().toISOString(),
                  status: "stopped_daily_limit",
                  posted: 0,
                  failed: 0,
                });
              } else {
                standbyReady = true;
              }
            }
          } catch (stErr) {
            addLog("error", `[${account.name}] Standby activation error: ${(stErr as Error).message}. Redistributing coins to remaining accounts.`);
            updateProfileLastRun(account.id, {
              at: new Date().toISOString(),
              status: "failed",
              posted: 0,
              failed: 0,
            });
          }
        }

        if (!standbyReady) {
          redistributeUnpostedToUpcoming(accountCoins, accountMessages, failedPrimaryName, idx);
          continue;
        }
      }

      // Setup isolated profile directory and progress data for this turn
      const maxDaily = getAccountDailyPostLimit(account.id);
      const progressData = readBotProgress(account.id);
      const todayStr = getTodayDateString();
      const dailyCount = progressData.daily_post_count || 0;

      const accountDir = path.join(st.OUTPUT_DIR, account.id);
      if (!fs.existsSync(accountDir)) {
        fs.mkdirSync(accountDir, { recursive: true });
      }
      writeJsonFile(path.join(accountDir, "last_trending.json"), accountCoins);
      writeJsonFile(path.join(accountDir, "generated_messages.json"), accountMessages);
      const existingAccountResults = getIsolatedResults(account.id);
      writeJsonFile(path.join(accountDir, "results.json"), existingAccountResults);
      writeJsonFile(path.join(accountDir, "post_progress.json"), {
        next_index: 0,
        daily_post_count: dailyCount,
        daily_post_limit: maxDaily,
        last_post_date: todayStr,
      });

      // Synchronize batch timestamp so the account knows this cycle has a fresh generation timestamp
      const cycleTs: ProfileTimestamps = {
        coinsFetchedAt: st.lastSchedulerCycleStartTime,
        coinsFetchedTime: new Date(st.lastSchedulerCycleStartTime).toISOString(),
        commentsGeneratedAt: st.lastSchedulerCycleStartTime,
        commentsGeneratedTime: new Date(st.lastSchedulerCycleStartTime).toISOString(),
      };
      writeJsonFile(path.join(accountDir, "timestamps.json"), cycleTs);

      // Synchronize in-memory paths & pointers
      updateActiveProfilePaths();
      writeJsonFile(st.LAST_TRENDING_FILE, accountCoins);
      writeJsonFile(st.GENERATED_MESSAGES_FILE, accountMessages);
      writeJsonFile(st.RESULTS_FILE, existingAccountResults);
      writeJsonFile(st.TIMESTAMPS_FILE, cycleTs);
      st.currentPostingIndex = 0;

      // Run posting loop for this account awaiting it fully
      st.isPostingRunning = true;
      st.botStatus = "Posting";
      addLog("info", `[${account.name}] Launching automated posting loop for ${accountMessages.length} assigned coins in this cycle (Daily Cap: ${dailyCount}/${maxDaily})...`);

      const summary = await runPostingLoop({
        scheduleNextCycle: false,
        disableLoopOnFailures: false,
        accountLogPrefix: `[${account.name}] `,
      });

      totalCyclePosted += summary.posted;
      totalCycleFailed += summary.failed;

      // Save lastRun status to profile
      const finalStatus = (st.stopSchedulerRequested || st.isStopping) ? "stopped_by_user" : summary.stopReason;
      updateProfileLastRun(account.id, {
        at: new Date().toISOString(),
        status: finalStatus,
        posted: summary.posted,
        failed: summary.failed,
      });

      // If this account was manually checked for now (e.g. weekly manual check), reset flag after the run
      if (account.schedule?.useForNow) {
        try {
          updateProfileSchedule(account.id, { useForNow: false });
        } catch (_) {}
      }

      addLog("success", `[${account.name}] Run finished: ${summary.posted} posted, ${summary.failed} failed. Status: ${finalStatus}.`);

      // If this account stopped early or failed part of its partition (not paused/stopped by user),
      // redistribute its remaining unposted coins to the remaining accounts in this cycle!
      if (!st.pauseSchedulerRequested && !st.stopSchedulerRequested && !st.isStopping && summary.posted < accountMessages.length) {
        const updatedAccResults = getIsolatedResults(account.id);
        const normSym = (s?: string) => String(s || "").replace(/^\$/, "").trim().toLowerCase();
        const postedSymsInThisTurn = new Set(
          updatedAccResults
            .filter(r => {
              const rTime = r.createdAt ? Number(r.createdAt) : new Date(r.timestamp).getTime();
              return r.status === "success" && (!isNaN(rTime) ? rTime >= (st.lastSchedulerCycleStartTime - 60000) : true);
            })
            .map(r => normSym(r.symbol))
        );
        const unpostedMsgsForAcc = accountMessages.filter(m => !postedSymsInThisTurn.has(normSym(m.symbol)));
        const unpostedCoinsForAcc = accountCoins.filter(c => !postedSymsInThisTurn.has(normSym(c.symbol)));
        if (unpostedMsgsForAcc.length > 0) {
          redistributeUnpostedToUpcoming(unpostedCoinsForAcc, unpostedMsgsForAcc, account.name, idx);
        }
      }

      if (st.pauseSchedulerRequested || st.stopSchedulerRequested || st.isStopping) {
        const remQueue = st.schedulerQueue.slice(idx + (summary.stopReason === "completed" ? 1 : 0));
        const nextAccId = remQueue[0] || account.id;
        const curSettings = getLocalBotSettings();
        saveLocalBotSettings({
          ...curSettings,
          schedulerStatus: st.pauseSchedulerRequested ? "paused" : "stopped",
          schedulerSavedPosition: remQueue.length > 0 ? {
            queue: remQueue,
            currentAccountId: nextAccId,
            pausedAt: new Date().toISOString(),
          } : null,
        });
        addLog("info", `[SCHEDULER] Cycle ${st.pauseSchedulerRequested ? "paused" : "stopped"}. Position saved at account [${nextAccId}].`);
        break;
      }
    }

    if (!st.pauseSchedulerRequested && !st.stopSchedulerRequested && !st.isStopping) {
      const curSettings = getLocalBotSettings();
      saveLocalBotSettings({
        ...curSettings,
        schedulerSavedPosition: null,
        schedulerStatus: "stopped",
      });
    }

    if (totalCyclePosted === 0 && dueAccounts.length > 0 && !st.stopSchedulerRequested && !st.isStopping) {
      addLog("warning", "[SCHEDULER] Cycle circuit breaker: All accounts in this cycle failed pre-flight checks. Pausing until next scheduled cycle.");
      sendTelegramAlert(
        "CRITICAL: ALL ACCOUNTS SESSION OUT - MANUAL ATTENTION REQUIRED",
        `⚠️ The 24-part background posting cycle is completely stalled!\n\n• All ${dueAccounts.length} scheduled accounts failed authentication (sessions expired or captcha blocked).\n• 0 coins could be posted.\n• Standby backup accounts are also exhausted.\n\n👉 ACTION REQUIRED: Please log in to your CoinMarketCap accounts and re-import valid cookies in the Profiles tab to restore automation.`,
        "error",
        "emergency_all_accounts_out"
      ).catch(() => {});
    }

    const todayStr = getTodayDateString();
    const currentSettings = getLocalBotSettings();
    let updatedDailyCycles = (currentSettings.dailyCycleCount || 0) + 1;
    if (currentSettings.lastCycleDate !== todayStr) {
      updatedDailyCycles = 1;
    }
    const maxCycles = currentSettings.maxCyclesPerDay || 4;
    saveLocalBotSettings({
      ...currentSettings,
      dailyCycleCount: updatedDailyCycles,
      lastCycleDate: todayStr,
    });

    // Auto-prune old completed records and archive
    try {
      pruneOldAndCompletedData();
    } catch (_) {}

    addLog("info", "==================================================");
    addLog("success", `[SCHEDULER] Sequential multi-account scheduled cycle finished. (Cycle ${updatedDailyCycles}/${maxCycles} completed for today).`);
    st.botStatus = "Completed";
  } catch (err) {
    addLog("error", `[SCHEDULER] Fatal error in scheduled cycle: ${(err as Error).message}`);
    st.botStatus = "Idle";
    sendTelegramAlert(
      "EMERGENCY: Background Cycle Disrupted",
      `The 24-part background posting cycle crashed unexpectedly.\n\nError: ${(err as Error).message}\n\n👉 ACTION REQUIRED: Manual check needed in Admin Diagnostics.`,
      "error",
      "emergency_cycle_crashed"
    ).catch(() => {});
  } finally {
    releaseProcessLock("scheduler_cycle");
    st.isSchedulerCycleRunning = false;
    st.currentSchedulerAccountId = null;
    st.schedulerQueue = [];
    st.isPostingRunning = st.isSinglePostingRunning;
    if (!st.isSinglePostingRunning && st.botStatus !== "Completed") {
      st.botStatus = "Idle";
    }

    if (st.stopSchedulerForceTimer) {
      clearTimeout(st.stopSchedulerForceTimer);
      st.stopSchedulerForceTimer = null;
    }
    st.pauseSchedulerRequested = false;
    st.stopSchedulerRequested = false;

    // Restore original active profile so user's manual UI view is NEVER altered
    if (initialActiveProfileId) {
      try {
        await activateProfileInternal(initialActiveProfileId);
      } catch (_) {}
    }

    // Schedule next cycle independently without touching continuous loop
    const postSettings = getLocalBotSettings();
    if (postSettings.schedulerEnabled && !postSettings.schedulerSavedPosition) {
      scheduleNextSchedulerCycle();
    }
  }
}

// Scheduler Endpoints (Part 3)
app.get("/api/scheduler", (req, res) => {
  const settings = getLocalBotSettings();
  const rawProfiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
  const profiles = normalizeProfilesWithSchedule(rawProfiles);

  const accounts = profiles.map(p => {
    const { schedule, lastRun } = normalizeProfileSchedule(p);
    return {
      id: p.id,
      name: p.name,
      schedule,
      lastRun,
      nextDueAt: nextDueAt(schedule, lastRun.at),
      hasValidSession: sessionHasValidCookies(p.stateJson),
    };
  });

  const todayStr = getTodayDateString();
  const dailyCycles = settings.lastCycleDate === todayStr ? (settings.dailyCycleCount || 0) : 0;
  const maxCycles = settings.maxCyclesPerDay || 4;
  const peakInfo = getNextPeakTradingSession(new Date());

  const schedulerStatus = st.isSchedulerCycleRunning
    ? "running"
    : (settings.schedulerStatus || (settings.schedulerSavedPosition ? "paused" : (settings.schedulerEnabled ? "running" : "stopped")));

  res.json({
    enabled: settings.schedulerEnabled,
    status: schedulerStatus,
    state: schedulerStatus === "running" ? "RUNNING" : (schedulerStatus === "paused" ? "PAUSED" : "STOPPED"),
    savedPosition: settings.schedulerSavedPosition || null,
    mode: settings.schedulerMode || "peak_hours",
    intervalMinutes: settings.schedulerIntervalMinutes || 360,
    maxCyclesPerDay: maxCycles,
    dailyCycleCount: dailyCycles,
    lastCycleDate: settings.lastCycleDate || todayStr,
    cycleRunning: st.isSchedulerCycleRunning,
    currentAccountId: st.currentSchedulerAccountId,
    nextCycleAt: st.nextSchedulerCycleStartTime ? new Date(st.nextSchedulerCycleStartTime).toISOString() : null,
    nextPeakSession: peakInfo.session,
    queue: st.schedulerQueue,
    accounts,
    targetCoinsCount: typeof settings.targetCoinsCount === "number" ? settings.targetCoinsCount : 0,
  });
});

app.post("/api/scheduler/settings", (req, res) => {
  if (isSchedulerRunning()) {
    return res.status(409).json({ error: "Pause or stop the scheduler to change settings" });
  }
  const { enabled, intervalMinutes, mode, maxCyclesPerDay } = req.body;
  if (enabled !== undefined && typeof enabled !== "boolean") {
    return res.status(400).json({ error: "Invalid 'enabled' value. Must be a boolean." });
  }

  const current = getLocalBotSettings();
  const nextEnabled = enabled !== undefined ? enabled : current.schedulerEnabled;
  let nextMode = current.schedulerMode || "peak_hours";
  if (mode === "peak_hours" || mode === "interval") {
    nextMode = mode;
  }
  let nextMaxCycles = current.maxCyclesPerDay || 4;
  if (typeof maxCyclesPerDay === "number" && maxCyclesPerDay >= 1 && maxCyclesPerDay <= 24) {
    nextMaxCycles = Math.round(maxCyclesPerDay);
  }

  let nextInterval = current.schedulerIntervalMinutes || 360;
  let intervalChanged = false;
  if (intervalMinutes !== undefined) {
    const parsedMins = Number(intervalMinutes);
    if (!isNaN(parsedMins) && parsedMins >= 1 && parsedMins <= 1440) {
      nextInterval = Math.round(parsedMins);
      intervalChanged = true;
      addLog("info", `[SCHEDULER] Multi-account cycle interval set to ${nextInterval} minutes.`);
    }
  }

  const updated: BotSettings = {
    ...current,
    schedulerEnabled: nextEnabled,
    schedulerMode: nextMode,
    maxCyclesPerDay: nextMaxCycles,
    schedulerIntervalMinutes: nextInterval,
  };
  saveLocalBotSettings(updated);

  if (enabled !== undefined) {
    addLog("info", `[SCHEDULER] Sequential multi-account scheduler set to: ${nextEnabled ? "ENABLED" : "DISABLED"} (Mode: ${nextMode}, Max: ${nextMaxCycles} cycles/day)`);

    if (nextEnabled && !st.isSchedulerCycleRunning) {
      scheduleNextSchedulerCycle(1000);
    } else if (!nextEnabled) {
      cancelNextSchedulerCycle();
      if (st.isSchedulerCycleRunning) {
        st.stopSchedulerRequested = true;
      }
    }
  } else if (updated.schedulerEnabled && !st.isSchedulerCycleRunning) {
    scheduleNextSchedulerCycle();
  }

  res.json({
    success: true,
    enabled: updated.schedulerEnabled,
    mode: updated.schedulerMode,
    intervalMinutes: updated.schedulerIntervalMinutes,
    maxCyclesPerDay: updated.maxCyclesPerDay,
    dailyCycleCount: updated.dailyCycleCount || 0,
  });
});

app.post("/api/scheduler/reorder-accounts", (req, res) => {
  if (isSchedulerRunning()) {
    return res.status(409).json({ error: "Pause or stop the scheduler to change settings" });
  }
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: "Missing or invalid orderedIds array." });
    }
    let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
    profiles = normalizeProfilesWithSchedule(profiles);

    orderedIds.forEach((id: string, index: number) => {
      const p = profiles.find(prof => prof.id === id);
      if (p) {
        if (!p.schedule) p.schedule = {};
        p.schedule.order = index + 1;
        p.updatedAt = new Date().toISOString();
      }
    });

    profiles.sort((a, b) => (a.schedule?.order || 0) - (b.schedule?.order || 0));
    fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
    saveProfilesCloud(profiles).catch(err => console.error("[STORAGE] Error syncing reordered profiles to cloud:", err));

    addLog("info", `[SCHEDULER] Reordered ${orderedIds.length} accounts in sequence.`);
    res.json({ success: true, profiles });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/api/scheduler/files-info", (req, res) => {
  const getInfo = (filePath: string, key: string, name: string, description: string) => {
    const exists = fs.existsSync(filePath);
    let sizeBytes = 0;
    let updatedAt: string | null = null;
    let itemCount: number | undefined = undefined;

    if (exists) {
      try {
        const stats = fs.statSync(filePath);
        sizeBytes = stats.size;
        updatedAt = stats.mtime.toISOString();
        const content = fs.readFileSync(filePath, "utf-8").trim();
        if (content) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            itemCount = parsed.length;
          } else if (typeof parsed === "object" && parsed !== null) {
            itemCount = Object.keys(parsed).length;
          }
        }
      } catch (_) {}
    }

    return {
      key,
      name,
      path: filePath,
      description,
      exists,
      sizeBytes,
      itemCount,
      updatedAt,
    };
  };

  const files = [
    getInfo(st.SETTINGS_FILE, "settings", "Scheduler & Bot Settings", "auth/settings.json (Stores scheduler master switch & configuration)"),
    getInfo(st.PROFILES_FILE, "profiles", "Accounts & Schedules", "auth/profiles.json (Stores account profiles, schedule order, frequencies, and run history)"),
    getInfo(st.LAST_TRENDING_FILE, "trending", "Trending Coins Cache", "output/last_trending.json (Trending coins fetched once per cycle and shared across accounts)"),
    getInfo(st.GENERATED_MESSAGES_FILE, "comments", "Generated Comments Cache", "output/generated_messages.json (LLM comments generated once per cycle for all accounts)"),
    getInfo(st.RESULTS_FILE, "results", "Post Submissions Log", "output/results.json (Historical log of all post submissions by all accounts)"),
    getInfo(st.POST_PROGRESS_FILE, "progress", "Posting Progress State", "output/post_progress.json (Pointer index and daily limit counters)"),
    getInfo(st.SCHEDULER_LOG_FILE, "scheduler_log", "Scheduler Execution Log", "output/scheduler.log (Chronological log of sequential cycles, account switches, and results)"),
  ];

  res.json({ success: true, files });
});

app.get("/api/scheduler/file-content", (req, res) => {
  const { key } = req.query;
  let targetPath = "";
  if (key === "settings") targetPath = st.SETTINGS_FILE;
  else if (key === "profiles") targetPath = st.PROFILES_FILE;
  else if (key === "trending") targetPath = st.LAST_TRENDING_FILE;
  else if (key === "comments") targetPath = st.GENERATED_MESSAGES_FILE;
  else if (key === "results") targetPath = st.RESULTS_FILE;
  else if (key === "progress") targetPath = st.POST_PROGRESS_FILE;
  else if (key === "scheduler_log") targetPath = st.SCHEDULER_LOG_FILE;
  else return res.status(400).json({ error: "Invalid file key." });

  if (!fs.existsSync(targetPath)) {
    return res.json({ success: true, exists: false, path: targetPath, content: null });
  }
  try {
    const raw = fs.readFileSync(targetPath, "utf-8");
    res.json({ success: true, exists: true, path: targetPath, content: raw });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/api/scheduler/file-download", (req, res) => {
  const { key } = req.query;
  let targetPath = "";
  let filename = "download.json";
  if (key === "settings") { targetPath = st.SETTINGS_FILE; filename = "settings.json"; }
  else if (key === "profiles") { targetPath = st.PROFILES_FILE; filename = "profiles.json"; }
  else if (key === "trending") { targetPath = st.LAST_TRENDING_FILE; filename = "last_trending.json"; }
  else if (key === "comments") { targetPath = st.GENERATED_MESSAGES_FILE; filename = "generated_messages.json"; }
  else if (key === "results") { targetPath = st.RESULTS_FILE; filename = "results.json"; }
  else if (key === "progress") { targetPath = st.POST_PROGRESS_FILE; filename = "post_progress.json"; }
  else if (key === "scheduler_log") { targetPath = st.SCHEDULER_LOG_FILE; filename = "scheduler_execution.log"; }
  else return res.status(400).json({ error: "Invalid file key." });

  if (!fs.existsSync(targetPath)) {
    return res.status(404).json({ error: "File not found or not yet created." });
  }
  res.download(targetPath, filename);
});

app.get("/api/scheduler/logs", (req, res) => {
  if (st.schedulerLogsBuffer.length === 0 && fs.existsSync(st.SCHEDULER_LOG_FILE)) {
    try {
      const content = fs.readFileSync(st.SCHEDULER_LOG_FILE, "utf-8");
      const lines = content.split("\n").filter(Boolean).slice(-200);
      st.schedulerLogsBuffer = lines.map(line => {
        const m = line.match(/^\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.*)$/);
        if (m) {
          const timeStr = new Date(m[1]).toLocaleTimeString();
          const lvl = m[2].toLowerCase();
          return {
            timestamp: timeStr !== "Invalid Date" ? timeStr : m[1],
            level: (lvl === "success" || lvl === "warning" || lvl === "error") ? lvl : "info",
            message: m[3],
          } as LogEntry;
        }
        return { timestamp: new Date().toLocaleTimeString(), level: "info", message: line } as LogEntry;
      });
    } catch (_) {}
  }
  const combined = st.schedulerLogsBuffer.length > 0
    ? st.schedulerLogsBuffer
    : st.logs.filter(l => isSchedulerLogMessage(l.message));
  res.json({ success: true, logs: combined.slice(-200) });
});

app.get("/api/scheduler/logs/download", (req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="scheduler_execution.log"');
  if (fs.existsSync(st.SCHEDULER_LOG_FILE)) {
    const stream = fs.createReadStream(st.SCHEDULER_LOG_FILE);
    return stream.pipe(res);
  }
  const schedLogs = st.logs.filter(l =>
    l.message.includes("[SCHEDULER]") ||
    l.message.includes("[SYNC]") ||
    l.message.includes("Run finished") ||
    l.message.includes("Sequential") ||
    l.message.includes("Turn (Account")
  );
  const text = schedLogs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join("\n");
  res.send(text || "No scheduler logs recorded yet.");
});

app.post("/api/profile-schedule", (req, res) => {
  if (isSchedulerRunning()) {
    return res.status(409).json({ error: "Pause or stop the scheduler to change settings" });
  }
  try {
    const { id, enabled, frequency, customHours, order, useForNow } = req.body;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Missing or invalid profile id." });
    }
    if (enabled !== undefined && typeof enabled !== "boolean") {
      return res.status(400).json({ error: "Invalid 'enabled' value. Must be a boolean." });
    }
    if (useForNow !== undefined && typeof useForNow !== "boolean") {
      return res.status(400).json({ error: "Invalid 'useForNow' value. Must be a boolean." });
    }
    if (frequency !== undefined) {
      const validFreqs: ScheduleFrequency[] = ["every_cycle", "daily", "weekly", "custom"];
      if (!validFreqs.includes(frequency)) {
        return res.status(400).json({ error: `Invalid frequency '${frequency}'. Allowed: ${validFreqs.join(", ")}` });
      }
    }
    if (customHours !== undefined) {
      const ch = Number(customHours);
      if (isNaN(ch) || ch < 1 || ch > 720) {
        return res.status(400).json({ error: "Invalid 'customHours'. Must be a number between 1 and 720." });
      }
    }
    if (order !== undefined) {
      const ord = Number(order);
      if (isNaN(ord) || ord < 1) {
        return res.status(400).json({ error: "Invalid 'order'. Must be a positive integer." });
      }
    }

    const updated = updateProfileSchedule(id, {
      ...(enabled !== undefined ? { enabled } : {}),
      ...(frequency !== undefined ? { frequency } : {}),
      ...(customHours !== undefined ? { customHours: Number(customHours) } : {}),
      ...(order !== undefined ? { order: Number(order) } : {}),
      ...(useForNow !== undefined ? { useForNow } : {}),
    });

    res.json({ success: true, profile: updated });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/api/scheduler/run-now", (req, res) => {
  const settings = getLocalBotSettings();
  if (!settings.schedulerEnabled && !settings.schedulerSavedPosition) {
    return res.status(400).json({ error: "Scheduler is disabled. Please enable 'Run accounts in sequence' first." });
  }
  if (isBusy() || st.isSchedulerCycleRunning) {
    return res.status(400).json({ error: "Another process or scheduler cycle is already running. Please wait or stop it first." });
  }

  if (!settings.schedulerEnabled) {
    saveLocalBotSettings({ ...settings, schedulerEnabled: true, schedulerStatus: "running" });
  }

  addLog("info", "[SCHEDULER] Manual 'Run cycle now' requested by user.");
  if (!process.env.VITEST) {
    runScheduledCycle().catch(err => {
      addLog("error", `[SCHEDULER] Error in manual cycle: ${(err as Error).message}`);
    });
  } else {
    st.isSchedulerCycleRunning = true;
  }

  res.json({ success: true, message: "Sequential scheduled cycle started." });
});

app.post("/api/scheduler/pause", async (req, res) => {
  const settings = getLocalBotSettings();
  if (!st.isSchedulerCycleRunning && !settings.schedulerEnabled && !settings.schedulerSavedPosition) {
    return res.status(400).json({ error: "Scheduler is not currently running." });
  }

  st.pauseSchedulerRequested = true;
  cancelNextSchedulerCycle();
  if (process.env.VITEST) {
    st.isSchedulerCycleRunning = false;
  }

  const queueToSave = st.schedulerQueue.length > 0 ? st.schedulerQueue : (settings.schedulerSavedPosition?.queue || []);
  const accountToSave = st.currentSchedulerAccountId || settings.schedulerSavedPosition?.currentAccountId || (queueToSave[0] || null);

  const updatedSettings: BotSettings = {
    ...settings,
    schedulerStatus: "paused",
    schedulerSavedPosition: accountToSave ? {
      queue: queueToSave,
      currentAccountId: accountToSave,
      pausedAt: new Date().toISOString(),
    } : null,
  };
  saveLocalBotSettings(updatedSettings);

  addLog("warning", "[SCHEDULER] Pause requested. Finishing current coin before waiting.");
  res.json({ success: true, message: "Scheduler paused.", status: "paused", state: "PAUSED" });
});

app.post("/api/scheduler/resume", async (req, res) => {
  const currentSettings = getLocalBotSettings();
  if (isBusy() || st.isSchedulerCycleRunning) {
    return res.status(400).json({ error: "Another process or scheduler cycle is already running. Please wait or stop it first." });
  }

  st.pauseSchedulerRequested = false;
  st.stopSchedulerRequested = false;

  const updatedSettings: BotSettings = {
    ...currentSettings,
    schedulerEnabled: true,
    schedulerStatus: "running",
  };
  saveLocalBotSettings(updatedSettings);

  addLog("info", "[SCHEDULER] Resume requested by user.");
  if (!process.env.VITEST) {
    runScheduledCycle().catch(err => {
      addLog("error", `[SCHEDULER] Error in resumed cycle: ${(err as Error).message}`);
    });
  } else {
    st.isSchedulerCycleRunning = true;
  }

  res.json({ success: true, message: "Scheduler resumed.", status: "running", state: "RUNNING" });
});

app.post("/api/scheduler/stop", async (req, res) => {
  st.stopSchedulerRequested = true;
  cancelNextSchedulerCycle();
  cancelNextAutomationCycle();
  if (process.env.VITEST) {
    st.isSchedulerCycleRunning = false;
  }

  const currentSettings = getLocalBotSettings();
  const queueToSave = st.schedulerQueue.length > 0 ? st.schedulerQueue : (currentSettings.schedulerSavedPosition?.queue || []);
  const accountToSave = st.currentSchedulerAccountId || currentSettings.schedulerSavedPosition?.currentAccountId || (queueToSave[0] || null);

  saveLocalBotSettings({
    ...currentSettings,
    schedulerEnabled: false,
    schedulerStatus: "stopped",
    schedulerSavedPosition: accountToSave ? {
      queue: queueToSave,
      currentAccountId: accountToSave,
      pausedAt: new Date().toISOString(),
    } : null,
  });

  addLog("warning", "[SCHEDULER] Stop requested. Letting current coin finish first (force closing after 2 minutes if needed)...");

  if (st.stopSchedulerForceTimer) {
    clearTimeout(st.stopSchedulerForceTimer);
  }
  st.stopSchedulerForceTimer = setTimeout(async () => {
    if (st.activePostingBrowser || st.activePostingPage) {
      addLog("warning", "[SCHEDULER] Force-closing browser after 2-minute graceful stop timeout.");
      try {
        if (st.activePostingPage) await st.activePostingPage.close().catch(() => {});
        if (st.activePostingBrowser) await st.activePostingBrowser.close().catch(() => {});
      } catch (_) {}
      st.activePostingBrowser = null;
      st.activePostingPage = null;
    }
  }, 120000);

  res.json({ success: true, message: "Scheduler stop initiated; finishing current coin.", status: "idle", state: "STOPPED" });
});

// ============================================================================
// TELEGRAM ALERT NOTIFICATIONS ENDPOINTS
// ============================================================================

app.get("/api/telegram/settings", (req, res) => {
  const settings = getLocalBotSettings();
  res.json({
    enabled: settings.telegramAlertsEnabled !== false,
    botToken: settings.telegramBotToken || "8698939017:AAHMbpwBznDWBLDJiW9-ogqvYODXbjA3wGU",
    chatId: settings.telegramChatId || "",
  });
});

app.post("/api/telegram/settings", (req, res) => {
  try {
    const { enabled, botToken, chatId } = req.body;
    const settings = getLocalBotSettings();
    if (typeof enabled === "boolean") settings.telegramAlertsEnabled = enabled;
    if (typeof botToken === "string") settings.telegramBotToken = botToken.trim();
    if (typeof chatId === "string") settings.telegramChatId = chatId.trim();
    saveLocalBotSettings(settings);
    addLog("success", `Updated Telegram notification settings (Enabled: ${settings.telegramAlertsEnabled}).`);
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

app.get("/api/telegram/detect-chat-id", async (req, res) => {
  try {
    const settings = getLocalBotSettings();
    const token = ((req.query.token as string) || settings.telegramBotToken || "8698939017:AAHMbpwBznDWBLDJiW9-ogqvYODXbjA3wGU").trim();
    const resp = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
    const data: any = await resp.json();
    if (!data.ok) {
      return res.status(400).json({ success: false, error: data.description || "Failed to query Telegram API" });
    }
    const updates = data.result || [];
    let detectedChatId: string | null = null;
    let senderName = "";
    for (let i = updates.length - 1; i >= 0; i--) {
      const u = updates[i];
      const chat = u.message?.chat || u.edited_message?.chat || u.channel_post?.chat || u.callback_query?.message?.chat;
      if (chat && chat.id) {
        detectedChatId = String(chat.id);
        senderName = chat.first_name || chat.username || "User";
        break;
      }
    }
    if (detectedChatId) {
      settings.telegramChatId = detectedChatId;
      saveLocalBotSettings(settings);
      addLog("success", `[TELEGRAM] Auto-detected Telegram Chat ID: ${detectedChatId} (${senderName}). Saved to settings.`);
      return res.json({ success: true, chatId: detectedChatId, senderName });
    }
    return res.json({
      success: false,
      message: "No incoming messages found yet. Please open t.me/anup_cms_alert_bot on Telegram, press Start, and click Detect again!"
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

app.post("/api/telegram/test", async (req, res) => {
  try {
    const { token, chatId } = req.body;
    const settings = getLocalBotSettings();
    if (token) settings.telegramBotToken = String(token).trim();
    if (chatId) settings.telegramChatId = String(chatId).trim();
    saveLocalBotSettings(settings);

    const alertRes = await sendTelegramAlert(
      "CoinMarketCap Emergency Alert System Connected!",
      "🚨 <b>Emergency-Only Alert Mode Active</b>\n\nYour alert bot @anup_cms_alert_bot is linked and calibrated.\n\n⚠️ <b>You will ONLY receive notifications when manual action is required:</b>\n• 🛑 <b>All Accounts Session Out:</b> When all accounts in the 24-part background cycle fail authentication, halting automation\n• 💥 <b>Background Cycle Stalled:</b> Background runner encountered a critical crash\n• ⛔ <b>Posting Loop Aborted:</b> Active session expired or persistent captcha block\n• 🛠️ <b>Build & Deployment Failures:</b> EC2 server compilation errors\n\n🔇 <i>Routine cycle completions, single standby account failovers, and healthy runs run silently with zero spam. Maximum 6 emergency alerts/hr with 20-min deduplication.</i>",
      "success",
      "manual_test",
      true
    );
    if (!alertRes.success) {
      return res.status(400).json({ success: false, error: alertRes.error });
    }
    res.json({ success: true, message: "Test alert successfully sent to Telegram!" });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});


// ============================================================================
// VITE OR STATIC FILES SERVING MIDDLEWARE
// ============================================================================

process.on("unhandledRejection", (reason) => {
  console.error("[SERVER] Unhandled Rejection (logged silently, no Telegram noise):", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[SERVER] Uncaught Fatal Exception:", err);
  sendTelegramAlert(
    "CRITICAL: Server Process Crash",
    `Fatal error occurred on server host:\n${err.message}\n\n👉 ACTION REQUIRED: Manual check/restart may be required.`,
    "error",
    "server_process_crash"
  ).catch(() => {});
});

async function startServer() {
  // First, hydrate all files from Firestore cloud database
  await hydrateLocalFromCloud();

  // Restart safety: if scheduler is enabled, schedule next multi-account cycle after configured interval (isolated from single posting)
  const initialSettings = getLocalBotSettings();
  if (initialSettings.schedulerEnabled) {
    addLog("info", `[STARTUP] Sequential multi-account scheduler is ENABLED. Scheduling next multi-account cycle (isolated from single posting).`);
    scheduleNextSchedulerCycle();
  }

  // Defensive: Normalize local auth/state.json if present on startup
  if (fs.existsSync(st.AUTH_STATE_FILE)) {
    try {
      const content = fs.readFileSync(st.AUTH_STATE_FILE, "utf-8");
      const normalized = normalizeStateJson(content);
      if (normalized !== content) {
        fs.writeFileSync(st.AUTH_STATE_FILE, normalized, "utf-8");
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
      if (req.path.startsWith("/api/") || req.path.startsWith("/output/") || req.path.startsWith("/uploads/")) {
        return next();
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  const gracefulShutdown = async (signal: string) => {
    console.log(`[SERVER] Received ${signal}. Starting graceful shutdown...`);
    try {
      if (st.activeLoginSession && st.activeLoginSession.browser) {
        await st.activeLoginSession.browser.close().catch(() => {});
      }
      if (st.activePostingBrowser) {
        await st.activePostingBrowser.close().catch(() => {});
        st.activePostingBrowser = null;
      }
      releaseProcessLock("all" as any);
    } catch (_) {}
    server.close(() => {
      console.log("[SERVER] HTTP server closed gracefully.");
      process.exit(0);
    });
    setTimeout(() => {
      console.warn("[SERVER] Force exiting process after 5s timeout.");
      process.exit(0);
    }, 5000).unref();
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  startServer();
}

export { app, startServer };
