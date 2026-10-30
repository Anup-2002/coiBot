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

