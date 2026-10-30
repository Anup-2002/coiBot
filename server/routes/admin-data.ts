import {
  fs, path, express, app, PORT, isOpenAiConfigured, isCmcConfigured,
  type Coin, type GeneratedMessage, type PostResult, type BotProgressData, type LogEntry,
} from "../config.ts";
import {
  st, sessionHasValidCookies, isProfileSessionActive,
  getAvailableMarketingImages, getLocalBotSettings, saveLocalBotSettings,
  sendTelegramAlert, normalizeProfilesWithSchedule, getActiveProfileId,
  getNextImportedAccountName, ensureProfileDirectory, updateActiveProfilePaths,
  getTodayDateString, getActiveProfile, getAccountDailyPostLimit,
  isSchedulerLogMessage, addLog, acquireProcessLock, releaseProcessLock,
  isSchedulerRunning, isBusy, normalizeStateJson,
} from "../state.ts";
import {
  getRealTimestamps, clearRealTimestamps, getIsolatedResults,
  readBotProgress, saveBotProgress, pruneOldAndCompletedData,
  readJsonFile, autoSyncSessionToProfiles, writeJsonFileSyncAtomic,
  saveSessionStateCloudIfChanged, saveProfilesCloudIfChanged,
  writeJsonFile, syncLocalFromCloudIfStale,
} from "../sync.ts";
import {
  saveSessionStateCloud, saveTrendingCoinsCloud, saveGeneratedMessagesCloud,
  savePostResultsCloud, saveBotProgressCloud, saveProfilesCloud,
  saveTimestampsCloud, getActiveStoreName, isMongoEnabled,
  isFirebaseDisabled, isMongoPrimary,
} from "../../src/storage.ts";
import {
  normalizeProfileSchedule, isDue, orderDueAccounts, nextDueAt,
  parseBotSettings, DEFAULT_SETTINGS, getNextPeakTradingSession,
  PEAK_TRADING_SESSIONS, type BotSettings, type ScheduleFrequency,
} from "../../src/utils/scheduler.ts";
import {
  pruneMarketingImages, isValidImageBuffer, importImagesFromExternalSources,
  runSystemDiagnosticsCheck, generateAdminToken, verifyAdminRequest, escapeCsvField,
} from "../health.ts";
import { executeFetchTrending, resolveToFirstPartyUrl } from "../fetch.ts";
import { executeGenerateMessages } from "../generate.ts";
import { checkLoginReal, executeStartLogin, executeSubmitOtp, executeCancelLogin } from "../login.ts";
import { runRealPosting } from "../posting.ts";
import {
  cancelNextAutomationCycle, triggerFullFlowExecution, scheduleNextAutomationCycle,
  activateProfileInternal, runPostingLoop,
} from "../posting-loop.ts";
import {
  updateProfileLastRun, updateProfileSchedule, cancelNextSchedulerCycle,
  scheduleNextSchedulerCycle, runScheduledCycle,
} from "../scheduler.ts";

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

