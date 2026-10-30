import { fs, path, app, PORT, OUTPUT_DIR, isOpenAiConfigured, isCmcConfigured, type Coin, type GeneratedMessage } from "../config.ts";
import { st } from "../state.ts";
import { getTodayDateString, readJsonFile } from "../files.ts";
import { isProfileSessionActive, getActiveProfileId, getAccountDailyPostLimit, getIsolatedResults } from "../profiles.ts";
import { getAvailableMarketingImages, getLocalBotSettings, getRealTimestamps, readBotProgress } from "../settings.ts";
import { isSchedulerRunning } from "../locks.ts";
import { syncLocalFromCloudIfStale } from "../sync.ts";
import { getActiveStoreName, isMongoEnabled, isFirebaseDisabled, isMongoPrimary } from "../../src/storage.ts";
import { runSystemDiagnosticsCheck } from "../health.ts";


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
    const { sanitizeMongoUri } = await import("../../src/mongo-db.ts");
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

