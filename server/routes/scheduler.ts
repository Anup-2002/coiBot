import { fs, path, app, type LogEntry } from "../config.ts";
import { st } from "../state.ts";
import { isSchedulerLogMessage, addLog } from "../logger.ts";
import { getTodayDateString, readJsonFile } from "../files.ts";
import { sessionHasValidCookies, normalizeProfilesWithSchedule } from "../profiles.ts";
import { getLocalBotSettings, saveLocalBotSettings } from "../settings.ts";
import { isSchedulerRunning, isBusy } from "../locks.ts";
import { sendTelegramAlert } from "../alerts.ts";
import { saveProfilesCloud } from "../../src/storage.ts";
import { normalizeProfileSchedule, nextDueAt, getNextPeakTradingSession, type BotSettings, type ScheduleFrequency } from "../../src/utils/scheduler.ts";
import { cancelNextAutomationCycle } from "../posting-loop.ts";
import { updateProfileSchedule, cancelNextSchedulerCycle, scheduleNextSchedulerCycle, runScheduledCycle } from "../scheduler.ts";

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
    schedulerStatus: nextEnabled
      ? (current.schedulerStatus === "paused" ? "paused" : "running")
      : "stopped",
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

let lastSchedulerPauseAt = 0;
let lastSchedulerResumeAt = 0;
let lastSchedulerStopAt = 0;

app.post("/api/scheduler/run-now", (req, res) => {
  const settings = getLocalBotSettings();
  if (!settings.schedulerEnabled && !settings.schedulerSavedPosition) {
    return res.status(400).json({ error: "Scheduler is disabled. Please enable 'Run accounts in sequence' first." });
  }
  if (isBusy() || st.isSchedulerCycleRunning) {
    return res.status(409).json({ error: "Another process or scheduler cycle is already running. Please wait or stop it first." });
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
  const now = Date.now();
  const settings = getLocalBotSettings();
  if (!st.isSchedulerCycleRunning && !settings.schedulerEnabled && !settings.schedulerSavedPosition) {
    return res.status(400).json({ error: "Scheduler is not currently running." });
  }
  if (st.pauseSchedulerRequested || settings.schedulerStatus === "paused" || now - lastSchedulerPauseAt < 250) {
    return res.status(409).json({ error: "Scheduler is already paused or pausing." });
  }
  lastSchedulerPauseAt = now;

  st.pauseSchedulerRequested = true;
  cancelNextSchedulerCycle();
  if (process.env.VITEST) {
    st.isSchedulerCycleRunning = false;
  }

  const allProfiles = normalizeProfilesWithSchedule(readJsonFile<any[]>(st.PROFILES_FILE, []));
  const fallbackQueue = allProfiles.map(p => p.id);
  const queueToSave = st.schedulerQueue.length > 0
    ? st.schedulerQueue
    : (settings.schedulerSavedPosition?.queue?.length ? settings.schedulerSavedPosition.queue : fallbackQueue);
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
  const now = Date.now();
  const currentSettings = getLocalBotSettings();
  if (isBusy() || st.isSchedulerCycleRunning || now - lastSchedulerResumeAt < 250) {
    return res.status(409).json({ error: "Another process or scheduler cycle is already running. Please wait or stop it first." });
  }
  if (currentSettings.schedulerStatus === "running" && !st.pauseSchedulerRequested) {
    return res.status(409).json({ error: "Scheduler is already running." });
  }
  lastSchedulerResumeAt = now;

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
  const now = Date.now();
  if (st.stopSchedulerRequested && now - lastSchedulerStopAt < 250) {
    return res.status(409).json({ error: "Scheduler stop is already in progress." });
  }
  lastSchedulerStopAt = now;
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
    botToken: settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || "",
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
    const token = ((req.query.token as string) || settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || "").trim();
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

