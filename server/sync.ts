import { fs, path, isTestEnv, type ProfileTimestamps, type PostResult } from "./config.ts";
import { st } from "./state.ts";
import { addLog } from "./logger.ts";
import { readJsonFile, writeJsonFile } from "./files.ts";
import { sessionHasValidCookies, getActiveProfileId, updateActiveProfilePaths, getAccountDailyPostLimit, normalizeStateJson, getIsolatedResults } from "./profiles.ts";
import { getLocalBotSettings, readBotProgress } from "./settings.ts";
import { getSessionStateCloud, saveSessionStateCloud, getTrendingCoinsCloud, getGeneratedMessagesCloud, getPostResultsCloud, savePostResultsCloud, getBotProgressCloud, getSystemLogsCloud, getProfilesCloud, saveProfilesCloud, getTimestampsCloud, getSettingsCloud, getActiveStoreName } from "../src/storage.ts";

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

        if (item.pid && !isTestEnv) {
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

const CLOUD_SYNC_THROTTLE_MS = 30000;

export async function syncLocalFromCloudIfStale(force = false) {
  if (isTestEnv || process.env.DISABLE_CLOUD_SYNC === "true") return;
  const now = Date.now();
  if (!force && (now - st.lastCloudSyncTime < CLOUD_SYNC_THROTTLE_MS)) {
    return;
  }
  st.lastCloudSyncTime = now;
  try {
    const activeId = getActiveProfileId();
    if (!activeId) {
      return;
    }
    if (!force && st.hydratedProfiles.has(activeId)) {
      return;
    }

    updateActiveProfilePaths();

    const localCoins = readJsonFile<any[]>(st.LAST_TRENDING_FILE, []);
    if (localCoins.length === 0) {
      const cloudCoins = await getTrendingCoinsCloud(activeId || undefined);
      if (cloudCoins && Array.isArray(cloudCoins) && cloudCoins.length > 0) {
        fs.writeFileSync(st.LAST_TRENDING_FILE, JSON.stringify(cloudCoins, null, 2), "utf-8");
      }
    }

    const localMessages = readJsonFile<any[]>(st.GENERATED_MESSAGES_FILE, []);
    if (localMessages.length === 0) {
      const cloudMessages = await getGeneratedMessagesCloud(activeId || undefined);
      if (cloudMessages && Array.isArray(cloudMessages) && cloudMessages.length > 0) {
        fs.writeFileSync(st.GENERATED_MESSAGES_FILE, JSON.stringify(cloudMessages, null, 2), "utf-8");
      }
    }

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

st.syncLocalFromCloudHook = syncLocalFromCloudIfStale;

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
      if (activeProfile) {
        if (activeProfile.stateJson !== sessionContent) {
          activeProfile.stateJson = sessionContent;
          activeProfile.updatedAt = new Date().toISOString();
          fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
          saveProfilesCloud(profiles).catch(err => console.error("[FIREBASE] Error syncing profiles on startup sync:", err.message));
          addLog("success", `[SYNC] Synchronized active profile "${activeProfile.name}" with auth/state.json cookies.`);
        }
      } else {
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
      if (activeProfile && sessionHasValidCookies(activeProfile.stateJson)) {
        fs.writeFileSync(st.AUTH_STATE_FILE, activeProfile.stateJson, "utf-8");
        saveSessionStateCloud(activeProfile.stateJson, activeProfile.id).catch(err => console.error("[FIREBASE] Error saving session to cloud on startup sync:", err.message));
        addLog("success", `[SYNC] Restored auth/state.json session state from active profile "${activeProfile.name}".`);
      } else {
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
  if (process.env.DISABLE_CLOUD_SYNC === "true") {
    synchronizeSessionsAndProfilesOnStartup();
    updateActiveProfilePaths();
    return;
  }
  addLog("info", `[STORAGE] Hydrating local ephemeral storage from ${getActiveStoreName()} cloud database...`);
  try {
    try {
      const cloudProfiles = await getProfilesCloud();
      if (cloudProfiles && Array.isArray(cloudProfiles) && cloudProfiles.length > 0) {
        fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(cloudProfiles, null, 2), "utf-8");
        addLog("success", `[FIREBASE] Hydrated ${cloudProfiles.length} user accounts profiles from Firestore!`);
      }
    } catch (e) {
      console.error("[FIREBASE] Could not hydrate profiles from cloud:", e);
    }

    updateActiveProfilePaths();
    const activeId = getActiveProfileId();

    const cloudSession = await getSessionStateCloud(activeId || undefined);
    if (cloudSession && sessionHasValidCookies(cloudSession)) {
      const normalizedSession = normalizeStateJson(cloudSession);
      fs.writeFileSync(st.AUTH_STATE_FILE, normalizedSession, "utf-8");
      addLog("success", "[FIREBASE] Hydrated login session cookies from Firestore!");

      if (normalizedSession !== cloudSession) {
        addLog("info", "[FIREBASE] Automatically updating Firestore cloud with corrected/normalized session cookies...");
        saveSessionStateCloud(normalizedSession, activeId || undefined).catch((e) => {
          console.error("[FIREBASE] Error updating normalized session back to cloud:", e.message);
        });
      }
    } else {
      addLog("info", "[FIREBASE] No session cookies found in Firestore for current active profile.");
    }

    const cloudCoins = await getTrendingCoinsCloud(activeId || undefined);
    if (cloudCoins && cloudCoins.length > 0) {
      fs.writeFileSync(st.LAST_TRENDING_FILE, JSON.stringify(cloudCoins, null, 2), "utf-8");
      addLog("success", `[FIREBASE] Hydrated ${cloudCoins.length} trending coins from Firestore!`);
    }

    const cloudMessages = await getGeneratedMessagesCloud(activeId || undefined);
    if (cloudMessages && cloudMessages.length > 0) {
      fs.writeFileSync(st.GENERATED_MESSAGES_FILE, JSON.stringify(cloudMessages, null, 2), "utf-8");
      addLog("success", `[FIREBASE] Hydrated ${cloudMessages.length} generated messages from Firestore!`);
    }

    const cloudResults = await getPostResultsCloud(activeId || undefined);
    if (cloudResults && cloudResults.length > 0) {
      fs.writeFileSync(st.RESULTS_FILE, JSON.stringify(cloudResults, null, 2), "utf-8");
      addLog("success", `[FIREBASE] Hydrated ${cloudResults.length} post results from Firestore!`);
    }

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

    const cloudLogs = await getSystemLogsCloud();
    if (cloudLogs && cloudLogs.length > 0) {
      st.logs = cloudLogs.slice(-100);
      addLog("success", `[FIREBASE] Hydrated ${st.logs.length} system logs from Firestore!`);
    }

    const cloudSettings = await getSettingsCloud();
    if (cloudSettings) {
      fs.writeFileSync(st.SETTINGS_FILE, JSON.stringify(cloudSettings, null, 2), "utf-8");
      addLog("success", "[FIREBASE] Hydrated bot settings from Firestore!");
    }

    synchronizeSessionsAndProfilesOnStartup();
    updateActiveProfilePaths();
  } catch (err) {
    console.warn("[STORAGE] Could not hydrate from Firestore cloud (continuing with local storage):", (err as Error).message);
    synchronizeSessionsAndProfilesOnStartup();
    updateActiveProfilePaths();
  }
}
