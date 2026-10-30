import { type SystemProcessType } from "./config.ts";
import { st } from "./state.ts";
import { getLocalBotSettings } from "./settings.ts";

export function touchProcessLock(): void {
  st.activeProcessStartTime = Date.now();
}

export function acquireProcessLock(type: SystemProcessType, description: string): { success: boolean; reason?: string } {
  const now = Date.now();
  if (st.activeSystemProcess !== "none" && st.activeSystemProcess !== type) {
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

