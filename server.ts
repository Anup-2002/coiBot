import express from "express";
import OpenAI from "openai";
import { GoogleGenAI, Type } from "@google/genai";
import {
  fs, path, os, crypto, execSync,
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

import {
  withTimeout,
  installPlaywrightChromium,
  PlaywrightLock,
  launchBrowserResilient,
  saveDebugScreenshot,
  removeBlockingOverlays,
  clickResiliently,
  fillInputResiliently,
  typeWithHumanRhythm,
  locateAndPrepareCommentEditor,
  setupPageResourceBlocking,
  extractFingerprintDetails,
  hasRealAuthCookies,
  isEditorPostButtonRequiringLogin,
} from "./server/browser.ts";
import {
  resolveToFirstPartyUrl,
  fetchTrendingByScrape,
  executeFetchTrending,
} from "./server/fetch.ts";
import {
  formatCommentWithCashtag,
  generateMessagesForCoins,
  executeGenerateMessages,
} from "./server/generate.ts";
import {
  pruneMarketingImages,
  isValidImageBuffer,
  importImagesFromExternalSources,
  runSystemDiagnosticsCheck,
  generateAdminToken,
  verifyAdminRequest,
  escapeCsvField,
} from "./server/health.ts";
export { formatCommentWithCashtag };

import {
  checkLoginRealInternal,
  checkLoginReal,
  executeStartLogin,
  executeSubmitOtp,
  executeCancelLogin,
} from "./server/login.ts";
import {
  runRealPostingInternal,
  runRealPosting,
} from "./server/posting.ts";
import {
  cancelNextAutomationCycle,
  triggerFullFlowExecution,
  scheduleNextAutomationCycle,
  activateProfileInternal,
  runPostingLoop,
  type PostingLoopOptions,
  type PostingLoopSummary,
} from "./server/posting-loop.ts";
import {
  updateProfileLastRun,
  updateProfileSchedule,
  cancelNextSchedulerCycle,
  scheduleNextSchedulerCycle,
  runScheduledCycle,
} from "./server/scheduler.ts";

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
