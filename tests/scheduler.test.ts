import { describe, it, expect } from "vitest";
import {
  isDue,
  orderDueAccounts,
  nextDueAt,
  normalizeProfileSchedule,
  ProfileSchedule,
  SchedulableProfile,
} from "../src/utils/scheduler";

describe("src/utils/scheduler - Part 1 Unit Tests", () => {
  describe("isDue", () => {
    const baseNow = new Date("2026-10-09T12:00:00Z");

    it("returns false when schedule is disabled", () => {
      const schedule: ProfileSchedule = { enabled: false, frequency: "every_cycle", order: 1 };
      expect(isDue(schedule, null, baseNow)).toBe(false);
      expect(isDue(schedule, "2026-10-01T00:00:00Z", baseNow)).toBe(false);
    });

    it("returns true for every_cycle regardless of lastRunAt", () => {
      const schedule: ProfileSchedule = { enabled: true, frequency: "every_cycle", order: 1 };
      expect(isDue(schedule, null, baseNow)).toBe(true);
      expect(isDue(schedule, "2026-10-09T11:59:00Z", baseNow)).toBe(true);
    });

    it("handles daily frequency correctly (never run, before boundary, exactly on boundary, after boundary)", () => {
      const schedule: ProfileSchedule = { enabled: true, frequency: "daily", order: 1 };

      // Never run -> due
      expect(isDue(schedule, null, baseNow)).toBe(true);
      expect(isDue(schedule, undefined, baseNow)).toBe(true);

      // 23 hours ago -> not due
      const twentyThreeHoursAgo = new Date(baseNow.getTime() - 23 * 3600 * 1000).toISOString();
      expect(isDue(schedule, twentyThreeHoursAgo, baseNow)).toBe(false);

      // Exactly 24 hours ago (boundary) -> due
      const exactly24HoursAgo = new Date(baseNow.getTime() - 24 * 3600 * 1000).toISOString();
      expect(isDue(schedule, exactly24HoursAgo, baseNow)).toBe(true);

      // 25 hours ago -> due
      const twentyFiveHoursAgo = new Date(baseNow.getTime() - 25 * 3600 * 1000).toISOString();
      expect(isDue(schedule, twentyFiveHoursAgo, baseNow)).toBe(true);
    });

    it("handles weekly frequency correctly (never run, before 7 days, exactly 7 days, after 7 days)", () => {
      const schedule: ProfileSchedule = { enabled: true, frequency: "weekly", order: 1 };

      // Never run -> due
      expect(isDue(schedule, null, baseNow)).toBe(true);

      // 6 days and 23 hours ago -> not due
      const sixDaysAgo = new Date(baseNow.getTime() - (7 * 24 * 3600 * 1000 - 1000)).toISOString();
      expect(isDue(schedule, sixDaysAgo, baseNow)).toBe(false);

      // Exactly 7 days ago (boundary) -> due
      const exactlySevenDaysAgo = new Date(baseNow.getTime() - 7 * 24 * 3600 * 1000).toISOString();
      expect(isDue(schedule, exactlySevenDaysAgo, baseNow)).toBe(true);

      // 8 days ago -> due
      const eightDaysAgo = new Date(baseNow.getTime() - 8 * 24 * 3600 * 1000).toISOString();
      expect(isDue(schedule, eightDaysAgo, baseNow)).toBe(true);

      // When useForNow is true (manual weekly check), account is immediately due even if only 2 days ago
      const scheduleWithManualCheck: ProfileSchedule = { enabled: true, frequency: "weekly", order: 1, useForNow: true };
      const twoDaysAgo = new Date(baseNow.getTime() - 2 * 24 * 3600 * 1000).toISOString();
      expect(isDue(scheduleWithManualCheck, twoDaysAgo, baseNow)).toBe(true);
    });

    it("handles custom hours frequency correctly", () => {
      const schedule: ProfileSchedule = { enabled: true, frequency: "custom", customHours: 12, order: 1 };

      // Never run -> due
      expect(isDue(schedule, null, baseNow)).toBe(true);

      // 11 hours ago -> not due
      const elevenHoursAgo = new Date(baseNow.getTime() - 11 * 3600 * 1000).toISOString();
      expect(isDue(schedule, elevenHoursAgo, baseNow)).toBe(false);

      // Exactly 12 hours ago -> due
      const exactly12HoursAgo = new Date(baseNow.getTime() - 12 * 3600 * 1000).toISOString();
      expect(isDue(schedule, exactly12HoursAgo, baseNow)).toBe(true);
    });
  });

  describe("orderDueAccounts", () => {
    const baseNow = new Date("2026-10-09T12:00:00Z");

    it("orders due accounts by schedule.order, breaks ties by name, and excludes disabled & not-due", () => {
      const profiles: SchedulableProfile[] = [
        {
          id: "acc-3",
          name: "Charlie",
          schedule: { enabled: true, frequency: "every_cycle", order: 3 },
          lastRun: { at: null, status: null, posted: 0, failed: 0 },
        },
        {
          id: "acc-disabled",
          name: "Disabled Account",
          schedule: { enabled: false, frequency: "every_cycle", order: 1 },
          lastRun: { at: null, status: null, posted: 0, failed: 0 },
        },
        {
          id: "acc-not-due",
          name: "Not Due Weekly",
          schedule: { enabled: true, frequency: "weekly", order: 1 },
          lastRun: { at: new Date(baseNow.getTime() - 2 * 24 * 3600 * 1000).toISOString(), status: "completed", posted: 5, failed: 0 },
        },
        {
          id: "acc-1b",
          name: "Bob",
          schedule: { enabled: true, frequency: "daily", order: 2 },
          lastRun: { at: new Date(baseNow.getTime() - 30 * 3600 * 1000).toISOString(), status: "completed", posted: 2, failed: 0 },
        },
        {
          id: "acc-1a",
          name: "Alice",
          schedule: { enabled: true, frequency: "every_cycle", order: 2 },
          lastRun: { at: null, status: null, posted: 0, failed: 0 },
        },
        {
          id: "acc-first",
          name: "Primary",
          schedule: { enabled: true, frequency: "every_cycle", order: 1 },
          lastRun: { at: null, status: null, posted: 0, failed: 0 },
        },
      ];

      const ordered = orderDueAccounts(profiles, baseNow);

      // Expected order:
      // 1. Primary (order 1)
      // 2. Alice (order 2, ties broken by name 'Alice' vs 'Bob')
      // 3. Bob (order 2)
      // 4. Charlie (order 3)
      // (acc-disabled excluded, acc-not-due excluded)
      expect(ordered.map((p) => p.name)).toEqual(["Primary", "Alice", "Bob", "Charlie"]);
    });
  });

  describe("nextDueAt", () => {
    it("returns null for disabled and every_cycle and never run", () => {
      expect(nextDueAt({ enabled: false, frequency: "daily", order: 1 }, "2026-10-09T00:00:00Z")).toBeNull();
      expect(nextDueAt({ enabled: true, frequency: "every_cycle", order: 1 }, "2026-10-09T00:00:00Z")).toBeNull();
      expect(nextDueAt({ enabled: true, frequency: "daily", order: 1 }, null)).toBeNull();
    });

    it("calculates exact next due time for daily, weekly, and custom", () => {
      const lastRun = "2026-10-09T10:00:00.000Z";

      // Daily (+24h)
      expect(nextDueAt({ enabled: true, frequency: "daily", order: 1 }, lastRun)).toBe("2026-10-10T10:00:00.000Z");

      // Weekly (+7d)
      expect(nextDueAt({ enabled: true, frequency: "weekly", order: 1 }, lastRun)).toBe("2026-10-16T10:00:00.000Z");

      // Custom 48h
      expect(nextDueAt({ enabled: true, frequency: "custom", customHours: 48, order: 1 }, lastRun)).toBe("2026-10-11T10:00:00.000Z");
    });
  });

  describe("normalizeProfileSchedule", () => {
    it("applies defaults for profile missing schedule/lastRun", () => {
      const normalized = normalizeProfileSchedule({ id: "p1", name: "Profile 1" }, 2);
      expect(normalized.schedule).toEqual({
        enabled: true,
        frequency: "every_cycle",
        order: 2,
        useForNow: false,
      });
      expect(normalized.lastRun).toEqual({
        at: null,
        status: null,
        posted: 0,
        failed: 0,
      });
    });
  });

  describe("Settings store default", () => {
    it("defaults schedulerEnabled to false when the file is missing or null", async () => {
      const { parseBotSettings } = await import("../src/utils/scheduler");
      expect(parseBotSettings(null)).toEqual({ schedulerEnabled: false });
      expect(parseBotSettings(undefined)).toEqual({ schedulerEnabled: false });
      expect(parseBotSettings("")).toEqual({ schedulerEnabled: false });
      expect(parseBotSettings("{}")).toEqual({ schedulerEnabled: false });
      expect(parseBotSettings(JSON.stringify({ schedulerEnabled: true }))).toEqual({ schedulerEnabled: true });
    });
  });

  describe("Runner logic (runSequentialScheduledCycleCore)", () => {
    const fakeCoins = [{ name: "Bitcoin", symbol: "BTC" }];
    const fakeMessages = [{ name: "Bitcoin", symbol: "BTC", message: "Great project $BTC" }];

    it("runs accounts strictly one after another (asserting no overlap)", async () => {
      const { runSequentialScheduledCycleCore } = await import("../src/utils/scheduler");

      const executions: { id: string; start: number; end: number }[] = [];
      const savedRuns: Record<string, any> = {};
      let isRunning = false;

      const profiles: SchedulableProfile[] = [
        { id: "acc-1", name: "Account 1", schedule: { enabled: true, frequency: "every_cycle", order: 1 } },
        { id: "acc-2", name: "Account 2", schedule: { enabled: true, frequency: "every_cycle", order: 2 } },
        { id: "acc-3", name: "Account 3", schedule: { enabled: true, frequency: "every_cycle", order: 3 } },
      ];

      await runSequentialScheduledCycleCore({
        fetchTrending: async () => fakeCoins,
        generateComments: async () => fakeMessages,
        getProfiles: () => profiles,
        hasValidSession: () => true,
        activateProfile: async () => {},
        runPosting: async (profile) => {
          const start = Date.now();
          await new Promise((resolve) => setTimeout(resolve, 25));
          const end = Date.now();
          executions.push({ id: profile.id, start, end });
          return { posted: 1, failed: 0, stopReason: "completed" };
        },
        saveProfileLastRun: (id, lastRun) => {
          savedRuns[id] = lastRun;
        },
        log: () => {},
        isStopRequested: () => false,
        isCycleRunning: () => isRunning,
        setCycleRunning: (r) => { isRunning = r; },
        isSchedulerEnabled: () => true,
      });

      expect(executions).toHaveLength(3);
      expect(executions.map((e) => e.id)).toEqual(["acc-1", "acc-2", "acc-3"]);
      expect(executions[1].start).toBeGreaterThanOrEqual(executions[0].end);
      expect(executions[2].start).toBeGreaterThanOrEqual(executions[1].end);

      expect(savedRuns["acc-1"].status).toBe("completed");
      expect(savedRuns["acc-2"].status).toBe("completed");
      expect(savedRuns["acc-3"].status).toBe("completed");
    });

    it("skips an account with missing session and continues with the next", async () => {
      const { runSequentialScheduledCycleCore } = await import("../src/utils/scheduler");

      const executedIds: string[] = [];
      const savedRuns: Record<string, any> = {};
      let isRunning = false;

      const profiles: SchedulableProfile[] = [
        { id: "acc-1", name: "Account 1", schedule: { enabled: true, frequency: "every_cycle", order: 1 } },
        { id: "acc-2-missing", name: "Account 2 Missing", schedule: { enabled: true, frequency: "every_cycle", order: 2 } },
        { id: "acc-3", name: "Account 3", schedule: { enabled: true, frequency: "every_cycle", order: 3 } },
      ];

      await runSequentialScheduledCycleCore({
        fetchTrending: async () => fakeCoins,
        generateComments: async () => fakeMessages,
        getProfiles: () => profiles,
        hasValidSession: (p) => p.id !== "acc-2-missing",
        activateProfile: async () => {},
        runPosting: async (profile) => {
          executedIds.push(profile.id);
          return { posted: 1, failed: 0, stopReason: "completed" };
        },
        saveProfileLastRun: (id, lastRun) => {
          savedRuns[id] = lastRun;
        },
        log: () => {},
        isStopRequested: () => false,
        isCycleRunning: () => isRunning,
        setCycleRunning: (r) => { isRunning = r; },
        isSchedulerEnabled: () => true,
      });

      expect(executedIds).toEqual(["acc-1", "acc-3"]);
      expect(savedRuns["acc-2-missing"].status).toBe("skipped_missing_session");
      expect(savedRuns["acc-1"].status).toBe("completed");
      expect(savedRuns["acc-3"].status).toBe("completed");
    });

    it("continues running remaining accounts when an account fails", async () => {
      const { runSequentialScheduledCycleCore } = await import("../src/utils/scheduler");

      const executedIds: string[] = [];
      const savedRuns: Record<string, any> = {};
      let isRunning = false;

      const profiles: SchedulableProfile[] = [
        { id: "acc-1-fail", name: "Account 1 Fails", schedule: { enabled: true, frequency: "every_cycle", order: 1 } },
        { id: "acc-2-ok", name: "Account 2 OK", schedule: { enabled: true, frequency: "every_cycle", order: 2 } },
      ];

      await runSequentialScheduledCycleCore({
        fetchTrending: async () => fakeCoins,
        generateComments: async () => fakeMessages,
        getProfiles: () => profiles,
        hasValidSession: () => true,
        activateProfile: async () => {},
        runPosting: async (profile) => {
          executedIds.push(profile.id);
          if (profile.id === "acc-1-fail") {
            return { posted: 0, failed: 3, stopReason: "failed" };
          }
          return { posted: 1, failed: 0, stopReason: "completed" };
        },
        saveProfileLastRun: (id, lastRun) => {
          savedRuns[id] = lastRun;
        },
        log: () => {},
        isStopRequested: () => false,
        isCycleRunning: () => isRunning,
        setCycleRunning: (r) => { isRunning = r; },
        isSchedulerEnabled: () => true,
      });

      expect(executedIds).toEqual(["acc-1-fail", "acc-2-ok"]);
      expect(savedRuns["acc-1-fail"].status).toBe("failed");
      expect(savedRuns["acc-2-ok"].status).toBe("completed");
    });

    it("prevents remaining accounts from starting when stop is requested", async () => {
      const { runSequentialScheduledCycleCore } = await import("../src/utils/scheduler");

      const executedIds: string[] = [];
      const savedRuns: Record<string, any> = {};
      let isRunning = false;
      let stopRequested = false;

      const profiles: SchedulableProfile[] = [
        { id: "acc-1", name: "Account 1", schedule: { enabled: true, frequency: "every_cycle", order: 1 } },
        { id: "acc-2", name: "Account 2", schedule: { enabled: true, frequency: "every_cycle", order: 2 } },
        { id: "acc-3", name: "Account 3", schedule: { enabled: true, frequency: "every_cycle", order: 3 } },
      ];

      await runSequentialScheduledCycleCore({
        fetchTrending: async () => fakeCoins,
        generateComments: async () => fakeMessages,
        getProfiles: () => profiles,
        hasValidSession: () => true,
        activateProfile: async () => {},
        runPosting: async (profile) => {
          executedIds.push(profile.id);
          stopRequested = true;
          return { posted: 1, failed: 0, stopReason: "completed" };
        },
        saveProfileLastRun: (id, lastRun) => {
          savedRuns[id] = lastRun;
        },
        log: () => {},
        isStopRequested: () => stopRequested,
        isCycleRunning: () => isRunning,
        setCycleRunning: (r) => { isRunning = r; },
        isSchedulerEnabled: () => true,
      });

      expect(executedIds).toEqual(["acc-1"]);
      expect(savedRuns["acc-1"].status).toBe("stopped_by_user");
      expect(savedRuns["acc-2"]).toBeUndefined();
      expect(savedRuns["acc-3"]).toBeUndefined();
    });

    it("returns immediately if a cycle is already running", async () => {
      const { runSequentialScheduledCycleCore } = await import("../src/utils/scheduler");

      let fetchCalled = false;
      let warned = false;

      await runSequentialScheduledCycleCore({
        fetchTrending: async () => {
          fetchCalled = true;
          return fakeCoins;
        },
        generateComments: async () => fakeMessages,
        getProfiles: () => [],
        hasValidSession: () => true,
        activateProfile: async () => {},
        runPosting: async () => ({ posted: 0, failed: 0, stopReason: "completed" }),
        saveProfileLastRun: () => {},
        log: (level, msg) => {
          if (level === "warning" && msg.includes("already running")) {
            warned = true;
          }
        },
        isStopRequested: () => false,
        isCycleRunning: () => true,
        setCycleRunning: () => {},
        isSchedulerEnabled: () => true,
      });

      expect(fetchCalled).toBe(false);
      expect(warned).toBe(true);
    });
  });
});
