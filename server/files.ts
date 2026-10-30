import { fs, path, crypto, isTestEnv, type PostResult } from "./config.ts";
import { st } from "./state.ts";
import { addLog, getActiveProfileId } from "./logger.ts";
import { saveSessionStateCloud, saveTrendingCoinsCloud, saveGeneratedMessagesCloud, savePostResultsCloud, saveBotProgressCloud, saveProfilesCloud, saveTimestampsCloud } from "../src/storage.ts";

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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
  if (isTestEnv) return;
  const cacheKey = `${st.AUTH_STATE_FILE}:${profileId || "global"}`;
  const newHash = getPayloadHash(stateStr);
  if (st.lastCloudSavedHash.get(cacheKey) === newHash) {
    return;
  }
  await saveSessionStateCloud(stateStr, profileId);
  st.lastCloudSavedHash.set(cacheKey, newHash);
}

export async function saveProfilesCloudIfChanged(profiles: any[]) {
  if (isTestEnv) return;
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

const cloudWriteQueues = new Map<string, Promise<void>>();

export async function writeJsonFile<T>(filePath: string, data: T) {
  const prev = cloudWriteQueues.get(filePath) || Promise.resolve();
  const next = prev.then(() => writeJsonFileInternal(filePath, data)).catch(() => {});
  cloudWriteQueues.set(filePath, next);
  return next;
}

async function writeJsonFileInternal<T>(filePath: string, data: T) {
  try {
    writeJsonFileSyncAtomic(filePath, data);
    if (isTestEnv) return;

    const activeId = getActiveProfileId();
    const cacheKey = `${filePath}:${activeId || "global"}`;
    const hashPayload =
      filePath === st.POST_PROGRESS_FILE && data && typeof data === "object"
        ? { ...(data as any), updated_at: undefined }
        : data;
    const newHash = getPayloadHash(hashPayload);

    if (st.lastCloudSavedHash.get(cacheKey) === newHash) {
      return;
    }

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

