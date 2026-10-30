import { fs, path, crypto, execSync, 
  type ProfileTimestamps,
  type BotProgressData,
  type PostResult,
} from "./config.ts";
import {
  st,
  sessionHasValidCookies,
  getLocalBotSettings,
  getActiveProfileId,
  getNextImportedAccountName,
  ensureProfileDirectory,
  updateActiveProfilePaths,
  getTodayDateString,
  getAccountDailyPostLimit,
  addLog,
  normalizeStateJson,
} from "./state.ts";
import {
  getSessionStateCloud,
  saveSessionStateCloud,
  getTrendingCoinsCloud,
  saveTrendingCoinsCloud,
  getGeneratedMessagesCloud,
  saveGeneratedMessagesCloud,
  getPostResultsCloud,
  savePostResultsCloud,
  getBotProgressCloud,
  saveBotProgressCloud,
  getSystemLogsCloud,
  getProfilesCloud,
  saveProfilesCloud,
  getTimestampsCloud,
  saveTimestampsCloud,
  getSettingsCloud,
  getActiveStoreName,
} from "../src/storage.ts";

export function getRealTimestamps(specificProfileId?: string | null): ProfileTimestamps {
  const activeId = specificProfileId || getActiveProfileId();
  const tsFilePath = activeId ? path.join(st.OUTPUT_DIR, activeId, "timestamps.json") : st.TIMESTAMPS_FILE;
  const coinsFilePath = activeId ? path.join(st.OUTPUT_DIR, activeId, "last_trending.json") : st.LAST_TRENDING_FILE;
  const messagesFilePath = activeId ? path.join(st.OUTPUT_DIR, activeId, "generated_messages.json") : st.GENERATED_MESSAGES_FILE;

  const ts = readJsonFile<ProfileTimestamps>(tsFilePath, {
    coinsFetchedAt: null,
    coinsFetchedTime: null,
    commentsGeneratedAt: null,
    commentsGeneratedTime: null,
  });

  // If timestamp is not recorded in timestamps.json but data file exists, fallback to file mtime
  if (!ts.coinsFetchedAt && fs.existsSync(coinsFilePath)) {
    try {
      const stat = fs.statSync(coinsFilePath);
      if (stat.size > 2) {
        ts.coinsFetchedAt = stat.mtimeMs;
        ts.coinsFetchedTime = stat.mtime.toISOString();
      }
    } catch (_) {}
  }
  if (!ts.commentsGeneratedAt && fs.existsSync(messagesFilePath)) {
    try {
      const stat = fs.statSync(messagesFilePath);
      if (stat.size > 2) {
        ts.commentsGeneratedAt = stat.mtimeMs;
        ts.commentsGeneratedTime = stat.mtime.toISOString();
      }
    } catch (_) {}
  }
  return ts;
}

export function updateRealFetchTime(): void {
  const activeId = getActiveProfileId();
  const ts = getRealTimestamps(activeId);
  ts.coinsFetchedAt = Date.now();
  ts.coinsFetchedTime = new Date().toISOString();
  const tsFilePath = activeId ? path.join(st.OUTPUT_DIR, activeId, "timestamps.json") : st.TIMESTAMPS_FILE;
  writeJsonFile(tsFilePath, ts);
  if (tsFilePath !== st.TIMESTAMPS_FILE) {
    writeJsonFile(st.TIMESTAMPS_FILE, ts);
  }
  if (activeId) {
    saveTimestampsCloud(ts, activeId).catch(() => {});
  }
}

export function updateRealGenerateTime(): void {
  const activeId = getActiveProfileId();
  const ts = getRealTimestamps(activeId);
  ts.commentsGeneratedAt = Date.now();
  ts.commentsGeneratedTime = new Date().toISOString();
  const tsFilePath = activeId ? path.join(st.OUTPUT_DIR, activeId, "timestamps.json") : st.TIMESTAMPS_FILE;
  writeJsonFile(tsFilePath, ts);
  if (tsFilePath !== st.TIMESTAMPS_FILE) {
    writeJsonFile(st.TIMESTAMPS_FILE, ts);
  }
  if (activeId) {
    saveTimestampsCloud(ts, activeId).catch(() => {});
  }
}

export function clearRealTimestamps(): void {
  const activeId = getActiveProfileId();
  const emptyTs = {
    coinsFetchedAt: null,
    coinsFetchedTime: null,
    commentsGeneratedAt: null,
    commentsGeneratedTime: null,
  };
  const tsFilePath = activeId ? path.join(st.OUTPUT_DIR, activeId, "timestamps.json") : st.TIMESTAMPS_FILE;
  writeJsonFile(tsFilePath, emptyTs);
  if (tsFilePath !== st.TIMESTAMPS_FILE) {
    writeJsonFile(st.TIMESTAMPS_FILE, emptyTs);
  }
  if (activeId) {
    saveTimestampsCloud(emptyTs, activeId).catch(() => {});
  }
}

export function getIsolatedResults(profileId: string | null): PostResult[] {
  if (!profileId) return [];
  ensureProfileDirectory(profileId);
  const profileResultsFile = path.join(st.OUTPUT_DIR, profileId, "results.json");
  const raw = readJsonFile<PostResult[]>(profileResultsFile, []);
  
  // Strictly isolate: only keep results that explicitly match profileId or legacy within this directory
  let sanitizedCount = 0;
  const isolated: PostResult[] = [];
  
  for (const r of raw) {
    if (!r.profileId) {
      // Legacy item inside this profile's own directory, assign this profileId
      isolated.push({ ...r, profileId });
      sanitizedCount++;
    } else if (r.profileId === profileId) {
      isolated.push(r);
    } else {
      // Rogue item belonging to a different profile, discard immediately!
      sanitizedCount++;
    }
  }

  // If rogue entries or unassigned items were found, persist the sanitized array
  if (sanitizedCount > 0) {
    try {
      fs.writeFileSync(profileResultsFile, JSON.stringify(isolated, null, 2), "utf-8");
      addLog("warning", `[ISOLATION] Enforced strict isolation on "${profileId}" results (cleaned ${sanitizedCount} entries).`);
    } catch (_) {}
  }
  return isolated;
}

export function readBotProgress(specificProfileId?: string): BotProgressData {
  const activeId = specificProfileId || getActiveProfileId();
  const filePath = activeId ? path.join(st.OUTPUT_DIR, activeId, "post_progress.json") : st.POST_PROGRESS_FILE;
  const todayStr = getTodayDateString();
  const limit = getAccountDailyPostLimit(activeId);
  const data = readJsonFile<BotProgressData>(filePath, {
    next_index: 0,
    daily_post_count: 0,
    last_post_date: todayStr,
    daily_post_limit: limit,
  });

  if (typeof data.next_index !== "number") {
    data.next_index = 0;
  }

  // Roll over daily post count if date stamp is from previous calendar day
  if (!data.last_post_date || data.last_post_date !== todayStr) {
    data.daily_post_count = 0;
    data.last_post_date = todayStr;
    writeJsonFile(filePath, data);
    if (activeId) {
      saveBotProgressCloud(data, activeId).catch(() => {});
    }
  } else if (typeof data.daily_post_count !== "number") {
    data.daily_post_count = 0;
  }

  data.daily_post_limit = limit;
  return data;
}

export function saveBotProgress(updates: Partial<BotProgressData>): BotProgressData {
  const current = readBotProgress();
  const merged: BotProgressData = {
    ...current,
    ...updates,
    daily_post_limit: updates.daily_post_limit || getAccountDailyPostLimit(),
    updated_at: new Date().toISOString()
  };
  writeJsonFile(st.POST_PROGRESS_FILE, merged);
  return merged;
}

export function pruneOldAndCompletedData(targetProfileId?: string | null): {
  prunedCount: number;
  remainingCount: number;
  archivedCount: number;
  details: string;
} {
  try {
    const settings = getLocalBotSettings();
    if (settings.autoPruneOldDataEnabled === false) {
      return { prunedCount: 0, remainingCount: 0, archivedCount: 0, details: "Data retention auto-pruning is disabled in settings." };
    }

    const retentionDays = settings.dataRetentionDays && settings.dataRetentionDays > 0 ? settings.dataRetentionDays : 7;
    const maxKeep = settings.maxResultsHistoryCount && settings.maxResultsHistoryCount > 0 ? settings.maxResultsHistoryCount : 300;
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    let targetProfiles: string[] = [];
    if (targetProfileId) {
      targetProfiles = [targetProfileId];
    } else if (fs.existsSync(st.PROFILES_FILE)) {
      try {
        const profiles = JSON.parse(fs.readFileSync(st.PROFILES_FILE, "utf-8"));
        targetProfiles = profiles.map((p: any) => p.id).filter(Boolean);
      } catch (_) {}
    }

    let totalPruned = 0;
    let totalRemaining = 0;
    let totalArchived = 0;

    const itemsToCheck: { pid: string | null; resFile: string; arcFile: string }[] = targetProfiles.map((pid) => ({
      pid,
      resFile: path.join(st.OUTPUT_DIR, pid, "results.json"),
      arcFile: path.join(st.OUTPUT_DIR, pid, "archived_results.json")
    }));
    itemsToCheck.push({
      pid: null,
      resFile: path.join(st.OUTPUT_DIR, "results.json"),
      arcFile: path.join(st.OUTPUT_DIR, "archived_results.json")
    });

    for (const item of itemsToCheck) {
      if (!fs.existsSync(item.resFile)) continue;
      const allResults = readJsonFile<PostResult[]>(item.resFile, []);
      if (!allResults || allResults.length === 0) continue;

      const keptResults: PostResult[] = [];
      const prunedResults: PostResult[] = [];

      for (const res of allResults) {
        const itemCreated = res.createdAt || (res.timestamp ? new Date(res.timestamp).getTime() : 0);
        if (itemCreated > 0 && itemCreated < cutoffTime) {
          prunedResults.push(res);
        } else {
          keptResults.push(res);
        }
      }

      if (keptResults.length > maxKeep) {
        const excessCount = keptResults.length - maxKeep;
        const excess = keptResults.slice(0, excessCount);
        prunedResults.push(...excess);
        keptResults.splice(0, excessCount);
      }

      if (prunedResults.length > 0) {
        const existingArchive = readJsonFile<PostResult[]>(item.arcFile, []);
        const mergedArchive = [...existingArchive, ...prunedResults];
        const cappedArchive = mergedArchive.slice(-2500);
        writeJsonFile(item.arcFile, cappedArchive);
        writeJsonFile(item.resFile, keptResults);

        totalPruned += prunedResults.length;
        totalArchived += prunedResults.length;
        totalRemaining += keptResults.length;

        if (item.pid) {
          savePostResultsCloud(keptResults, item.pid).catch(() => {});
        }
      } else {
        totalRemaining += keptResults.length;
      }
    }

    if (totalPruned > 0) {
      addLog("info", `[DATA RETENTION] Auto-pruned ${totalPruned} old submission records older than ${retentionDays} days. Kept ${totalRemaining} active records. Safely archived.`);
    }

    return {
      prunedCount: totalPruned,
      remainingCount: totalRemaining,
      archivedCount: totalArchived,
      details: `Pruned ${totalPruned} submissions older than ${retentionDays} days. Active pool size: ${totalRemaining}.`
    };
  } catch (err) {
    console.error("[DATA RETENTION] Error during auto-pruning:", err);
    return { prunedCount: 0, remainingCount: 0, archivedCount: 0, details: (err as Error).message };
  }
}

// Initial data retention check at startup to prune accumulated old data
setTimeout(() => {
  try {
    pruneOldAndCompletedData();
  } catch (_) {}
}, 3000);

export function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content) as T;
    }
  } catch (error) {
    addLog("error", `Failed to read ${path.basename(filePath)}: ${(error as Error).message}`);
  }
  return defaultValue;
}

export async function autoSyncSessionToProfiles(stateJson: string, email?: string) {
  try {
    if (!stateJson || !stateJson.trim()) return;
    JSON.parse(stateJson);
    
    let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
    const cleanEmail = email ? email.trim() : "";
    
    // Check if a profile with this email or name already exists
    const existingIdx = cleanEmail 
      ? profiles.findIndex(p => p.name.toLowerCase() === cleanEmail.toLowerCase())
      : -1;

    if (existingIdx >= 0) {
      // Deactivate other profiles and update this specific profile
      profiles = profiles.map(p => ({ ...p, isActive: false }));
      profiles[existingIdx].stateJson = stateJson;
      profiles[existingIdx].isActive = true;
      profiles[existingIdx].loginStatus = "logged_in";
      profiles[existingIdx].updatedAt = new Date().toISOString();
      addLog("success", `Automatically updated account profile: "${profiles[existingIdx].name}" with new session cookies and activated it.`);
    } else if (cleanEmail) {
      // Check if we reached the maximum of 5 accounts
      if (profiles.length >= 5) {
        addLog("warning", `Maximum limit of 5 accounts reached. Cannot auto-create profile for "${cleanEmail}". Please delete an old account.`);
        return;
      }
      // Deactivate all others and create a brand new profile for this new account
      profiles = profiles.map(p => ({ ...p, isActive: false }));
      const profileId = cleanEmail.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-") || `profile-${Date.now()}`;
      const newProfile = {
        id: profileId,
        name: cleanEmail,
        stateJson,
        isActive: true,
        loginStatus: "logged_in",
        updatedAt: new Date().toISOString()
      };
      ensureProfileDirectory(profileId);
      profiles.push(newProfile);
      addLog("success", `Automatically created and activated new account profile: "${cleanEmail}"`);
    } else {
      // Fallback when no email was provided (e.g. raw cookie paste)
      const activeIdx = profiles.findIndex(p => p.isActive);
      if (activeIdx >= 0) {
        profiles[activeIdx].stateJson = stateJson;
        profiles[activeIdx].loginStatus = "logged_in";
        profiles[activeIdx].updatedAt = new Date().toISOString();
        addLog("success", `Automatically updated active account profile: "${profiles[activeIdx].name}" with new session cookies.`);
      } else {
        const name = getNextImportedAccountName(profiles);
        profiles = profiles.map(p => ({ ...p, isActive: false }));
        const profileId = name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-") || `profile-${Date.now()}`;
        ensureProfileDirectory(profileId);
        profiles.push({
          id: profileId,
          name,
          stateJson,
          isActive: true,
          loginStatus: "logged_in",
          updatedAt: new Date().toISOString()
        });
        addLog("success", `Automatically created and activated new account profile: "${name}"`);
      }
    }
    
    fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
    updateActiveProfilePaths();
    
    // Sync to Cloud only if changed
    await saveProfilesCloudIfChanged(profiles);
  } catch (error) {
    console.error("Error during autoSyncSessionToProfiles:", (error as Error).message);
  }
}

export function writeJsonFileSyncAtomic(filePath: string, data: any): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  }
  const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
  try {
    const content = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    fs.writeFileSync(tempPath, content, "utf-8");
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    console.error(`[FS] Error atomic writing ${filePath}:`, (err as Error).message);
    try {
      const content = typeof data === "string" ? data : JSON.stringify(data, null, 2);
      fs.writeFileSync(filePath, content, "utf-8");
    } catch (_) {}
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }
  }
}

export function getPayloadHash(data: any): string {
  const str = typeof data === "string" ? data : JSON.stringify(data);
  return crypto.createHash("sha1").update(str).digest("hex");
}

export async function saveSessionStateCloudIfChanged(stateStr: string, profileId?: string) {
  const cacheKey = `${st.AUTH_STATE_FILE}:${profileId || "global"}`;
  const newHash = getPayloadHash(stateStr);
  if (st.lastCloudSavedHash.get(cacheKey) === newHash) {
    return;
  }
  await saveSessionStateCloud(stateStr, profileId);
  st.lastCloudSavedHash.set(cacheKey, newHash);
}

export async function saveProfilesCloudIfChanged(profiles: any[]) {
  const canonical = Array.isArray(profiles)
    ? profiles.map(p => ({ ...p, updatedAt: undefined }))
    : profiles;
  const profilesHash = getPayloadHash(canonical);
  if (st.lastCloudSavedHash.get("profiles_file") === profilesHash) {
    return;
  }
  await saveProfilesCloud(profiles);
  st.lastCloudSavedHash.set("profiles_file", profilesHash);
}

export async function writeJsonFile<T>(filePath: string, data: T) {
  try {
    writeJsonFileSyncAtomic(filePath, data);

    const activeId = getActiveProfileId();
    const cacheKey = `${filePath}:${activeId || "global"}`;
    const hashPayload =
      filePath === st.POST_PROGRESS_FILE && data && typeof data === "object"
        ? { ...(data as any), updated_at: undefined }
        : data;
    const newHash = getPayloadHash(hashPayload);

    // Skip cloud save if data is unchanged
    if (st.lastCloudSavedHash.get(cacheKey) === newHash) {
      return;
    }

    // Synchronize to Firestore Cloud Database
    if (filePath === st.AUTH_STATE_FILE) {
      try {
        await saveSessionStateCloudIfChanged(typeof data === "string" ? data : JSON.stringify(data), activeId || undefined);
        st.lastCloudSavedHash.set(cacheKey, newHash);
      } catch (err) {
        console.error("[FIREBASE] Error syncing session to cloud:", (err as Error).message);
      }
    } else if (filePath === st.LAST_TRENDING_FILE) {
      try {
        await saveTrendingCoinsCloud(data as any, activeId || undefined);
        st.lastCloudSavedHash.set(cacheKey, newHash);
      } catch (err) {
        console.error("[FIREBASE] Error syncing coins to cloud:", (err as Error).message);
      }
    } else if (filePath === st.GENERATED_MESSAGES_FILE) {
      try {
        await saveGeneratedMessagesCloud(data as any, activeId || undefined);
        st.lastCloudSavedHash.set(cacheKey, newHash);
      } catch (err) {
        console.error("[FIREBASE] Error syncing messages to cloud:", (err as Error).message);
      }
    } else if (filePath === st.RESULTS_FILE) {
      try {
        if (activeId) {
          const isolated = (data as PostResult[]).filter(r => !r.profileId || r.profileId === activeId).map(r => ({ ...r, profileId: activeId }));
          await savePostResultsCloud(isolated, activeId);
          st.lastCloudSavedHash.set(cacheKey, newHash);
        }
      } catch (err) {
        console.error("[FIREBASE] Error syncing results to cloud:", (err as Error).message);
      }
    } else if (filePath === st.POST_PROGRESS_FILE) {
      const progressObj = data as any;
      try {
        await saveBotProgressCloud(progressObj, activeId || undefined);
        st.lastCloudSavedHash.set(cacheKey, newHash);
      } catch (err) {
        console.error("[FIREBASE] Error syncing progress to cloud:", (err as Error).message);
      }
    } else if (filePath === st.TIMESTAMPS_FILE) {
      const tsObj = data as any;
      try {
        if (activeId) {
          await saveTimestampsCloud(tsObj, activeId);
          st.lastCloudSavedHash.set(cacheKey, newHash);
        }
      } catch (err) {
        console.error("[FIREBASE] Error syncing timestamps to cloud:", (err as Error).message);
      }
    }
  } catch (error) {
    addLog("error", `Failed to write atomically to ${path.basename(filePath)}: ${(error as Error).message}`);
  }
}

const CLOUD_SYNC_THROTTLE_MS = 30000; // 30 seconds throttle to strictly protect database quotas

export async function syncLocalFromCloudIfStale(force = false) {
  const now = Date.now();
  if (!force && (now - st.lastCloudSyncTime < CLOUD_SYNC_THROTTLE_MS)) {
    return; // Already synced recently
  }
  st.lastCloudSyncTime = now;
  try {
    const activeId = getActiveProfileId();
    if (!activeId) {
      return; // No active profile, do not sync profile-scoped data
    }
    if (!force && st.hydratedProfiles.has(activeId)) {
      return; // Already hydrated for this active profile; skip redundant cloud reads
    }

    // Always ensure paths are aligned with the active profile FIRST before any sync operations
    updateActiveProfilePaths();

    // 1. Trending Coins
    const localCoins = readJsonFile<any[]>(st.LAST_TRENDING_FILE, []);
    if (localCoins.length === 0) {
      // Local is empty, hydrate from cloud
      const cloudCoins = await getTrendingCoinsCloud(activeId || undefined);
      if (cloudCoins && Array.isArray(cloudCoins) && cloudCoins.length > 0) {
        fs.writeFileSync(st.LAST_TRENDING_FILE, JSON.stringify(cloudCoins, null, 2), "utf-8");
      }
    }

    // 2. Generated Messages
    const localMessages = readJsonFile<any[]>(st.GENERATED_MESSAGES_FILE, []);
    if (localMessages.length === 0) {
      const cloudMessages = await getGeneratedMessagesCloud(activeId || undefined);
      if (cloudMessages && Array.isArray(cloudMessages) && cloudMessages.length > 0) {
        fs.writeFileSync(st.GENERATED_MESSAGES_FILE, JSON.stringify(cloudMessages, null, 2), "utf-8");
      }
    }

    // 3. Post Results (Strictly isolated by profileId)
    if (!st.isPostingRunning) {
      const localResults = getIsolatedResults(activeId);
      if (localResults.length === 0) {
        const rawCloudResults = await getPostResultsCloud(activeId);
        const cloudResults = (rawCloudResults || [])
          .filter((r: any) => !r.profileId || r.profileId === activeId)
          .map((r: any) => ({ ...r, profileId: activeId }));
        if (cloudResults.length > 0) {
          fs.writeFileSync(st.RESULTS_FILE, JSON.stringify(cloudResults, null, 2), "utf-8");
        }
      }

      // 4. Bot Progress (Skip overwriting if posting is active)
      const localProgress = readBotProgress();
      if (!localProgress || localProgress.next_index === 0) {
        const cloudProgress = await getBotProgressCloud(activeId || undefined);
        if (cloudProgress && typeof cloudProgress.next_index === "number") {
          const merged = {
            ...localProgress,
            next_index: cloudProgress.next_index,
            daily_post_count: cloudProgress.daily_post_count !== undefined ? cloudProgress.daily_post_count : localProgress.daily_post_count,
            last_post_date: cloudProgress.last_post_date || localProgress.last_post_date,
            daily_post_limit: cloudProgress.daily_post_limit || localProgress.daily_post_limit || getAccountDailyPostLimit(activeId)
          };
          fs.writeFileSync(st.POST_PROGRESS_FILE, JSON.stringify(merged, null, 2), "utf-8");
          st.currentPostingIndex = cloudProgress.next_index;
        }
      }


      // 4.5 Timestamps
      if (force) {
        const cloudTs = await getTimestampsCloud(activeId || undefined);
        if (cloudTs && (cloudTs.coinsFetchedAt || cloudTs.commentsGeneratedAt)) {
          const localTs = readJsonFile<ProfileTimestamps>(st.TIMESTAMPS_FILE, {
            coinsFetchedAt: null,
            coinsFetchedTime: null,
            commentsGeneratedAt: null,
            commentsGeneratedTime: null,
          });
          let tsChanged = false;
          if (!localTs.coinsFetchedAt && cloudTs.coinsFetchedAt) {
            localTs.coinsFetchedAt = cloudTs.coinsFetchedAt;
            localTs.coinsFetchedTime = cloudTs.coinsFetchedTime;
            tsChanged = true;
          }
          if (!localTs.commentsGeneratedAt && cloudTs.commentsGeneratedAt) {
            localTs.commentsGeneratedAt = cloudTs.commentsGeneratedAt;
            localTs.commentsGeneratedTime = cloudTs.commentsGeneratedTime;
            tsChanged = true;
          }
          if (tsChanged) {
            fs.writeFileSync(st.TIMESTAMPS_FILE, JSON.stringify(localTs, null, 2), "utf-8");
          }
        }
      }
    }

    // 5. Profiles (Refresh active profile paths while preserving current local active selection)
    const localProfiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
    if (localProfiles.length === 0 || force) {
      const cloudProfiles = await getProfilesCloud();
      if (cloudProfiles && Array.isArray(cloudProfiles) && cloudProfiles.length > 0) {
        const currentActiveId = getActiveProfileId();
        
        const mergedProfiles = cloudProfiles.map((cp: any) => {
          const localMatch = localProfiles.find(lp => lp.id === cp.id);
          return {
            ...cp,
            dailyPostLimit: (localMatch && typeof localMatch.dailyPostLimit === "number") ? localMatch.dailyPostLimit : (cp.dailyPostLimit || 300),
            isActive: currentActiveId ? (cp.id === currentActiveId) : cp.isActive
          };
        });

        // Keep any local-only profiles that haven't synced yet
        for (const lp of localProfiles) {
          if (!mergedProfiles.some(mp => mp.id === lp.id)) {
            mergedProfiles.push(lp);
          }
        }

        fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(mergedProfiles, null, 2), "utf-8");
        updateActiveProfilePaths();
      }
    }

    st.hydratedProfiles.add(activeId);
  } catch (err) {
    console.error("[CLOUD-SYNC] Error during throttled cloud-to-local sync:", (err as Error).message);
  }
}

export function synchronizeSessionsAndProfilesOnStartup() {
  try {
    let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
    const sessionExists = fs.existsSync(st.AUTH_STATE_FILE);
    let sessionContent = "";
    if (sessionExists) {
      sessionContent = fs.readFileSync(st.AUTH_STATE_FILE, "utf-8").trim();
    }

    const hasValidLocalSession = sessionExists && sessionHasValidCookies(sessionContent);
    const activeProfile = profiles.find(p => p.isActive);

    if (hasValidLocalSession) {
      // We have a verified local session file with real cookies
      if (activeProfile) {
        if (activeProfile.stateJson !== sessionContent) {
          // Update active profile's cookies with the session file cookies
          activeProfile.stateJson = sessionContent;
          activeProfile.updatedAt = new Date().toISOString();
          fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
          saveProfilesCloud(profiles).catch(err => console.error("[FIREBASE] Error syncing profiles on startup sync:", err.message));
          addLog("success", `[SYNC] Synchronized active profile "${activeProfile.name}" with auth/state.json cookies.`);
        }
      } else {
        // We have a valid session with real cookies but no active profile. Create/activate one!
        const name = "Imported Session";
        const profileId = `profile-${Date.now()}`;
        const newProfile = {
          id: profileId,
          name,
          stateJson: sessionContent,
          isActive: true,
          updatedAt: new Date().toISOString()
        };
        profiles.push(newProfile);
        fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
        saveProfilesCloud(profiles).catch(err => console.error("[FIREBASE] Error saving new profile on startup sync:", err.message));
        addLog("success", `[SYNC] Created and activated a new profile "${name}" for the existing active session.`);
      }
    } else {
      // Session file does not exist or has empty/invalid cookies.
      // Do we have an active profile with valid cookies?
      if (activeProfile && sessionHasValidCookies(activeProfile.stateJson)) {
        // Restore session file from active profile!
        fs.writeFileSync(st.AUTH_STATE_FILE, activeProfile.stateJson, "utf-8");
        saveSessionStateCloud(activeProfile.stateJson, activeProfile.id).catch(err => console.error("[FIREBASE] Error saving session to cloud on startup sync:", err.message));
        addLog("success", `[SYNC] Restored auth/state.json session state from active profile "${activeProfile.name}".`);
      } else {
        // No valid local session and active profile has no valid cookies.
        // Mark inactive if activeProfile has no valid cookies, but do NOT auto-create empty profiles
        let changed = false;
        profiles = profiles.map(p => {
          if (p.isActive && !sessionHasValidCookies(p.stateJson)) {
            changed = true;
            return { ...p, isActive: false };
          }
          return p;
        });
        if (changed) {
          fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
          saveProfilesCloud(profiles).catch(err => console.error("[FIREBASE] Error saving profiles on startup sync:", err.message));
        }
      }
    }
  } catch (err) {
    console.error("Error in synchronizeSessionsAndProfilesOnStartup:", (err as Error).message);
  }
}

export async function hydrateLocalFromCloud() {
  addLog("info", `[STORAGE] Hydrating local ephemeral storage from ${getActiveStoreName()} cloud database...`);
  try {
    // 1. Profiles FIRST so active profile id is known for subsequent scoped hydrations (Item 2 & 3)
    try {
      const cloudProfiles = await getProfilesCloud();
      if (cloudProfiles && Array.isArray(cloudProfiles) && cloudProfiles.length > 0) {
        fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(cloudProfiles, null, 2), "utf-8");
        addLog("success", `[FIREBASE] Hydrated ${cloudProfiles.length} user accounts profiles from Firestore!`);
      }
    } catch (e) {
      console.error("[FIREBASE] Could not hydrate profiles from cloud:", e);
    }

    // Refresh active profile file paths immediately after profiles are loaded (Item 3)
    updateActiveProfilePaths();
    const activeId = getActiveProfileId();

    // 2. Session cookies for the active profile (Item 2)
    const cloudSession = await getSessionStateCloud(activeId || undefined);
    if (cloudSession && sessionHasValidCookies(cloudSession)) {
      const normalizedSession = normalizeStateJson(cloudSession);
      fs.writeFileSync(st.AUTH_STATE_FILE, normalizedSession, "utf-8");
      addLog("success", "[FIREBASE] Hydrated login session cookies from Firestore!");
      
      // If the session was corrected, write the normalized version back to Firestore
      if (normalizedSession !== cloudSession) {
        addLog("info", "[FIREBASE] Automatically updating Firestore cloud with corrected/normalized session cookies...");
        saveSessionStateCloud(normalizedSession, activeId || undefined).catch((e) => {
          console.error("[FIREBASE] Error updating normalized session back to cloud:", e.message);
        });
      }
    } else {
      addLog("info", "[FIREBASE] No session cookies found in Firestore for current active profile.");
    }

    // 3. Trending Coins for active profile (Item 2)
    const cloudCoins = await getTrendingCoinsCloud(activeId || undefined);
    if (cloudCoins && cloudCoins.length > 0) {
      fs.writeFileSync(st.LAST_TRENDING_FILE, JSON.stringify(cloudCoins, null, 2), "utf-8");
      addLog("success", `[FIREBASE] Hydrated ${cloudCoins.length} trending coins from Firestore!`);
    }

    // 4. Generated Messages for active profile (Item 2)
    const cloudMessages = await getGeneratedMessagesCloud(activeId || undefined);
    if (cloudMessages && cloudMessages.length > 0) {
      fs.writeFileSync(st.GENERATED_MESSAGES_FILE, JSON.stringify(cloudMessages, null, 2), "utf-8");
      addLog("success", `[FIREBASE] Hydrated ${cloudMessages.length} generated messages from Firestore!`);
    }

    // 5. Post Results for active profile (Item 2)
    const cloudResults = await getPostResultsCloud(activeId || undefined);
    if (cloudResults && cloudResults.length > 0) {
      fs.writeFileSync(st.RESULTS_FILE, JSON.stringify(cloudResults, null, 2), "utf-8");
      addLog("success", `[FIREBASE] Hydrated ${cloudResults.length} post results from Firestore!`);
    }

    // 6. Bot Progress for active profile (Item 2)
    const cloudProgress = await getBotProgressCloud(activeId || undefined);
    if (cloudProgress) {
      const localProgress = readBotProgress();
      const mergedProgress = {
        ...localProgress,
        next_index: cloudProgress.next_index,
        daily_post_count: cloudProgress.daily_post_count !== undefined ? cloudProgress.daily_post_count : localProgress.daily_post_count,
        last_post_date: cloudProgress.last_post_date || localProgress.last_post_date,
        daily_post_limit: cloudProgress.daily_post_limit || localProgress.daily_post_limit || getAccountDailyPostLimit(activeId)
      };
      fs.writeFileSync(st.POST_PROGRESS_FILE, JSON.stringify(mergedProgress, null, 2), "utf-8");
      st.currentPostingIndex = cloudProgress.next_index;
      addLog("success", `[FIREBASE] Hydrated bot posting progress (index ${cloudProgress.next_index}, daily posts ${mergedProgress.daily_post_count}/${mergedProgress.daily_post_limit}) from Firestore!`);
    }

    // 7. System Logs
    const cloudLogs = await getSystemLogsCloud();
    if (cloudLogs && cloudLogs.length > 0) {
      st.logs = cloudLogs.slice(-100);
      addLog("success", `[FIREBASE] Hydrated ${st.logs.length} system logs from Firestore!`);
    }

    // 8. Bot Settings
    const cloudSettings = await getSettingsCloud();
    if (cloudSettings) {
      fs.writeFileSync(st.SETTINGS_FILE, JSON.stringify(cloudSettings, null, 2), "utf-8");
      addLog("success", `[FIREBASE] Hydrated bot settings from Firestore (schedulerEnabled=${cloudSettings.schedulerEnabled})`);
    }

    // Run unified sessions/profiles synchronization and re-verify paths
    synchronizeSessionsAndProfilesOnStartup();
    updateActiveProfilePaths();
    if (activeId) st.hydratedProfiles.add(activeId);

    addLog("success", "[FIREBASE] Local storage state successfully synchronized with Cloud database.");
  } catch (err) {
    addLog("error", `[FIREBASE] Failed to hydrate local storage from Firestore: ${(err as Error).message}`);
  }
}

