import { fs, path, app, OUTPUT_DIR, isOpenAiConfigured, isCmcConfigured } from "../config.ts";
import { st } from "../state.ts";
import { addLog } from "../logger.ts";
import { readJsonFile, writeJsonFileSyncAtomic } from "../files.ts";
import { getActiveProfileId, getNextImportedAccountName, ensureProfileDirectory, updateActiveProfilePaths, normalizeStateJson, activateProfileInternal } from "../profiles.ts";
import { saveBotProgress } from "../settings.ts";
import { isBusy } from "../locks.ts";
import { syncLocalFromCloudIfStale } from "../sync.ts";
import { saveSessionStateCloud, saveProfilesCloud } from "../../src/storage.ts";


addLog("info", `OpenAI API Status: ${isOpenAiConfigured ? "CONFIGURED" : "NOT CONFIGURED (Falls back to static rule-based comments)"}`);
addLog("info", `CoinMarketCap API Status: ${isCmcConfigured ? "CONFIGURED" : "NOT CONFIGURED (Falls back to live free public crypto markets API)"}`);

// ============================================================================
// API ENDPOINTS
// ============================================================================

// 1. Get Session state
app.get("/api/get-session", (req, res) => {
  const exists = fs.existsSync(st.AUTH_STATE_FILE);
  let details = {};
  let content = "";
  if (exists) {
    try {
      const stats = fs.statSync(st.AUTH_STATE_FILE);
      details = {
        sizeBytes: stats.size,
        updatedAt: stats.mtime,
      };
      content = fs.readFileSync(st.AUTH_STATE_FILE, "utf-8");
    } catch (_) {}
  }
  res.json({
    exists,
    filePath: st.AUTH_STATE_FILE,
    details,
    content,
  });
});

// 2. Save Session state
app.post("/api/save-session", async (req, res) => {
  if (st.isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot modify session cookies while the Continuous Automation Loop is active." });
  }
  if (isBusy()) {
    return res.status(400).json({ error: "Cannot modify session cookies while another process is running." });
  }
  try {
    let { stateJson } = req.body;
    if (!stateJson) {
      return res.status(400).json({ error: "Missing stateJson payload." });
    }
    // Verify it is valid JSON
    JSON.parse(stateJson);
    
    // Normalize and heal common cookie format anomalies automatically
    stateJson = normalizeStateJson(stateJson);
    
    let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
    
    // Check if this cookie state already belongs to any profile
    const matchIdx = profiles.findIndex(p => p.stateJson === stateJson);
    
    if (matchIdx >= 0) {
      // Activate matching profile
      profiles = profiles.map((p, idx) => ({
        ...p,
        isActive: idx === matchIdx
      }));
      addLog("success", `Detected existing profile matching these cookies: "${profiles[matchIdx].name}". Activated.`);
    } else {
      // Creating a new profile
      if (profiles.length >= 5) {
        return res.status(400).json({ error: "Maximum limit of 5 accounts reached. Please delete an existing profile to add a new one." });
      }
      
      const name = getNextImportedAccountName(profiles);
      const profileId = name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
      
      const newProfile = {
        id: profileId,
        name,
        stateJson,
        isActive: true,
        loginStatus: "unknown",
        updatedAt: new Date().toISOString()
      };
      
      // Deactivate all others
      profiles = profiles.map(p => ({ ...p, isActive: false }));
      profiles.push(newProfile);
      addLog("success", `Successfully imported cookie session as new profile: "${name}"`);
    }

    fs.writeFileSync(st.AUTH_STATE_FILE, stateJson, "utf-8");
    fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
    
    // Crucial: Update paths immediately
    updateActiveProfilePaths();
    
    // Reset login flow state to idle on manual session save
    st.loginState = { status: "idle", message: "" };
    
    // Sync to Firestore Cloud Database
    const activeId = getActiveProfileId();
    try {
      await saveSessionStateCloud(stateJson, activeId || undefined);
      await saveProfilesCloud(profiles);
      // Force sync to load any existing cloud data for this profile
      await syncLocalFromCloudIfStale(true);
    } catch (err) {
      console.error("[FIREBASE] Error saving session to cloud:", (err as Error).message);
    }

    res.json({ success: true, message: "auth/state.json saved successfully." });
  } catch (error) {
    addLog("error", `Failed to save session state: ${(error as Error).message}`);
    res.status(400).json({ error: `Invalid JSON format: ${(error as Error).message}` });
  }
});

// 3. Clear session
app.post("/api/clear-session", async (req, res) => {
  if (st.isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot clear session cookies while the Continuous Automation Loop is active." });
  }
  if (isBusy()) {
    return res.status(400).json({ error: "Cannot clear session cookies while another process is running." });
  }
  try {
    const activeId = getActiveProfileId();

    // Clear from Firestore Cloud Database
    try {
      await saveSessionStateCloud("", activeId || undefined);
    } catch (err) {
      console.error("[FIREBASE] Error clearing session from cloud:", (err as Error).message);
    }

    st.loginState = { status: "idle", message: "" };

    // Mark active profile inactive upon logout / clear-session
    try {
      if (fs.existsSync(st.PROFILES_FILE)) {
        const profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
        let changed = false;
        const updatedProfiles = profiles.map(p => {
          if (p.isActive) {
            changed = true;
            return { ...p, isActive: false, stateJson: "" };
          }
          return p;
        });
        if (changed) {
          fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(updatedProfiles, null, 2), "utf-8");
          await saveProfilesCloud(updatedProfiles);
        }
      }
    } catch (profErr) {
      console.error("[LOGOUT] Error updating profile inactive state:", (profErr as Error).message);
    }
    updateActiveProfilePaths();

    if (fs.existsSync(st.AUTH_STATE_FILE)) {
      fs.unlinkSync(st.AUTH_STATE_FILE);
      addLog("warning", "Deleted auth/state.json session state.");
      res.json({ success: true, message: "Session state deleted." });
    } else {
      res.json({ success: true, message: "No session state existed to delete." });
    }
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 3a. Get Profiles
app.get("/api/profiles", (req, res) => {
  try {
    const profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
    res.json({ success: true, profiles });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 3b. Save/Update Profile
app.post("/api/save-profile", async (req, res) => {
  if (st.isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot add or update profiles while the Continuous Automation Loop is active." });
  }
  if (isBusy()) {
    return res.status(400).json({ error: "Cannot add or update profiles while another process is running." });
  }
  try {
    const { id, name, stateJson } = req.body;
    if (!name || !stateJson) {
      return res.status(400).json({ error: "Missing name or stateJson payload." });
    }
    // Validate JSON
    JSON.parse(stateJson);

    let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
    let profileId = id || name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
    
    const existingIndex = profiles.findIndex(p => p.id === profileId);

    // 1. Check duplicate username if this is a NEW profile
    if (existingIndex === -1) {
      if (profiles.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        return res.status(400).json({ error: "This account username already exists. If you want to relogin, please delete the existing profile first." });
      }

      // 2. Check 5 accounts limit
      if (profiles.length >= 5) {
        return res.status(400).json({ error: "Maximum limit of 5 accounts reached. Please delete an existing profile to add a new one." });
      }
    }

    const rawLimit = Number(req.body.dailyPostLimit);
    const dailyLimit = !isNaN(rawLimit) && rawLimit > 0
      ? rawLimit
      : (existingIndex >= 0 && profiles[existingIndex].dailyPostLimit ? profiles[existingIndex].dailyPostLimit : 300);

    const proxyVal = typeof req.body.proxy === "string" 
      ? req.body.proxy.trim() 
      : (existingIndex >= 0 ? (profiles[existingIndex].proxy || "") : "");

    const profileData = {
      id: profileId,
      name,
      stateJson: normalizeStateJson(stateJson),
      isActive: existingIndex >= 0 ? profiles[existingIndex].isActive : false,
      loginStatus: existingIndex >= 0 ? (profiles[existingIndex].loginStatus || "unknown") : "unknown",
      dailyPostLimit: dailyLimit,
      proxy: proxyVal,
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      profiles[existingIndex] = profileData;
    } else {
      ensureProfileDirectory(profileId);
      profiles.push(profileData);
    }

    writeJsonFileSyncAtomic(st.PROFILES_FILE, profiles);
    addLog("success", `Saved account profile: "${name}" (Daily limit: ${dailyLimit} posts/day${proxyVal ? `, Proxy: ${proxyVal}` : ""})`);

    // Sync to Cloud
    try {
      await saveProfilesCloud(profiles);
    } catch (err) {
      console.error("[FIREBASE] Error syncing profiles to cloud:", (err as Error).message);
    }

    // If active profile was updated, ensure progress file reflects the limit
    if (profileData.isActive) {
      saveBotProgress({ daily_post_limit: dailyLimit });
    }

    res.json({ success: true, profile: profileData });
  } catch (error) {
    res.status(400).json({ error: `Invalid payload/JSON: ${(error as Error).message}` });
  }
});

// 3bb. Update Account Daily Post Limit
app.post("/api/update-profile-limit", async (req, res) => {
  if (st.isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot change account limit while the Continuous Automation Loop is active." });
  }
  try {
    const { id, dailyPostLimit } = req.body;
    if (!id) {
      return res.status(400).json({ error: "Missing profile id." });
    }
    const limitNum = Math.max(1, Math.min(10000, Number(dailyPostLimit) || 300));
    let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
    const idx = profiles.findIndex(p => p.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Profile not found." });
    }
    profiles[idx].dailyPostLimit = limitNum;
    profiles[idx].updatedAt = new Date().toISOString();
    writeJsonFileSyncAtomic(st.PROFILES_FILE, profiles);
    await saveProfilesCloud(profiles).catch(() => {});

    const activeId = getActiveProfileId();
    if (activeId === id) {
      saveBotProgress({ daily_post_limit: limitNum });
    }
    addLog("info", `Updated daily post limit for account "${profiles[idx].name}" to ${limitNum} posts/day.`);
    res.json({ success: true, profile: profiles[idx], dailyPostLimit: limitNum });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 3bc. Update Account Proxy
app.post("/api/update-profile-proxy", async (req, res) => {
  try {
    const { id, proxy } = req.body;
    if (!id) {
      return res.status(400).json({ error: "Missing profile id." });
    }
    let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
    const idx = profiles.findIndex(p => p.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Profile not found." });
    }
    profiles[idx].proxy = typeof proxy === "string" ? proxy.trim() : "";
    profiles[idx].updatedAt = new Date().toISOString();
    writeJsonFileSyncAtomic(st.PROFILES_FILE, profiles);
    await saveProfilesCloud(profiles).catch(() => {});

    const proxyMsg = profiles[idx].proxy ? profiles[idx].proxy : "Direct Connection (No proxy)";
    addLog("info", `Updated proxy for account "${profiles[idx].name}": ${proxyMsg}`);
    res.json({ success: true, profile: profiles[idx] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 3c. Activate Profile Helper and Endpoint

app.post("/api/activate-profile", async (req, res) => {
  if (st.isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot switch accounts while Continuous Loop is active. Please click 'Stop Posting' first." });
  }
  if (isBusy() || st.isPostingRunning || st.botStatus === "Posting" || st.botStatus === "Stopping") {
    return res.status(400).json({ error: "Cannot switch accounts while posting or automation is running. Please click 'Stop Posting' first." });
  }
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: "Missing profile id." });
    }
    const result = await activateProfileInternal(id);
    res.json(result);
  } catch (error) {
    const msg = (error as Error).message;
    if (msg === "Profile not found.") {
      return res.status(404).json({ error: msg });
    }
    res.status(500).json({ error: msg });
  }
});

// 3d. Delete Profile
app.post("/api/delete-profile", async (req, res) => {
  if (st.isContinuousLoopActive) {
    return res.status(400).json({ error: "Cannot delete accounts while the Continuous Automation Loop is active." });
  }
  if (isBusy()) {
    return res.status(400).json({ error: "Cannot delete accounts while another process is running." });
  }
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: "Missing profile id." });
    }

    let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
    const targetIdx = profiles.findIndex(p => {
      const pid = String(p.id || "").trim().toLowerCase();
      const targetId = String(id || "").trim().toLowerCase();
      return pid === targetId;
    });
    if (targetIdx === -1) {
      return res.status(404).json({ error: "Profile not found." });
    }

    const wasActive = profiles[targetIdx].isActive;
    const deletedName = profiles[targetIdx].name;
    const deletedId = profiles[targetIdx].id;
    profiles.splice(targetIdx, 1);

    if (wasActive) {
      // Clear st.AUTH_STATE_FILE if active profile was deleted
      if (fs.existsSync(st.AUTH_STATE_FILE)) {
        fs.unlinkSync(st.AUTH_STATE_FILE);
      }
      try {
        await saveSessionStateCloud("", deletedId);
      } catch (err) {
        console.error("[FIREBASE] Error clearing session from cloud on deletion:", (err as Error).message);
      }
    }

    // Clean up local profile subdirectory files if they exist
    const profileDir = path.join(st.OUTPUT_DIR, deletedId);
    if (fs.existsSync(profileDir)) {
      try {
        fs.rmSync(profileDir, { recursive: true, force: true });
        addLog("info", `Cleaned up local directory for deleted profile "${deletedName}" (${deletedId}).`);
      } catch (err) {
        console.error(`Error deleting profile subdirectory ${profileDir}:`, (err as Error).message);
      }
    }

    // Always reset login flow state to idle on deletion to prevent sticky success banner
    st.loginState = { status: "idle", message: "" };

    fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
    addLog("warning", `Deleted profile: "${deletedName}"`);

    // Reset active paths dynamic fallback
    updateActiveProfilePaths();

    try {
      await saveProfilesCloud(profiles);
    } catch (err) {
      console.error("[FIREBASE] Error syncing profiles to cloud on deletion:", (err as Error).message);
    }

    res.json({ success: true, message: "Profile deleted." });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

