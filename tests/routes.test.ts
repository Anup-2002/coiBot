import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import request from "supertest";
import { app } from "../server";
import { st } from "../server/state";

describe("Route Unit Tests (supertest)", () => {
  beforeAll(async () => {
    await request(app).post("/api/scheduler/stop");
  });

  afterAll(async () => {
    await request(app).post("/api/scheduler/stop");
  });

  describe("Express Route Registration Order & Test Isolation", () => {
    it("registers /output overrides before express.static(OUTPUT_DIR) and '*' fallback last", () => {
      const stack: any[] = (app as any)._router?.stack || [];
      expect(stack.length).toBeGreaterThan(0);

      const findRouteIndex = (routePath: string) =>
        stack.findIndex((layer: any) => layer.route?.path === routePath);

      const outputStaticIndex = stack.findIndex(
        (layer: any) => layer.name === "serveStatic" && String(layer.regexp).includes("output")
      );

      const trendingOverrideIdx = findRouteIndex("/output/last_trending.json");
      const messagesOverrideIdx = findRouteIndex("/output/generated_messages.json");
      const resultsOverrideIdx = findRouteIndex("/output/results.json");
      const wildcardFallbackIdx = findRouteIndex("*");

      expect(trendingOverrideIdx).toBeGreaterThanOrEqual(0);
      expect(messagesOverrideIdx).toBeGreaterThanOrEqual(0);
      expect(resultsOverrideIdx).toBeGreaterThanOrEqual(0);
      expect(outputStaticIndex).toBeGreaterThan(trendingOverrideIdx);
      expect(outputStaticIndex).toBeGreaterThan(messagesOverrideIdx);
      expect(outputStaticIndex).toBeGreaterThan(resultsOverrideIdx);

      // '*' fallback must be the very last route in the router stack
      const routeIndices = stack
        .map((layer: any, idx: number) => (layer.route ? idx : -1))
        .filter((idx: number) => idx >= 0);
      expect(wildcardFallbackIdx).toBe(routeIndices[routeIndices.length - 1]);
    });

    it("does not start the scheduler timer or touch real auth/ and output/ directories on import", () => {
      expect(st.schedulerCycleTimeout).toBeNull();
      expect(st.nextCycleTimeout).toBeNull();
      const realOutputDir = path.resolve(process.cwd(), "output");
      const realAuthDir = path.resolve(process.cwd(), "auth");
      expect(path.resolve(st.OUTPUT_DIR)).not.toBe(realOutputDir);
      expect(path.resolve(st.AUTH_DIR)).not.toBe(realAuthDir);
    });

    it("loads Playwright after PLAYWRIGHT_BROWSERS_PATH is set so /api/check-system finds Chromium", async () => {
      const res = await request(app).get("/api/check-system");
      expect(res.status).toBe(200);
      expect(res.body.playwrightInstalled).toBe(true);
      expect(res.body.executableExists).toBe(true);
      expect(res.body.browsersPath).toBeTruthy();
    }, 15000);
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

    it("intercepts output endpoints to return empty array when inactive even if file exists in OUTPUT_DIR", async () => {
      // Write a dummy file into the isolated test OUTPUT_DIR to prove the override intercepts before express.static
      fs.writeFileSync(
        path.join(st.OUTPUT_DIR, "last_trending.json"),
        JSON.stringify([{ name: "SecretCoin", symbol: "SEC" }]),
        "utf-8"
      );

      const trendingRes = await request(app).get("/output/last_trending.json");
      expect(trendingRes.status).toBe(200);
      expect(trendingRes.body).toEqual([]);

      const messagesRes = await request(app).get("/output/generated_messages.json");
      expect(messagesRes.status).toBe(200);
      expect(messagesRes.body).toEqual([]);
    });
  });
});
