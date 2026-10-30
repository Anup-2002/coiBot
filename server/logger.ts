import { fs, isTestEnv, type LogEntry } from "./config.ts";
import { st } from "./state.ts";
import { saveSystemLogsCloud } from "../src/storage.ts";

export function getActiveProfileId(): string | null {
  try {
    if (fs.existsSync(st.PROFILES_FILE)) {
      const active = JSON.parse(fs.readFileSync(st.PROFILES_FILE, "utf-8")).find((p: any) => p.isActive);
      return active ? active.id : null;
    }
  } catch (_) {}
  return null;
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
  if (isTestEnv || st.logSyncTimeout) return;
  st.logSyncTimeout = setTimeout(() => {
    st.logSyncTimeout = null;
    saveSystemLogsCloud(st.logs).catch(err => {
      console.error("[FIREBASE] Error syncing logs to cloud:", err.message);
    });
  }, 15000);
}

export function addLog(level: "info" | "success" | "warning" | "error", message: string, profileId?: string | null) {
  if (!message || !message.trim()) return;
  if (st.logs.length > 0 && st.logs[st.logs.length - 1].message === message) {
    return;
  }
  const timestamp = new Date().toLocaleTimeString();
  const targetProfileId = profileId !== undefined ? profileId : getActiveProfileId();
  const entry: LogEntry = { timestamp, level, message, profileId: targetProfileId };
  st.logs.push(entry);
  if (!isTestEnv) {
    console.log(`[${level.toUpperCase()}] ${message}`);
  }
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

