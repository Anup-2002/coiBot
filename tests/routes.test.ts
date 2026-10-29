import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import request from "supertest";
import { app } from "../server";

const SETTINGS_FILE_PATH = path.join(process.cwd(), "auth", "settings.json");
let originalSettingsContent: string | null = null;

describe("Route Unit Tests (supertest)", () => {
  beforeAll(async () => {
    if (fs.existsSync(SETTINGS_FILE_PATH)) {
      originalSettingsContent = fs.readFileSync(SETTINGS_FILE_PATH, "utf-8");
    }
    // Ensure clean state before route tests
    await request(app).post("/api/scheduler/stop");
  });

  afterAll(async () => {
    await request(app).post("/api/scheduler/stop");
    if (originalSettingsContent !== null) {
      fs.writeFileSync(SETTINGS_FILE_PATH, originalSettingsContent, "utf-8");
    }
  });

  describe("Scheduler Pause and Resume State Transitions", () => {
    it("can transition between RUNNING and PAUSED states", async () => {
      // First enable scheduler in settings
      await request(app)
        .post("/api/scheduler/settings")
        .send({ enabled: true, mode: "interval", intervalMinutes: 60 });

      // Trigger pause (or set running first)
      // When we call run-now or arm scheduler, schedulerState becomes RUNNING
      const runRes = await request(app).post("/api/scheduler/run-now");
      // If it starts or returns 400 (if no auth/busy), we can test pause/resume directly
      if (runRes.status === 200) {
        // Now pause
        const pauseRes = await request(app).post("/api/scheduler/pause");
        expect(pauseRes.status).toBe(200);
        expect(pauseRes.body.status).toBe("paused");
        expect(pauseRes.body.state).toBe("PAUSED");

        // Now resume
        const resumeRes = await request(app).post("/api/scheduler/resume");
        expect(resumeRes.status).toBe(200);
        expect(resumeRes.body.status).toBe("running");
        expect(resumeRes.body.state).toBe("RUNNING");
      }

      // Clean up by stopping
      const stopRes = await request(app).post("/api/scheduler/stop");
      expect(stopRes.status).toBe(200);
      expect(stopRes.body.status).toBe("idle");
      expect(stopRes.body.state).toBe("STOPPED");
    });
  });

  describe("409 Locked Settings while Running or Paused", () => {
    it("returns 409 on locked endpoints when scheduler is active", async () => {
      // Enable scheduler
      await request(app)
        .post("/api/scheduler/settings")
        .send({ enabled: true });

      // Run scheduler or put it into RUNNING state
      await request(app).post("/api/scheduler/run-now");

      // Verify scheduler state endpoint
      const schedRes = await request(app).get("/api/scheduler");
      expect(schedRes.status).toBe(200);

      // If scheduler is RUNNING or PAUSED, settings modifications MUST return 409
      if (schedRes.body.state === "RUNNING" || schedRes.body.state === "PAUSED") {
        const settingsRes = await request(app)
          .post("/api/scheduler/settings")
          .send({ intervalMinutes: 120 });
        expect(settingsRes.status).toBe(409);
        expect(settingsRes.body.error).toContain("Pause or stop the schedule");

        const profileScheduleRes = await request(app)
          .post("/api/profile-schedule")
          .send({ id: "test-id", frequency: "daily" });
        expect(profileScheduleRes.status).toBe(409);
        expect(profileScheduleRes.body.error).toContain("Pause or stop the schedule");

        const reorderRes = await request(app)
          .post("/api/scheduler/reorder-accounts")
          .send({ orderedIds: [] });
        expect(reorderRes.status).toBe(409);
        expect(reorderRes.body.error).toContain("Pause or stop the schedule");

        const targetCoinsRes = await request(app)
          .post("/api/settings/target-coins")
          .send({ targetCoinsCount: 15 });
        expect(targetCoinsRes.status).toBe(409);
        expect(targetCoinsRes.body.error).toContain("Pause or stop the schedule");
      }

      // Stop scheduler
      await request(app).post("/api/scheduler/stop");
    });

    it("returns 409 for continuous loop when scheduler is enabled", async () => {
      // Enable scheduler
      await request(app)
        .post("/api/scheduler/settings")
        .send({ enabled: true });

      const loopRes = await request(app)
        .post("/api/set-continuous-loop")
        .send({ enabled: true, intervalMinutes: 60 });

      expect(loopRes.status).toBe(409);
      expect(loopRes.body.error).toContain("scheduler is enabled");

      // Disable scheduler again
      await request(app).post("/api/scheduler/stop");
    });
  });

  describe("Health Endpoint and 60-Second In-Memory Caching", () => {
    it("returns 200 with health checks and caches response for 60 seconds", async () => {
      const res1 = await request(app).get("/api/health");
      expect(res1.status).toBe(200);
      expect(res1.body).toHaveProperty("healthy");
      expect(res1.body).toHaveProperty("checks");
      expect(res1.body).toHaveProperty("cachedAt");
      expect(res1.body.checks).toHaveProperty("server");
      expect(res1.body.checks).toHaveProperty("database");
      expect(res1.body.checks).toHaveProperty("browser");

      const firstCachedAt = res1.body.cachedAt;

      // Second request immediately after
      const res2 = await request(app).get("/api/health");
      expect(res2.status).toBe(200);
      expect(res2.body.cachedAt).toBe(firstCachedAt);
    });
  });

  describe("Multi-Profile Data Isolation Check", () => {
    it("enforces no data leakage when no profile is active or session is invalid", async () => {
      const res = await request(app).get("/api/status");
      expect(res.status).toBe(200);
      // Status endpoint returns sanitized idle state if inactive
      if (!res.body.activeProfile) {
        expect(res.body.trending).toEqual([]);
        expect(res.body.generated).toEqual([]);
        expect(res.body.results).toEqual([]);
      }
    });

    it("intercepts output endpoints to return empty array when inactive", async () => {
      const trendingRes = await request(app).get("/output/last_trending.json");
      expect(trendingRes.status).toBe(200);
      expect(Array.isArray(trendingRes.body)).toBe(true);

      const messagesRes = await request(app).get("/output/generated_messages.json");
      expect(messagesRes.status).toBe(200);
      expect(Array.isArray(messagesRes.body)).toBe(true);
    });
  });
});
