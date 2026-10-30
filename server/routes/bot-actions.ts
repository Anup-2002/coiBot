import { fs, path, app, OUTPUT_DIR, type Coin, type GeneratedMessage, type PostResult, type BotProgressData } from "../config.ts";
import { st } from "../state.ts";
import { addLog } from "../logger.ts";
import { readJsonFile, writeJsonFile } from "../files.ts";
import { sessionHasValidCookies, getActiveProfileId, updateActiveProfilePaths, getIsolatedResults } from "../profiles.ts";
import { getLocalBotSettings, saveLocalBotSettings, getRealTimestamps, clearRealTimestamps, readBotProgress, saveBotProgress } from "../settings.ts";
import { acquireProcessLock, releaseProcessLock, isBusy } from "../locks.ts";
import { saveTrendingCoinsCloud, saveGeneratedMessagesCloud, savePostResultsCloud, saveBotProgressCloud } from "../../src/storage.ts";
import { executeFetchTrending, resolveToFirstPartyUrl } from "../fetch.ts";
import { executeGenerateMessages } from "../generate.ts";
import { runRealPosting } from "../posting.ts";
import { cancelNextAutomationCycle, scheduleNextAutomationCycle, runPostingLoop } from "../posting-loop.ts";
import { cancelNextSchedulerCycle } from "../scheduler.ts";

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
    return res.status(409).json({ error: "Cannot trigger manual actions while the Continuous Automation Loop is active." });
  }
  if (st.isPostingRunning || st.isSinglePostingRunning) {
    return res.status(409).json({ error: "Bot posting sequence is already active." });
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
        runPostingLoop().catch((err) => { addLog("error", `Posting runner encountered error: ${(err as Error).message}`); });
      }

      return res.json({
        success: true,
        message: `End-to-End sequence resumed successfully from index ${prevProgress.next_index}. Monitoring logs...`,
      });
    }

    addLog("info", "[FLOW FRESH] All previous coins posted or no previous run. Starting clean full cycle...");
    await writeJsonFile(st.RESULTS_FILE, []);
    saveBotProgress({ next_index: 0 });

    st.isFullFlowAborted = false;

    // Step 1: Fetch
    addLog("info", "[FLOW STEP 1/3] Fetching latest trending coins...");
    st.botStatus = "Fetching";
    await executeFetchTrending();

    if (st.isFullFlowAborted) {
      addLog("warning", "Full automated sequence aborted by user during Fetching phase.");
      st.botStatus = "Idle";
      releaseProcessLock("continuous_loop");
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
    runPostingLoop().catch((err) => { addLog("error", `Posting runner encountered error: ${(err as Error).message}`); });

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
        await writeJsonFile(arcFile, mergedArchive.slice(-3000));
        addLog("info", `[RETENTION ARCHIVE] Safely preserved ${activeResults.length} post records in 7-day archive.`);
      }
    } catch (_) {}

    await writeJsonFile(st.LAST_TRENDING_FILE, []);
    await writeJsonFile(st.GENERATED_MESSAGES_FILE, []);
    await writeJsonFile(st.RESULTS_FILE, []);
    
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
        await writeJsonFile(arcFile, mergedArchive.slice(-3000));
        addLog("info", `[RETENTION] Archived ${currentResults.length} submission records to 7-day historical database.`);
      }
    } catch (arcErr) {
      console.warn("Could not archive existing results prior to reset:", (arcErr as Error).message);
    }

    await writeJsonFile(st.RESULTS_FILE, []);
    
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

