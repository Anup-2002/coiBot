export type ScheduleFrequency = "every_cycle" | "daily" | "weekly" | "custom";

export type LastRunStatus =
  | "completed"
  | "skipped_not_due"
  | "skipped_missing_session"
  | "skipped_expired"
  | "stopped_daily_limit"
  | "stopped_captcha"
  | "stopped_by_user"
  | "failed"
  | null;

export interface ProfileSchedule {
  enabled: boolean;
  frequency: ScheduleFrequency;
  customHours?: number; // 1–720
  order: number;
  useForNow?: boolean; // When checked: use this account for now (e.g. manual weekly check)
}

export interface ProfileLastRun {
  at: string | null;
  status: LastRunStatus;
  posted: number;
  failed: number;
}

export interface SchedulableProfile {
  id: string;
  name: string;
  schedule?: Partial<ProfileSchedule>;
  lastRun?: Partial<ProfileLastRun>;
  [key: string]: any;
}

export interface PeakSession {
  hoursUtc: number;
  minsUtc: number;
  label: string;
}

export const PEAK_TRADING_SESSIONS: PeakSession[] = [
  { hoursUtc: 0, minsUtc: 0, label: "Asia/Tokyo Open (00:00 UTC)" },
  { hoursUtc: 8, minsUtc: 0, label: "Europe/London Open (08:00 UTC)" },
  { hoursUtc: 14, minsUtc: 0, label: "US/New York Open (14:00 UTC)" },
  { hoursUtc: 20, minsUtc: 0, label: "US Close / Asia Pre-Market (20:00 UTC)" },
];

export function getNextPeakTradingSession(now: Date = new Date()): {
  session: PeakSession;
  targetDate: Date;
  delayMs: number;
} {
  const currentUtcHours = now.getUTCHours();
  const currentUtcMins = now.getUTCMinutes();
  const currentTotalMins = currentUtcHours * 60 + currentUtcMins;

  // Look for next session at least 3 minutes in the future
  for (const session of PEAK_TRADING_SESSIONS) {
    const sessionTotalMins = session.hoursUtc * 60 + session.minsUtc;
    if (sessionTotalMins - currentTotalMins >= 3) {
      const targetDate = new Date(now);
      targetDate.setUTCHours(session.hoursUtc, session.minsUtc, 0, 0);
      return {
        session,
        targetDate,
        delayMs: Math.max(1000, targetDate.getTime() - now.getTime()),
      };
    }
  }

  // All 4 sessions today have passed -> Tomorrow's first session (00:00 UTC)
  const tomorrowSession = PEAK_TRADING_SESSIONS[0];
  const targetDate = new Date(now);
  targetDate.setUTCDate(targetDate.getUTCDate() + 1);
  targetDate.setUTCHours(tomorrowSession.hoursUtc, tomorrowSession.minsUtc, 0, 0);
  return {
    session: tomorrowSession,
    targetDate,
    delayMs: Math.max(1000, targetDate.getTime() - now.getTime()),
  };
}

export interface BotSettings {
  schedulerEnabled: boolean;
  schedulerMode?: "peak_hours" | "interval";
  schedulerIntervalMinutes?: number;
  maxCyclesPerDay?: number;
  dailyCycleCount?: number;
  lastCycleDate?: string;
  imageUploadEnabled?: boolean;
  imageSelectionMode?: "cycle" | "random";
  activeImageIndex?: number;
  autoPruneEnabled?: boolean;
  autoPruneLimit?: number;
  autoPruneOldDataEnabled?: boolean;
  dataRetentionDays?: number;
  maxResultsHistoryCount?: number;
  autoPruneCompletedBatches?: boolean;
  telegramAlertsEnabled?: boolean;
  telegramBotToken?: string;
  telegramChatId?: string;
  targetCoinsCount?: number;
  adminAuthEnabled?: boolean;
  adminPassword?: string;
}

export const DEFAULT_SETTINGS: BotSettings = {
  schedulerEnabled: false,
  schedulerMode: "peak_hours",
  schedulerIntervalMinutes: 360,
  maxCyclesPerDay: 4,
  dailyCycleCount: 0,
  lastCycleDate: new Date().toISOString().split("T")[0],
  imageUploadEnabled: false,
  imageSelectionMode: "cycle",
  activeImageIndex: 0,
  autoPruneEnabled: false,
  autoPruneLimit: 30,
  autoPruneOldDataEnabled: true,
  dataRetentionDays: 7,
  maxResultsHistoryCount: 300,
  autoPruneCompletedBatches: true,
  telegramAlertsEnabled: true,
  telegramBotToken: "8698939017:AAHMbpwBznDWBLDJiW9-ogqvYODXbjA3wGU",
  telegramChatId: "1817931967",
  targetCoinsCount: 0,
  adminAuthEnabled: true,
  adminPassword: "admin123",
};

export function parseBotSettings(raw: string | null | undefined): BotSettings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const data = JSON.parse(raw);
    return {
      schedulerEnabled: typeof data.schedulerEnabled === "boolean" ? data.schedulerEnabled : false,
      schedulerMode: data.schedulerMode === "interval" ? "interval" : "peak_hours",
      schedulerIntervalMinutes: typeof data.schedulerIntervalMinutes === "number" && data.schedulerIntervalMinutes >= 1 ? data.schedulerIntervalMinutes : 360,
      maxCyclesPerDay: typeof data.maxCyclesPerDay === "number" && data.maxCyclesPerDay >= 1 ? data.maxCyclesPerDay : 4,
      dailyCycleCount: typeof data.dailyCycleCount === "number" && data.dailyCycleCount >= 0 ? data.dailyCycleCount : 0,
      lastCycleDate: typeof data.lastCycleDate === "string" ? data.lastCycleDate : new Date().toISOString().split("T")[0],
      imageUploadEnabled: typeof data.imageUploadEnabled === "boolean" ? data.imageUploadEnabled : false,
      imageSelectionMode: data.imageSelectionMode === "random" ? "random" : "cycle",
      activeImageIndex: typeof data.activeImageIndex === "number" && !isNaN(data.activeImageIndex) ? data.activeImageIndex : 0,
      autoPruneEnabled: typeof data.autoPruneEnabled === "boolean" ? data.autoPruneEnabled : false,
      autoPruneLimit: typeof data.autoPruneLimit === "number" && data.autoPruneLimit > 0 ? data.autoPruneLimit : 30,
      autoPruneOldDataEnabled: typeof data.autoPruneOldDataEnabled === "boolean" ? data.autoPruneOldDataEnabled : true,
      dataRetentionDays: typeof data.dataRetentionDays === "number" && data.dataRetentionDays > 0 ? data.dataRetentionDays : 7,
      maxResultsHistoryCount: typeof data.maxResultsHistoryCount === "number" && data.maxResultsHistoryCount > 0 ? data.maxResultsHistoryCount : 300,
      autoPruneCompletedBatches: typeof data.autoPruneCompletedBatches === "boolean" ? data.autoPruneCompletedBatches : true,
      telegramAlertsEnabled: typeof data.telegramAlertsEnabled === "boolean" ? data.telegramAlertsEnabled : true,
      telegramBotToken: typeof data.telegramBotToken === "string" ? data.telegramBotToken : "8698939017:AAHMbpwBznDWBLDJiW9-ogqvYODXbjA3wGU",
      telegramChatId: typeof data.telegramChatId === "string" ? data.telegramChatId : "1817931967",
      targetCoinsCount: typeof data.targetCoinsCount === "number" ? data.targetCoinsCount : 0,
      adminAuthEnabled: typeof data.adminAuthEnabled === "boolean" ? data.adminAuthEnabled : true,
      adminPassword: typeof data.adminPassword === "string" && data.adminPassword.trim() ? data.adminPassword.trim() : (process.env.ADMIN_PASSWORD || "admin123"),
    };
  } catch (_) {
    return { ...DEFAULT_SETTINGS };
  }
}

export function normalizeProfileSchedule(
  profile: SchedulableProfile,
  fallbackOrder = 1
): { schedule: ProfileSchedule; lastRun: ProfileLastRun } {
  const rawSchedule = profile.schedule || {};
  const rawLastRun = profile.lastRun || {};

  const validFrequencies: ScheduleFrequency[] = ["every_cycle", "daily", "weekly", "custom"];
  const frequency: ScheduleFrequency =
    rawSchedule.frequency && validFrequencies.includes(rawSchedule.frequency)
      ? rawSchedule.frequency
      : "every_cycle";

  let customHours: number | undefined = undefined;
  if (typeof rawSchedule.customHours === "number" && !isNaN(rawSchedule.customHours)) {
    customHours = Math.min(720, Math.max(1, Math.round(rawSchedule.customHours)));
  } else if (frequency === "custom") {
    customHours = 24;
  }

  const schedule: ProfileSchedule = {
    enabled: rawSchedule.enabled !== false,
    frequency,
    ...(customHours !== undefined ? { customHours } : {}),
    order:
      typeof rawSchedule.order === "number" && !isNaN(rawSchedule.order)
        ? rawSchedule.order
        : fallbackOrder,
    useForNow: typeof rawSchedule.useForNow === "boolean" ? rawSchedule.useForNow : false,
  };

  const validStatuses: LastRunStatus[] = [
    "completed",
    "skipped_not_due",
    "skipped_missing_session",
    "skipped_expired",
    "stopped_daily_limit",
    "stopped_captcha",
    "stopped_by_user",
    "failed",
  ];

  const status: LastRunStatus =
    rawLastRun.status && validStatuses.includes(rawLastRun.status as LastRunStatus)
      ? (rawLastRun.status as LastRunStatus)
      : null;

  const lastRun: ProfileLastRun = {
    at: typeof rawLastRun.at === "string" && rawLastRun.at ? rawLastRun.at : null,
    status,
    posted: typeof rawLastRun.posted === "number" && !isNaN(rawLastRun.posted) ? rawLastRun.posted : 0,
    failed: typeof rawLastRun.failed === "number" && !isNaN(rawLastRun.failed) ? rawLastRun.failed : 0,
  };

  return { schedule, lastRun };
}

/**
 * Checks whether an account is due to run.
 * Rules:
 * - Disabled -> false
 * - every_cycle -> true
 * - daily -> never run (lastRunAt == null) or >= 24 h since last run
 * - weekly -> never run or >= 7 days
 * - custom -> never run or >= customHours
 */
export function isDue(
  schedule: ProfileSchedule,
  lastRunAt: string | null | undefined,
  nowInput: Date | number | string = new Date()
): boolean {
  if (!schedule || schedule.enabled === false) {
    return false;
  }

  // If user manually checked "use this account for now" (e.g. weekly manual check), it is due immediately!
  if (schedule.useForNow === true) {
    return true;
  }

  if (schedule.frequency === "every_cycle") {
    return true;
  }

  if (!lastRunAt) {
    return true;
  }

  const lastRunTime = new Date(lastRunAt).getTime();
  if (isNaN(lastRunTime)) {
    return true;
  }

  const nowTime = nowInput instanceof Date ? nowInput.getTime() : new Date(nowInput).getTime();
  if (isNaN(nowTime)) {
    return true;
  }

  const diffMs = nowTime - lastRunTime;

  if (schedule.frequency === "daily") {
    const requiredMs = 24 * 60 * 60 * 1000;
    return diffMs >= requiredMs;
  }

  if (schedule.frequency === "weekly") {
    const requiredMs = 7 * 24 * 60 * 60 * 1000;
    return diffMs >= requiredMs;
  }

  if (schedule.frequency === "custom") {
    const hours = typeof schedule.customHours === "number" && schedule.customHours >= 1 ? schedule.customHours : 24;
    const requiredMs = hours * 60 * 60 * 1000;
    return diffMs >= requiredMs;
  }

  return true;
}

/**
 * Orders due accounts for the scheduled cycle.
 * Criteria: enabled + due + sorted by schedule.order, ties broken by name.
 */
export function orderDueAccounts<T extends SchedulableProfile>(
  profiles: T[],
  nowInput: Date | number | string = new Date()
): T[] {
  if (!Array.isArray(profiles)) return [];

  const candidates: { profile: T; schedule: ProfileSchedule; lastRun: ProfileLastRun }[] = [];

  profiles.forEach((p, idx) => {
    const { schedule, lastRun } = normalizeProfileSchedule(p, idx + 1);
    if (schedule.enabled && isDue(schedule, lastRun.at, nowInput)) {
      candidates.push({ profile: p, schedule, lastRun });
    }
  });

  candidates.sort((a, b) => {
    if (a.schedule.order !== b.schedule.order) {
      return a.schedule.order - b.schedule.order;
    }
    return (a.profile.name || "").localeCompare(b.profile.name || "");
  });

  return candidates.map((c) => c.profile);
}

/**
 * Calculates next timestamp when the account will be due.
 * For display in UI.
 */
export function nextDueAt(
  schedule: ProfileSchedule,
  lastRunAt: string | null | undefined
): string | null {
  if (!schedule || schedule.enabled === false) {
    return null;
  }

  if (schedule.frequency === "every_cycle") {
    return null;
  }

  if (!lastRunAt) {
    return null;
  }

  const lastRunTime = new Date(lastRunAt).getTime();
  if (isNaN(lastRunTime)) {
    return null;
  }

  let intervalMs = 0;
  if (schedule.frequency === "daily") {
    intervalMs = 24 * 60 * 60 * 1000;
  } else if (schedule.frequency === "weekly") {
    intervalMs = 7 * 24 * 60 * 60 * 1000;
  } else if (schedule.frequency === "custom") {
    const hours = typeof schedule.customHours === "number" && schedule.customHours >= 1 ? schedule.customHours : 24;
    intervalMs = hours * 60 * 60 * 1000;
  } else {
    return null;
  }

  return new Date(lastRunTime + intervalMs).toISOString();
}

export interface ScheduledCycleDeps {
  fetchTrending: () => Promise<any[]>;
  generateComments: (coins: any[]) => Promise<any[]>;
  getProfiles: () => SchedulableProfile[];
  hasValidSession: (profile: SchedulableProfile) => boolean;
  activateProfile: (id: string) => Promise<void>;
  checkLogin?: (profile: SchedulableProfile) => Promise<{ status: string; message?: string }>;
  isDailyLimitReached?: (profile: SchedulableProfile) => boolean;
  prepareAccountWorkspace?: (profile: SchedulableProfile, coins: any[], messages: any[]) => Promise<void> | void;
  runPosting: (profile: SchedulableProfile) => Promise<{ posted: number; failed: number; stopReason: LastRunStatus }>;
  saveProfileLastRun: (id: string, lastRun: ProfileLastRun) => Promise<void> | void;
  log: (level: "info" | "success" | "warning" | "error", message: string) => void;
  isStopRequested: () => boolean;
  isCycleRunning: () => boolean;
  setCycleRunning: (running: boolean) => void;
  isBusy?: () => boolean;
  isSchedulerEnabled: () => boolean;
  onCycleComplete?: () => void;
  now?: () => Date;
  setCurrentAccountId?: (id: string | null) => void;
  setQueue?: (ids: string[]) => void;
}

/**
 * Pure sequential runner core that executes scheduled cycle across due accounts.
 * Accounts run strictly one at a time, never in parallel.
 */
export async function runSequentialScheduledCycleCore(deps: ScheduledCycleDeps): Promise<void> {
  if (deps.isCycleRunning()) {
    deps.log("warning", "[SCHEDULER] A scheduled multi-account cycle is already running. Skipping overlapping execution.");
    return;
  }

  if (deps.isBusy && deps.isBusy()) {
    deps.log("warning", "[SCHEDULER] System is currently busy with another automated task. Cannot start scheduled cycle.");
    return;
  }

  if (!deps.isSchedulerEnabled()) {
    deps.log("info", "[SCHEDULER] Scheduler is disabled in settings. Skipping cycle.");
    return;
  }

  deps.setCycleRunning(true);

  try {
    deps.log("info", "==================================================");
    deps.log("info", "[SCHEDULER] Starting sequential multi-account cycle...");
    deps.log("info", "==================================================");

    // 1. Fetch trending coins ONCE
    let coins: any[] = [];
    try {
      deps.log("info", "[SCHEDULER] Fetching trending coins from CoinMarketCap for this cycle...");
      coins = await deps.fetchTrending();
      if (!coins || coins.length === 0) {
        throw new Error("No trending coins returned from fetch endpoint.");
      }
    } catch (fetchErr) {
      deps.log("error", `[SCHEDULER] Failed to fetch trending coins: ${(fetchErr as Error).message}. Marking cycle failed.`);
      deps.onCycleComplete?.();
      return;
    }

    if (deps.isStopRequested()) {
      deps.log("warning", "[SCHEDULER] Cycle stopped by user after fetching.");
      deps.onCycleComplete?.();
      return;
    }

    // 2. Generate comments ONCE for the coin list
    let messages: any[] = [];
    try {
      deps.log("info", `[SCHEDULER] Generating comments for ${coins.length} coins once for all accounts...`);
      messages = await deps.generateComments(coins);
      if (!messages || messages.length === 0) {
        throw new Error("No comments were generated.");
      }
    } catch (genErr) {
      deps.log("error", `[SCHEDULER] Failed to generate comments: ${(genErr as Error).message}. Marking cycle failed.`);
      deps.onCycleComplete?.();
      return;
    }

    if (deps.isStopRequested()) {
      deps.log("warning", "[SCHEDULER] Cycle stopped by user after comment generation.");
      deps.onCycleComplete?.();
      return;
    }

    // 3. Due accounts calculation
    const nowDate = deps.now ? deps.now() : new Date();
    const profiles = deps.getProfiles();
    const dueAccounts = orderDueAccounts(profiles, nowDate);

    // Log status for accounts not due
    profiles.forEach(p => {
      const { schedule, lastRun } = normalizeProfileSchedule(p);
      if (!schedule.enabled) {
        deps.log("info", `[${p.name}] Schedule disabled. Skipped.`);
      } else if (!isDue(schedule, lastRun.at, nowDate)) {
        deps.log("info", `[${p.name}] Schedule not due (${schedule.frequency}). Status: skipped_not_due.`);
      }
    });

    deps.setQueue?.(dueAccounts.map(a => a.id));
    deps.log("info", `[SCHEDULER] Due queue (${dueAccounts.length} accounts): ${dueAccounts.map(a => a.name).join(" -> ") || "No accounts due"}`);

    if (dueAccounts.length === 0) {
      deps.log("info", "[SCHEDULER] No accounts are currently due. Cycle complete.");
      deps.onCycleComplete?.();
      return;
    }

    // 4. Sequential execution of each due account
    for (let idx = 0; idx < dueAccounts.length; idx++) {
      const account = dueAccounts[idx];
      deps.setCurrentAccountId?.(account.id);

      // a. Stop requested check
      if (deps.isStopRequested()) {
        deps.log("warning", `[SCHEDULER] Stop requested by user. Skipping remaining ${dueAccounts.length - idx} accounts in queue.`);
        break;
      }

      deps.log("info", `--------------------------------------------------`);
      deps.log("info", `[${account.name}] Beginning turn (Account ${idx + 1}/${dueAccounts.length})...`);

      // b. Valid session check
      if (!deps.hasValidSession(account)) {
        deps.log("warning", `[${account.name}] Missing or invalid session cookies. Status: skipped_missing_session.`);
        await deps.saveProfileLastRun(account.id, {
          at: new Date().toISOString(),
          status: "skipped_missing_session",
          posted: 0,
          failed: 0,
        });
        continue;
      }

      // c. Activate profile
      try {
        await deps.activateProfile(account.id);
      } catch (actErr) {
        deps.log("error", `[${account.name}] Failed to activate profile: ${(actErr as Error).message}`);
        await deps.saveProfileLastRun(account.id, {
          at: new Date().toISOString(),
          status: "failed",
          posted: 0,
          failed: 0,
        });
        continue;
      }

      // d. Login pre-check if provided
      if (deps.checkLogin) {
        try {
          deps.log("info", `[${account.name}] Verifying live session status...`);
          const loginCheck = await deps.checkLogin(account);
          if (loginCheck.status === "captcha") {
            deps.log("error", `[${account.name}] Captcha detected during pre-check. Status: stopped_captcha.`);
            await deps.saveProfileLastRun(account.id, {
              at: new Date().toISOString(),
              status: "stopped_captcha",
              posted: 0,
              failed: 0,
            });
            continue;
          } else if (loginCheck.status === "expired" || loginCheck.status === "failed") {
            deps.log("warning", `[${account.name}] Session check expired (${loginCheck.message}). Status: skipped_expired.`);
            await deps.saveProfileLastRun(account.id, {
              at: new Date().toISOString(),
              status: "skipped_expired",
              posted: 0,
              failed: 0,
            });
            continue;
          }
        } catch (checkErr) {
          deps.log("warning", `[${account.name}] Session pre-check warning: ${(checkErr as Error).message}. Attempting post run.`);
        }
      }

      // e. Daily limit check
      if (deps.isDailyLimitReached && deps.isDailyLimitReached(account)) {
        deps.log("warning", `[${account.name}] Account reached daily limit. Status: stopped_daily_limit.`);
        await deps.saveProfileLastRun(account.id, {
          at: new Date().toISOString(),
          status: "stopped_daily_limit",
          posted: 0,
          failed: 0,
        });
        continue;
      }

      // f. Prepare workspace
      if (deps.prepareAccountWorkspace) {
        await deps.prepareAccountWorkspace(account, coins, messages);
      }

      // g. Run posting loop
      deps.log("info", `[${account.name}] Launching automated posting loop for ${messages.length} coins...`);
      const summary = await deps.runPosting(account);

      // h. Save lastRun
      const finalStatus = deps.isStopRequested() ? "stopped_by_user" : summary.stopReason;
      await deps.saveProfileLastRun(account.id, {
        at: new Date().toISOString(),
        status: finalStatus,
        posted: summary.posted,
        failed: summary.failed,
      });

      if (account.schedule?.useForNow) {
        account.schedule.useForNow = false;
      }

      // i. One line summary
      deps.log("success", `[${account.name}] Run finished: ${summary.posted} posted, ${summary.failed} failed. Status: ${finalStatus}.`);
    }

    deps.log("info", "==================================================");
    deps.log("success", "[SCHEDULER] Sequential multi-account scheduled cycle finished.");
  } catch (err) {
    deps.log("error", `[SCHEDULER] Fatal error in scheduled cycle: ${(err as Error).message}`);
  } finally {
    deps.setCycleRunning(false);
    deps.setCurrentAccountId?.(null);
    deps.setQueue?.([]);
    deps.onCycleComplete?.();
  }
}

