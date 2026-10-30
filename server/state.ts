import path from "path";
import fs from "fs";
import {
  initialOutputDir,
  initialAuthDir,
  type LogEntry,
  type SystemProcessType,
  type LoginSession,
} from "./config.ts";
import {
  saveSettingsCloud,
  saveSystemLogsCloud,
} from "../src/storage.ts";
import {
  normalizeProfileSchedule,
  parseBotSettings,
  type BotSettings,
} from "../src/utils/scheduler.ts";

export const st = {
  OUTPUT_DIR: initialOutputDir,
  AUTH_DIR: initialAuthDir,
  LAST_TRENDING_FILE: path.join(initialOutputDir, "last_trending.json"),
  GENERATED_MESSAGES_FILE: path.join(initialOutputDir, "generated_messages.json"),
  RESULTS_FILE: path.join(initialOutputDir, "results.json"),
  POST_PROGRESS_FILE: path.join(initialOutputDir, "post_progress.json"),
  TIMESTAMPS_FILE: path.join(initialOutputDir, "timestamps.json"),
  AUTH_STATE_FILE: path.join(initialAuthDir, "state.json"),
  PROFILES_FILE: path.join(initialAuthDir, "profiles.json"),
  SETTINGS_FILE: path.join(initialAuthDir, "settings.json"),
  SCHEDULER_LOG_FILE: path.join(initialOutputDir, "scheduler.log"),
  MARKETING_IMAGES_DIR: path.join(initialOutputDir, "marketing_images"),

  logs: [] as LogEntry[],
  schedulerLogsBuffer: [] as LogEntry[],
  logSyncTimeout: null as NodeJS.Timeout | null,
  isInstallingPlaywright: false,

  botStatus: "Idle",
  currentCoinName: "N/A",
  activePostingTimeout: null as NodeJS.Timeout | null,
  currentPostingIndex: 0,
  isPostingRunning: false,
  isSinglePostingRunning: false,
  isSingleStopping: false,
  isGeneratingRunning: false,
  isStopping: false,
  runMode: "Real Browser",

  activeSystemProcess: "none" as SystemProcessType,
  activeProcessDetails: "",
  activeProcessStartTime: 0,

  lastOpenAiError: null as string | null,
  lastGeminiError: null as string | null,

  isContinuousLoopActive: false,
  isFullFlowAborted: false,
  nextCycleStartTime: null as number | null,
  nextCycleTimeout: null as NodeJS.Timeout | null,
  continuousLoopIntervalMinutes: 20,

  activeLoginSession: null as LoginSession | null,
  loginState: {
    status: "idle" as "idle" | "authenticating" | "requires_otp" | "success" | "failed" | "captcha",
    message: "",
  },

  isSchedulerCycleRunning: false,
  currentSchedulerAccountId: null as string | null,
  schedulerQueue: [] as string[],
  stopSchedulerRequested: false,
  pauseSchedulerRequested: false,
  stopSchedulerForceTimer: null as any,
  activePostingBrowser: null as any,
  activePostingPage: null as any,

  lastCloudSavedHash: new Map<string, string>(),
  hydratedProfiles: new Set<string>(),
  lastCloudSyncTime: 0,

  cachedHealthResponse: null as any,
  cachedHealthAt: 0,
  cachedSystemCheckResult: null as any,
  cachedSystemCheckAt: 0,

  activeProfileRunLocks: new Set<string>(),
  activeAdminSessions: new Set<string>(),

  schedulerCycleIntervalMinutes: 360,
  schedulerCycleTimeout: null as NodeJS.Timeout | null,
  nextSchedulerCycleStartTime: null as number | null,
  lastSchedulerCycleStartTime: null as number | null,
};

export const state = st;

export function sessionHasValidCookies(str: string): boolean {
  if (!str || !str.trim()) return false;
  try {
    const parsed = JSON.parse(str);
    const cookies = Array.isArray(parsed) ? parsed : (parsed.cookies || []);
    if (!Array.isArray(cookies) || cookies.length === 0) return false;
    return cookies.some((c: any) =>
      (c.name === "Authorization" && typeof c.value === "string" && c.value.length > 20) ||
      (c.name === "u-prod" && typeof c.value === "string" && c.value.length > 20) ||
      (c.name === "cmc_user_session" && typeof c.value === "string" && c.value.length > 10)
    );
  } catch (_) {
    return false;
  }
}

export function isProfileSessionActive(profileId?: string | null): boolean {
  if (profileId) {
    try {
      if (fs.existsSync(st.PROFILES_FILE)) {
        const profiles = JSON.parse(fs.readFileSync(st.PROFILES_FILE, "utf-8"));
        const target = profiles.find((p: any) => p.id === profileId);
        if (target && target.stateJson && sessionHasValidCookies(target.stateJson)) {
          // If st.AUTH_STATE_FILE is missing on disk and this is the active profile, auto-hydrate it!
          if (target.isActive && !fs.existsSync(st.AUTH_STATE_FILE)) {
            try {
              fs.writeFileSync(st.AUTH_STATE_FILE, target.stateJson, "utf-8");
            } catch (_) {}
          }
          return true;
        }
      }
    } catch (_) {}
  }
  if (fs.existsSync(st.AUTH_STATE_FILE)) {
    try {
      const content = fs.readFileSync(st.AUTH_STATE_FILE, "utf-8");
      if (sessionHasValidCookies(content)) {
        return true;
      }
    } catch (_) {}
  }
  return false;
}

export function getAvailableMarketingImages(): string[] {
  try {
    if (!fs.existsSync(st.MARKETING_IMAGES_DIR)) return [];
    const validExts = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
    return fs.readdirSync(st.MARKETING_IMAGES_DIR)
      .filter(f => validExts.includes(path.extname(f).toLowerCase()))
      .sort();
  } catch (_) {
    return [];
  }
}

export function getNextSingleMarketingImage(): { filename: string; filePath: string } | null {
  const images = getAvailableMarketingImages();
  if (images.length === 0) return null;

  const settings = getLocalBotSettings();
  if (!settings.imageUploadEnabled) return null;

  let selectedIndex = 0;
  if (settings.imageSelectionMode === "random") {
    selectedIndex = Math.floor(Math.random() * images.length);
  } else {
    // Cycle mode: pick current index and increment for next post
    const currentIndex = typeof settings.activeImageIndex === "number" ? settings.activeImageIndex : 0;
    selectedIndex = (currentIndex >= 0 && currentIndex < images.length) ? currentIndex : 0;
    const nextIndex = (selectedIndex + 1) % images.length;
    settings.activeImageIndex = nextIndex;
    saveLocalBotSettings(settings);
  }

  const filename = images[selectedIndex];
  let filePath = path.join(st.MARKETING_IMAGES_DIR, filename);
  if (!fs.existsSync(filePath)) {
    const pubPath = path.join(process.cwd(), "public", "uploads", "marketing_images", filename);
    if (fs.existsSync(pubPath)) {
      filePath = pubPath;
    } else {
      return null;
    }
  }
  return { filename, filePath };
}

export function getLocalBotSettings(): BotSettings {
  try {
    if (fs.existsSync(st.SETTINGS_FILE)) {
      const raw = fs.readFileSync(st.SETTINGS_FILE, "utf-8");
      return parseBotSettings(raw);
    }
  } catch (_) {}
  return { schedulerEnabled: false };
}

export function saveLocalBotSettings(settings: BotSettings): void {
  try {
    fs.writeFileSync(st.SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
  } catch (err) {
    console.error("[SERVER] Error writing settings.json:", err);
  }
  saveSettingsCloud(settings).catch(() => {});
}

export function escapeTelegramHtml(str: string): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const TELEGRAM_ALERT_COOLDOWN_MS = 20 * 60 * 1000; // 20-minute throttle per category
const lastTelegramAlertTimes = new Map<string, number>();
const globalTelegramTimestamps: number[] = [];
const MAX_TELEGRAM_ALERTS_PER_HOUR = 6;

export async function sendTelegramAlert(
  title: string,
  message: string,
  type: "error" | "warning" | "success" | "info" = "info",
  categoryKey?: string,
  force: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    const settings = getLocalBotSettings();
    if (!settings.telegramAlertsEnabled) {
      return { success: false, error: "Telegram alerts are disabled in settings." };
    }
    const token = (settings.telegramBotToken || "8698939017:AAHMbpwBznDWBLDJiW9-ogqvYODXbjA3wGU").trim();
    const chatId = (settings.telegramChatId || "1817931967").trim();
    if (!token || !chatId) {
      return { success: false, error: "Missing Telegram Bot Token or Chat ID." };
    }

    const now = Date.now();

    // Unless forced (e.g. manual user test), enforce strict anti-spam limits
    if (!force) {
      // 1. Category cooldown check
      if (categoryKey) {
        const lastSent = lastTelegramAlertTimes.get(categoryKey);
        if (lastSent && now - lastSent < TELEGRAM_ALERT_COOLDOWN_MS) {
          const remainingMins = Math.ceil((TELEGRAM_ALERT_COOLDOWN_MS - (now - lastSent)) / 60000);
          console.log(`[TELEGRAM] Throttled alert for '${categoryKey}'. Cooldown active for ${remainingMins}m to prevent Telegram spam.`);
          return { success: true };
        }
      }

      // 2. Global hourly limit check
      while (globalTelegramTimestamps.length > 0 && globalTelegramTimestamps[0] < now - 3600000) {
        globalTelegramTimestamps.shift();
      }
      if (globalTelegramTimestamps.length >= MAX_TELEGRAM_ALERTS_PER_HOUR) {
        console.warn(`[TELEGRAM] Throttled alert: Reached maximum emergency limit of ${MAX_TELEGRAM_ALERTS_PER_HOUR} alerts/hour.`);
        return { success: true };
      }
    }

    const icon = type === "error" ? "🚨" : type === "warning" ? "⚠️" : type === "success" ? "✅" : "ℹ️";
    const text = `${icon} <b>${escapeTelegramHtml(title)}</b>\n\n${escapeTelegramHtml(message)}\n\n🕒 <i>${new Date().toLocaleString()}</i>`;

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });
    const data: any = await res.json();
    if (!data.ok) {
      console.error("[TELEGRAM] Error sending alert:", data.description);
      return { success: false, error: data.description };
    }

    if (categoryKey) {
      lastTelegramAlertTimes.set(categoryKey, now);
    }
    globalTelegramTimestamps.push(now);

    return { success: true };
  } catch (err) {
    console.error("[TELEGRAM] Network failure sending alert:", (err as Error).message);
    return false as any;
  }
}

export function normalizeProfilesWithSchedule(profiles: any[]): any[] {
  if (!Array.isArray(profiles)) return [];
  return profiles.map((p, idx) => {
    const { schedule, lastRun } = normalizeProfileSchedule(p, idx + 1);
    let dailyPostLimit = typeof p.dailyPostLimit === "number" && p.dailyPostLimit > 0 ? p.dailyPostLimit : 300;
    // Auto-migrate legacy 500 default to standard 300 cap
    if (dailyPostLimit === 500) dailyPostLimit = 300;
    return {
      ...p,
      dailyPostLimit,
      schedule,
      lastRun,
    };
  });
}

// Ensure st.PROFILES_FILE exists
if (!fs.existsSync(st.PROFILES_FILE)) {
  try {
    fs.writeFileSync(st.PROFILES_FILE, JSON.stringify([], null, 2), "utf-8");
  } catch (err) {
    console.error("[SERVER] Error creating initial profiles file:", err);
  }
}

export function getActiveProfileId(): string | null {
  try {
    if (fs.existsSync(st.PROFILES_FILE)) {
      const profiles = JSON.parse(fs.readFileSync(st.PROFILES_FILE, "utf-8"));
      const active = profiles.find((p: any) => p.isActive);
      return active ? active.id : null;
    }
  } catch (_) {}
  return null;
}

export function getNextImportedAccountName(profiles: any[]): string {
  for (let i = 1; i <= 5; i++) {
    const name = `Imported Account ${i}`;
    if (!profiles.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      return name;
    }
  }
  return `Imported Account ${profiles.length + 1}`;
}

export function ensureProfileDirectory(profileId: string): void {
  if (!profileId) return;
  const dir = path.join(st.OUTPUT_DIR, profileId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const resultsFile = path.join(dir, "results.json");
  if (!fs.existsSync(resultsFile)) {
    fs.writeFileSync(resultsFile, "[]", "utf-8");
  }
  const progressFile = path.join(dir, "post_progress.json");
  if (!fs.existsSync(progressFile)) {
    fs.writeFileSync(progressFile, JSON.stringify({
      next_index: 0,
      daily_post_count: 0,
      daily_post_limit: 300,
      last_post_date: getTodayDateString()
    }, null, 2), "utf-8");
  }
  const tsFile = path.join(dir, "timestamps.json");
  if (!fs.existsSync(tsFile)) {
    fs.writeFileSync(tsFile, JSON.stringify({
      coinsFetchedAt: null,
      coinsFetchedTime: null,
      commentsGeneratedAt: null,
      commentsGeneratedTime: null
    }, null, 2), "utf-8");
  }
}

export function updateActiveProfilePaths() {
  const activeId = getActiveProfileId();
  if (activeId) {
    ensureProfileDirectory(activeId);
    const dir = path.join(st.OUTPUT_DIR, activeId);
    st.LAST_TRENDING_FILE = path.join(dir, "last_trending.json");
    st.GENERATED_MESSAGES_FILE = path.join(dir, "generated_messages.json");
    st.RESULTS_FILE = path.join(dir, "results.json");
    st.POST_PROGRESS_FILE = path.join(dir, "post_progress.json");
    st.TIMESTAMPS_FILE = path.join(dir, "timestamps.json");
  } else {
    st.LAST_TRENDING_FILE = path.join(st.OUTPUT_DIR, "last_trending.json");
    st.GENERATED_MESSAGES_FILE = path.join(st.OUTPUT_DIR, "generated_messages.json");
    st.RESULTS_FILE = path.join(st.OUTPUT_DIR, "results.json");
    st.POST_PROGRESS_FILE = path.join(st.OUTPUT_DIR, "post_progress.json");
    st.TIMESTAMPS_FILE = path.join(st.OUTPUT_DIR, "timestamps.json");
  }
  console.log(`[PATHS] Dynamic paths updated. Active profile: ${activeId || "None"}`);
}

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getActiveProfile(): any | null {
  try {
    if (fs.existsSync(st.PROFILES_FILE)) {
      const profiles = JSON.parse(fs.readFileSync(st.PROFILES_FILE, "utf-8"));
      return profiles.find((p: any) => p.isActive) || null;
    }
  } catch (_) {}
  return null;
}

export function getAccountDailyPostLimit(profileId?: string | null): number {
  if (profileId) {
    try {
      if (fs.existsSync(st.PROFILES_FILE)) {
        const profiles = JSON.parse(fs.readFileSync(st.PROFILES_FILE, "utf-8"));
        const target = profiles.find((p: any) => p.id === profileId);
        if (target && typeof target.dailyPostLimit === "number" && target.dailyPostLimit > 0) {
          if (target.dailyPostLimit === 500) return 300;
          return target.dailyPostLimit;
        }
      }
    } catch (_) {}
  } else {
    const active = getActiveProfile();
    if (active && typeof active.dailyPostLimit === "number" && active.dailyPostLimit > 0) {
      if (active.dailyPostLimit === 500) return 300;
      return active.dailyPostLimit;
    }
  }
  const envVal = Number(process.env.DAILY_POST_LIMIT);
  if (!isNaN(envVal) && envVal > 0) {
    if (envVal === 500) return 300; // Auto-migrate legacy 500 from old .env files
    return envVal;
  }
  return 300; // Configurable daily posting limit default: 300 posts/day
}

export function isSchedulerLogMessage(message: string): boolean {
  return (
    message.includes("[SCHEDULER]") ||
    message.includes("[SYNC]") ||
    message.includes("Sequential") ||
    message.includes("Beginning turn (Account") ||
    message.includes("Turn (Account") ||
    message.includes("Launching automated posting loop") ||
    message.includes("Run finished") ||
    message.includes("Schedule disabled") ||
    message.includes("Schedule not due") ||
    (/^\[[^\]]+\]\s+/.test(message) && (
      message.includes("Successfully submitted comment") ||
      message.includes("Queue verified:") ||
      message.includes("Session verified as ACTIVE") ||
      message.includes("[SESSION HALT]")
    ))
  );
}
export function triggerLogSync() {
  if (st.logSyncTimeout) return;
  st.logSyncTimeout = setTimeout(() => {
    st.logSyncTimeout = null;
    saveSystemLogsCloud(st.logs).catch(err => {
      console.error("[FIREBASE] Error syncing logs to cloud:", err.message);
    });
  }, 15000); // Debounce to 15 seconds to prevent excessive write operations during long posting runs
}

export function addLog(level: "info" | "success" | "warning" | "error", message: string, profileId?: string | null) {
  if (!message || !message.trim()) return;
  // Deduplicate consecutive identical st.logs to prevent clutter
  if (st.logs.length > 0 && st.logs[st.logs.length - 1].message === message) {
    return;
  }
  const timestamp = new Date().toLocaleTimeString();
  const targetProfileId = profileId !== undefined ? profileId : getActiveProfileId();
  const entry: LogEntry = { timestamp, level, message, profileId: targetProfileId };
  st.logs.push(entry);
  console.log(`[${level.toUpperCase()}] ${message}`);
  // Strictly enforce max 200 st.logs cap (ring-buffer) to prevent unbounded memory growth
  while (st.logs.length > 200) {
    st.logs.shift();
  }
  if (isSchedulerLogMessage(message)) {
    st.schedulerLogsBuffer.push(entry);
    while (st.schedulerLogsBuffer.length > 300) {
      st.schedulerLogsBuffer.shift();
    }
    try {
      const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}\n`;
      if (fs.existsSync(st.SCHEDULER_LOG_FILE)) {
        const stats = fs.statSync(st.SCHEDULER_LOG_FILE);
        if (stats.size > 5 * 1024 * 1024) {
          const content = fs.readFileSync(st.SCHEDULER_LOG_FILE, "utf-8");
          const trimmed = content.split("\n").slice(-1000).join("\n");
          fs.writeFileSync(st.SCHEDULER_LOG_FILE, trimmed + "\n", "utf-8");
        }
      }
      fs.appendFileSync(st.SCHEDULER_LOG_FILE, line, "utf-8");
    } catch (_) {}
  }
  triggerLogSync();
}

export function touchProcessLock(): void {
  st.activeProcessStartTime = Date.now();
}

export function acquireProcessLock(type: SystemProcessType, description: string): { success: boolean; reason?: string } {
  const now = Date.now();
  if (st.activeSystemProcess !== "none" && st.activeSystemProcess !== type) {
    // Deadlock prevention & self-healing: detect orphaned locks or expired locks
    const isOrphaned =
      (st.activeSystemProcess === "single_posting" && !st.isSinglePostingRunning && !st.isPostingRunning) ||
      (st.activeSystemProcess === "continuous_loop" && !st.isPostingRunning && !st.isGeneratingRunning && !st.isContinuousLoopActive) ||
      (st.activeSystemProcess === "scheduler_cycle" && !st.isSchedulerCycleRunning) ||
      (st.activeSystemProcess === "generating_comments" && !st.isGeneratingRunning) ||
      ((st.activeSystemProcess === "fetching_coins" || st.activeSystemProcess === "checking_login" || st.activeSystemProcess === "clearing_storage" || st.activeSystemProcess === "retry_single") && now - st.activeProcessStartTime > 3 * 60 * 1000);

    if (isOrphaned) {
      console.warn(`[PROCESS LOCK] Auto-clearing orphaned or halted ${st.activeSystemProcess} lock.`);
      st.activeSystemProcess = "none";
      st.activeProcessDetails = "";
      st.activeProcessStartTime = 0;
    } else if (st.activeProcessStartTime > 0 && now - st.activeProcessStartTime > 60 * 60 * 1000) {
      console.warn(`[PROCESS LOCK] Watchdog auto-clearing stale lock (${st.activeSystemProcess}) held for >60 minutes.`);
      st.activeSystemProcess = "none";
      st.activeProcessDetails = "";
      st.activeProcessStartTime = 0;
    } else {
      const desc = st.activeProcessDetails || st.activeSystemProcess;
      return {
        success: false,
        reason: `Another automated process (${desc}) is currently active. Please wait for it to complete or stop it first.`
      };
    }
  }
  st.activeSystemProcess = type;
  st.activeProcessDetails = description;
  st.activeProcessStartTime = now;
  return { success: true };
}

export function releaseProcessLock(type: SystemProcessType): void {
  if (st.activeSystemProcess === type || type === ("all" as any)) {
    st.activeSystemProcess = "none";
    st.activeProcessDetails = "";
    st.activeProcessStartTime = 0;
  }
}

export async function interruptibleSleep(ms: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (!st.isPostingRunning || st.isStopping || st.isSingleStopping || st.stopSchedulerRequested || st.pauseSchedulerRequested) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}

export function isSchedulerRunning(): boolean {
  if (st.isSchedulerCycleRunning) return true;
  try {
    const s = getLocalBotSettings();
    return s.schedulerStatus === "running" || s.schedulerStatus === "paused";
  } catch (_) {
    return false;
  }
}

export function isBusy(): boolean {
  return (
    st.activeSystemProcess !== "none" ||
    st.botStatus === "Fetching" ||
    st.botStatus === "Generating" ||
    st.botStatus === "Posting" ||
    st.botStatus === "Stopping" ||
    st.botStatus === "Authenticating" ||
    st.botStatus === "Verifying Code" ||
    st.botStatus === "Checking Login" ||
    st.isPostingRunning ||
    st.isSinglePostingRunning ||
    st.isGeneratingRunning ||
    st.isSchedulerCycleRunning
  );
}
export function normalizeStateJson(stateJsonStr: string): string {
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


// Initial update of paths
updateActiveProfilePaths();
