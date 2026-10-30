import type { Coin, GeneratedMessage, LogEntry, PostResult } from "../types";

export const resolveUrl = (url: string): string => {
  const base = (import.meta as any).env?.BASE_URL || "/";
  if (url.startsWith("/")) {
    const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return `${normalizedBase}${url}`;
  }
  return url;
};

export const parseResponseJson = async (res: Response, defaultVal: any = {}): Promise<any> => {
  try {
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await res.text().catch(() => "");
      return { error: text.slice(0, 500) || `HTTP error ${res.status}` };
    }
    return await res.json();
  } catch (err) {
    console.warn("[JSON PARSE] Failed to parse JSON:", err);
    return defaultVal;
  }
};

// High-performance O(1) comparison helpers to eliminate UI freezing and main-thread lag
export function areLogsEqual(prev: LogEntry[], next: LogEntry[]): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  if (prev.length === 0) return true;
  const pLast = prev[prev.length - 1];
  const nLast = next[next.length - 1];
  return pLast?.timestamp === nLast?.timestamp && pLast?.message === nLast?.message && pLast?.level === nLast?.level;
}

export function areCoinsEqual(prev: Coin[], next: Coin[]): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;
  if (prev.length !== next.length) return false;
  if (prev.length === 0) return true;
  // Compare symbols and prices of all coins to detect any ranking, price, or coin membership changes
  for (let i = 0; i < prev.length; i++) {
    const p = prev[i];
    const n = next[i];
    if (p.symbol !== n.symbol || p.price !== n.price || p.change_24h !== n.change_24h || p.cmc_rank !== n.cmc_rank) {
      return false;
    }
  }
  return true;
}

export function areMessagesEqual(prev: GeneratedMessage[], next: GeneratedMessage[]): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;
  if (prev.length !== next.length) return false;
  if (prev.length === 0) return true;
  // Compare symbol, message body and sentiment of all messages so new generated comments immediately render
  for (let i = 0; i < prev.length; i++) {
    const p = prev[i];
    const n = next[i];
    if (p.symbol !== n.symbol || p.message !== n.message || p.sentiment !== n.sentiment) {
      return false;
    }
  }
  return true;
}

export function areResultsEqual(prev: PostResult[], next: PostResult[]): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  if (prev.length === 0) return true;
  const p0 = prev[0];
  const n0 = next[0];
  const pLast = prev[prev.length - 1];
  const nLast = next[next.length - 1];
  return p0?.symbol === n0?.symbol && p0?.status === n0?.status && pLast?.symbol === nLast?.symbol && pLast?.status === nLast?.status && pLast?.timestamp === nLast?.timestamp;
}

export function areProfilesEqual(prev: any[], next: any[]): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  if (prev.length === 0) return true;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i]?.id !== next[i]?.id || prev[i]?.isActive !== next[i]?.isActive || prev[i]?.loginStatus !== next[i]?.loginStatus || prev[i]?.name !== next[i]?.name) {
      return false;
    }
  }
  return true;
}

// User-friendly time age helper to see how fresh or stale fetched coins and generated comments are
export function formatTimeAgo(timestamp: number | null | undefined): { text: string; full: string; isStale: boolean; isVeryStale: boolean; isExpired2Days: boolean; hasTimestamp: boolean } {
  if (!timestamp) {
    return { text: "Previous session", full: "Exact time not recorded in this session", isStale: true, isVeryStale: false, isExpired2Days: false, hasTimestamp: false };
  }
  const time = typeof timestamp === "string" ? new Date(timestamp).getTime() : timestamp;
  if (isNaN(time) || time <= 0) {
    return { text: "Previous session", full: "N/A", isStale: true, isVeryStale: false, isExpired2Days: false, hasTimestamp: false };
  }
  const diffSec = Math.max(0, Math.floor((Date.now() - time) / 1000));
  const full = new Date(time).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
  const isExpired2Days = diffSec >= (48 * 3600);
  if (diffSec < 60) {
    return { text: "Just now (<1m ago)", full, isStale: false, isVeryStale: false, isExpired2Days: false, hasTimestamp: true };
  }
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) {
    return { text: `${mins}m ago`, full, isStale: mins >= 30, isVeryStale: mins >= 60, isExpired2Days: false, hasTimestamp: true };
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) {
    return { text: `${hours}h ${remMins}m ago`, full, isStale: true, isVeryStale: hours >= 3, isExpired2Days: false, hasTimestamp: true };
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return { text: `${days}d ${remHours}h ago`, full, isStale: true, isVeryStale: true, isExpired2Days, hasTimestamp: true };
}

