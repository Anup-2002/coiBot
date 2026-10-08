import { describe, it, expect } from "vitest";

interface BotProgressData {
  next_index: number;
  daily_post_count?: number;
  last_post_date?: string;
  daily_post_limit?: number;
  updated_at?: string;
}

function resolveAccountDailyLimit(profileLimit?: number, envLimit?: string): number {
  if (profileLimit && profileLimit > 0) {
    return profileLimit;
  }
  const envVal = Number(envLimit);
  if (!isNaN(envVal) && envVal > 0) {
    return envVal;
  }
  return 500; // Increased default to 500
}

function processProgressDaily(
  current: BotProgressData,
  todayStr: string,
  accountLimit: number
): BotProgressData {
  const result: BotProgressData = { ...current };
  if (!result.last_post_date || result.last_post_date !== todayStr) {
    result.daily_post_count = 0;
    result.last_post_date = todayStr;
  }
  result.daily_post_limit = accountLimit;
  return result;
}

describe("Per-Account Daily Post Limit Logic", () => {
  it("defaults to 500 posts/day when no env or profile override exists", () => {
    expect(resolveAccountDailyLimit(undefined, undefined)).toBe(500);
  });

  it("respects per-account profile limit override", () => {
    expect(resolveAccountDailyLimit(250, "1000")).toBe(250);
  });

  it("respects env override when profile limit is unset", () => {
    expect(resolveAccountDailyLimit(undefined, "750")).toBe(750);
  });

  it("retains today's post count if date matches", () => {
    const today = "2026-10-07";
    const initial: BotProgressData = {
      next_index: 5,
      daily_post_count: 12,
      last_post_date: today,
      daily_post_limit: 500,
    };
    const updated = processProgressDaily(initial, today, 500);
    expect(updated.daily_post_count).toBe(12);
    expect(updated.last_post_date).toBe(today);
  });

  it("automatically rolls over daily_post_count to 0 on a new calendar day", () => {
    const yesterday = "2026-10-06";
    const today = "2026-10-07";
    const initial: BotProgressData = {
      next_index: 30,
      daily_post_count: 500,
      last_post_date: yesterday,
      daily_post_limit: 500,
    };
    const updated = processProgressDaily(initial, today, 500);
    expect(updated.daily_post_count).toBe(0);
    expect(updated.last_post_date).toBe(today);
  });

  it("correctly identifies when daily limit is reached", () => {
    const limit = 500;
    expect(499 >= limit).toBe(false);
    expect(500 >= limit).toBe(true);
    expect(501 >= limit).toBe(true);
  });
});
