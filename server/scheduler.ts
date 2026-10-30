import { fs, path } from "./config.ts";
import { type Coin, type GeneratedMessage, type ProfileTimestamps } from "./config.ts";
import {
  st,
  addLog,
  getLocalBotSettings,
  saveLocalBotSettings,
  normalizeProfilesWithSchedule,
  sessionHasValidCookies,
  getTodayDateString,
  isBusy,
  acquireProcessLock,
  releaseProcessLock,
  getActiveProfileId,
  getAccountDailyPostLimit,
  updateActiveProfilePaths,
  sendTelegramAlert,
} from "./state.ts";
import {
  readJsonFile,
  writeJsonFile,
  pruneOldAndCompletedData,
  readBotProgress,
  getIsolatedResults,
} from "./sync.ts";
import { saveProfilesCloud } from "../src/storage.ts";
import {
  normalizeProfileSchedule,
  isDue,
  orderDueAccounts,
  getNextPeakTradingSession,
  type ScheduleFrequency,
  type LastRunStatus,
  type ProfileSchedule,
  type SchedulableProfile,
} from "../src/utils/scheduler.ts";
import { executeFetchTrending } from "./fetch.ts";
import { generateMessagesForCoins } from "./generate.ts";
import { checkLoginReal } from "./login.ts";
import { activateProfileInternal, runPostingLoop } from "./posting-loop.ts";

export function updateProfileLastRun(
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

export function updateProfileSchedule(
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

export function cancelNextSchedulerCycle() {
  if (st.schedulerCycleTimeout) {
    clearTimeout(st.schedulerCycleTimeout);
    st.schedulerCycleTimeout = null;
  }
  st.nextSchedulerCycleStartTime = null;
}

export function scheduleNextSchedulerCycle(delayMsOverride?: number) {
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

export async function runScheduledCycle(): Promise<void> {
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
