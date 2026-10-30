import { fs } from "./config.ts";import { type GeneratedMessage, type PostResult } from "./config.ts";import { st } from "./state.ts";import { addLog } from "./logger.ts";import { getTodayDateString, readJsonFile, writeJsonFile } from "./files.ts";import { getActiveProfileId, sessionHasValidCookies, updateActiveProfilePaths, getAccountDailyPostLimit, getIsolatedResults } from "./profiles.ts";import { getLocalBotSettings, saveBotProgress, readBotProgress, getRealTimestamps } from "./settings.ts";import { isBusy, touchProcessLock, releaseProcessLock, interruptibleSleep } from "./locks.ts";import { sendTelegramAlert } from "./alerts.ts";import { pruneOldAndCompletedData } from "./sync.ts";import { launchBrowserResilient } from "./browser.ts";import { executeFetchTrending, resolveToFirstPartyUrl } from "./fetch.ts";import { executeGenerateMessages } from "./generate.ts";import { checkLoginReal } from "./login.ts";import { runRealPosting } from "./posting.ts";

export function cancelNextAutomationCycle() {
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

export async function triggerFullFlowExecution() {
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

export function scheduleNextAutomationCycle() {
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

export async function runPostingLoop(options: PostingLoopOptions = {}): Promise<PostingLoopSummary> {
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
