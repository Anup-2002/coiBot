import { fs, path, express, app, OUTPUT_DIR, isTestEnv } from "../config.ts";
import { st } from "../state.ts";
import { addLog } from "../logger.ts";
import { isProfileSessionActive, getActiveProfileId, updateActiveProfilePaths, getIsolatedResults } from "../profiles.ts";


app.get("/output/last_trending.json", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  const queryProfileId = (req.query.profileId as string)?.trim();
  const activeId = queryProfileId || getActiveProfileId();
  const sessionExists = isProfileSessionActive(activeId);
  if (!activeId || !sessionExists) {
    return res.json([]);
  }

  updateActiveProfilePaths();
  const targetFile = queryProfileId ? path.join(st.OUTPUT_DIR, queryProfileId, "last_trending.json") : st.LAST_TRENDING_FILE;

  if (fs.existsSync(targetFile)) {
    return res.sendFile(targetFile);
  }
  // Fallback to shared root file if profile file not yet created
  const rootFile = path.join(st.OUTPUT_DIR, "last_trending.json");
  if (fs.existsSync(rootFile)) {
    return res.sendFile(rootFile);
  }
  res.json([]);
});

app.get("/output/generated_messages.json", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  const queryProfileId = (req.query.profileId as string)?.trim();
  const activeId = queryProfileId || getActiveProfileId();
  const sessionExists = isProfileSessionActive(activeId);
  if (!activeId || !sessionExists) {
    return res.json([]);
  }

  updateActiveProfilePaths();
  const targetFile = queryProfileId ? path.join(st.OUTPUT_DIR, queryProfileId, "generated_messages.json") : st.GENERATED_MESSAGES_FILE;

  if (fs.existsSync(targetFile)) {
    return res.sendFile(targetFile);
  }
  // Fallback to shared root file if profile file not yet created
  const rootFile = path.join(st.OUTPUT_DIR, "generated_messages.json");
  if (fs.existsSync(rootFile)) {
    return res.sendFile(rootFile);
  }
  res.json([]);
});

app.get("/output/results.json", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  const queryProfileId = (req.query.profileId as string)?.trim();
  const activeId = queryProfileId || getActiveProfileId();
  const sessionExists = isProfileSessionActive(activeId);
  if (!activeId || !sessionExists) {
    return res.json([]);
  }

  updateActiveProfilePaths();
  const targetFile = queryProfileId ? path.join(st.OUTPUT_DIR, queryProfileId, "results.json") : st.RESULTS_FILE;

  if (fs.existsSync(targetFile)) {
    return res.sendFile(targetFile);
  }
  res.json([]);
});

// Dedicated API endpoint for results to prevent file lock or caching issues
app.get("/api/results", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  const queryProfileId = (req.query.profileId as string)?.trim();
  const activeId = queryProfileId || getActiveProfileId();
  if (!activeId || !isProfileSessionActive(activeId)) {
    return res.json({ success: true, results: [] });
  }
  const rawResults = getIsolatedResults(activeId);
  const results = rawResults.filter(r => r.profileId === activeId);
  res.json({ success: true, results });
});

app.use("/output", express.static(OUTPUT_DIR));

if (!isTestEnv) {
  try {
    if (!fs.existsSync(st.MARKETING_IMAGES_DIR)) {
      fs.mkdirSync(st.MARKETING_IMAGES_DIR, { recursive: true });
    }
  } catch (err) {
    console.error("[SERVER] Error creating MARKETING_IMAGES_DIR:", err);
  }
}

app.use("/uploads/marketing_images", express.static(st.MARKETING_IMAGES_DIR));


// Initial System Logs
addLog("info", "CoinMarketCap Bot Server initialized.");
addLog("info", "Ready to process trending coins and execute automation.");

// Auto-initialize auth/state.json if missing, or update from env var
if (!isTestEnv && process.env.AUTH_STATE_JSON) {
  addLog("info", "Detected AUTH_STATE_JSON environment variable. Syncing session storage state...");
  try {
    const parsed = JSON.parse(process.env.AUTH_STATE_JSON);
    fs.writeFileSync(st.AUTH_STATE_FILE, JSON.stringify(parsed, null, 2), "utf-8");
    addLog("success", "Successfully initialized auth/state.json from AUTH_STATE_JSON environment variable!");
  } catch (err) {
    addLog("error", `Failed to parse AUTH_STATE_JSON environment variable: ${(err as Error).message}`);
  }
} else if (!fs.existsSync(st.AUTH_STATE_FILE)) {
  addLog("info", "No active auth/state.json session file found on startup. Waiting for profile restoration or login.");
} else {
  addLog("info", "Found existing auth/state.json session storage state.");
}

