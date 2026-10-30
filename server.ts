import { fs, path, express, app, PORT } from "./server/config.ts";
import {
  st,
  getLocalBotSettings,
  addLog,
  normalizeStateJson,
  releaseProcessLock,
  sendTelegramAlert,
} from "./server/state.ts";
import { hydrateLocalFromCloud } from "./server/sync.ts";
import { formatCommentWithCashtag } from "./server/generate.ts";
import { scheduleNextSchedulerCycle } from "./server/scheduler.ts";
import "./server/routes/output.ts";
import "./server/routes/profiles.ts";
import "./server/routes/status-health.ts";
import "./server/routes/images.ts";
import "./server/routes/login.ts";
import "./server/routes/bot-actions.ts";
import "./server/routes/admin-data.ts";
import "./server/routes/scheduler.ts";

export { formatCommentWithCashtag };

// ============================================================================
// VITE OR STATIC FILES SERVING MIDDLEWARE
// ============================================================================

process.on("unhandledRejection", (reason) => {
  console.error("[SERVER] Unhandled Rejection (logged silently, no Telegram noise):", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[SERVER] Uncaught Fatal Exception:", err);
  sendTelegramAlert(
    "CRITICAL: Server Process Crash",
    `Fatal error occurred on server host:\n${err.message}\n\n👉 ACTION REQUIRED: Manual check/restart may be required.`,
    "error",
    "server_process_crash"
  ).catch(() => {});
});

async function startServer() {
  // First, hydrate all files from Firestore cloud database
  await hydrateLocalFromCloud();

  // Restart safety: if scheduler is enabled, schedule next multi-account cycle after configured interval (isolated from single posting)
  const initialSettings = getLocalBotSettings();
  if (initialSettings.schedulerEnabled) {
    addLog("info", `[STARTUP] Sequential multi-account scheduler is ENABLED. Scheduling next multi-account cycle (isolated from single posting).`);
    scheduleNextSchedulerCycle();
  }

  // Defensive: Normalize local auth/state.json if present on startup
  if (fs.existsSync(st.AUTH_STATE_FILE)) {
    try {
      const content = fs.readFileSync(st.AUTH_STATE_FILE, "utf-8");
      const normalized = normalizeStateJson(content);
      if (normalized !== content) {
        fs.writeFileSync(st.AUTH_STATE_FILE, normalized, "utf-8");
        addLog("success", "[STARTUP] Auto-corrected and normalized existing local auth/state.json.");
      }
    } catch (e) {
      console.error("[STARTUP] Error during defensive local state normalization:", (e as Error).message);
    }
  }

  if (process.env.NODE_ENV !== "production") {
    addLog("info", "[SERVER] Running in DEVELOPMENT mode, initializing Vite dev server middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    addLog("info", "[SERVER] Running in PRODUCTION mode, serving static files...");
    let distPath = path.join(process.cwd(), "dist");
    if (!fs.existsSync(distPath)) {
      distPath = path.resolve(__dirname, "../dist");
    }
    if (!fs.existsSync(distPath)) {
      distPath = path.resolve(__dirname, "dist");
    }
    
    addLog("info", `[SERVER] Static production assets directory resolved to: ${distPath}`);
    app.use(express.static(distPath));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/") || req.path.startsWith("/output/") || req.path.startsWith("/uploads/")) {
        return next();
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  const gracefulShutdown = async (signal: string) => {
    console.log(`[SERVER] Received ${signal}. Starting graceful shutdown...`);
    try {
      if (st.activeLoginSession && st.activeLoginSession.browser) {
        await st.activeLoginSession.browser.close().catch(() => {});
      }
      if (st.activePostingBrowser) {
        await st.activePostingBrowser.close().catch(() => {});
        st.activePostingBrowser = null;
      }
      releaseProcessLock("all" as any);
    } catch (_) {}
    server.close(() => {
      console.log("[SERVER] HTTP server closed gracefully.");
      process.exit(0);
    });
    setTimeout(() => {
      console.warn("[SERVER] Force exiting process after 5s timeout.");
      process.exit(0);
    }, 5000).unref();
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  startServer();
}

export { app, startServer };

