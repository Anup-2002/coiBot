import { fs, path, isTestEnv, type PostResult, type BotProgressData } from "./config.ts";
import { st } from "./state.ts";
import { addLog, getActiveProfileId } from "./logger.ts";
export { getActiveProfileId };
import { getTodayDateString, readJsonFile, saveProfilesCloudIfChanged } from "./files.ts";
import { saveSessionStateCloud, saveProfilesCloud } from "../src/storage.ts";
import { normalizeProfileSchedule } from "../src/utils/scheduler.ts";

export function sessionHasValidCookies(str: string): boolean {
  if (!str || !str.trim()) return false;
  try {
    const parsed = JSON.parse(str);
    const cookies = Array.isArray(parsed) ? parsed : (parsed.cookies || []);
    if (!Array.isArray(cookies) || cookies.length === 0) return false;
    return cookies.some((c: any) =>
      (c.name === "Authorization" && typeof c.value === "string" && c.value.length > 20) ||
      (c.name === "u-prod" && typeof c.value === "string" && c.value.length > 20) ||
      (c.name === "cmc_user_session" && typeof c.value === "string" && c.value.length > 10)
    );
  } catch (_) {
    return false;
  }
}

export function isProfileSessionActive(profileId?: string | null): boolean {
  if (profileId) {
    try {
      if (fs.existsSync(st.PROFILES_FILE)) {
        const profiles = JSON.parse(fs.readFileSync(st.PROFILES_FILE, "utf-8"));
        const target = profiles.find((p: any) => p.id === profileId);
        if (target && target.stateJson && sessionHasValidCookies(target.stateJson)) {
          if (target.isActive && !fs.existsSync(st.AUTH_STATE_FILE)) {
            try {
              fs.writeFileSync(st.AUTH_STATE_FILE, target.stateJson, "utf-8");
            } catch (_) {}
          }
          return true;
        }
      }
    } catch (_) {}
  }
  if (fs.existsSync(st.AUTH_STATE_FILE)) {
    try {
      const content = fs.readFileSync(st.AUTH_STATE_FILE, "utf-8");
      if (sessionHasValidCookies(content)) {
        return true;
      }
    } catch (_) {}
  }
  return false;
}

export function extractCmcProfileInfo(stateJsonStr?: string): {
  cmcUsername?: string;
  cmcNickname?: string;
  communityProfileUrl?: string;
} {
  if (!stateJsonStr || !stateJsonStr.trim()) return {};
  try {
    const parsed = JSON.parse(stateJsonStr);
    const cookies = Array.isArray(parsed) ? parsed : (parsed.cookies || []);
    if (!Array.isArray(cookies)) return {};
    const uProd = cookies.find((c: any) => c && c.name === "u-prod" && typeof c.value === "string");
    if (!uProd || !uProd.value) return {};
    const raw = Buffer.from(decodeURIComponent(uProd.value), "base64").toString("utf-8");
    const startIdx = raw.indexOf("{");
    const endIdx = raw.lastIndexOf("}");
    if (startIdx === -1 || endIdx <= startIdx) return {};
    const userObj = JSON.parse(raw.slice(startIdx, endIdx + 1));
    const username = typeof userObj.username === "string" && userObj.username.trim() ? userObj.username.trim() : "";
    const nickname = typeof userObj.nickname === "string" && userObj.nickname.trim() ? userObj.nickname.trim() : username;
    if (!username) return {};
    return {
      cmcUsername: username,
      cmcNickname: nickname,
      communityProfileUrl: `https://coinmarketcap.com/community/profile/${encodeURIComponent(username)}/`,
    };
  } catch (_) {
    return {};
  }
}

export function normalizeProfilesWithSchedule(profiles: any[]): any[] {
  if (!Array.isArray(profiles)) return [];
  return profiles.map((p, idx) => {
    const { schedule, lastRun } = normalizeProfileSchedule(p, idx + 1);
    let dailyPostLimit = typeof p.dailyPostLimit === "number" && p.dailyPostLimit > 0 ? p.dailyPostLimit : 300;
    if (dailyPostLimit === 500) dailyPostLimit = 300;
    const cmcInfo = extractCmcProfileInfo(p.stateJson);
    return {
      ...p,
      dailyPostLimit,
      schedule,
      lastRun,
      ...(cmcInfo.cmcUsername ? { cmcUsername: cmcInfo.cmcUsername } : {}),
      ...(cmcInfo.cmcNickname ? { cmcNickname: cmcInfo.cmcNickname } : {}),
      ...(cmcInfo.communityProfileUrl ? { communityProfileUrl: cmcInfo.communityProfileUrl } : {}),
    };
  });
}

if (!isTestEnv && !fs.existsSync(st.PROFILES_FILE)) {
  try {
    fs.writeFileSync(st.PROFILES_FILE, JSON.stringify([], null, 2), "utf-8");
  } catch (err) {
    console.error("[SERVER] Error creating initial profiles file:", err);
  }
}

export function getNextImportedAccountName(profiles: any[]): string {
  for (let i = 1; i <= 5; i++) {
    const name = `Imported Account ${i}`;
    if (!profiles.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      return name;
    }
  }
  return `Imported Account ${profiles.length + 1}`;
}

export function ensureProfileDirectory(profileId: string): void {
  if (!profileId) return;
  const dir = path.join(st.OUTPUT_DIR, profileId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const resultsFile = path.join(dir, "results.json");
  if (!fs.existsSync(resultsFile)) {
    fs.writeFileSync(resultsFile, "[]", "utf-8");
  }
  const progressFile = path.join(dir, "post_progress.json");
  if (!fs.existsSync(progressFile)) {
    fs.writeFileSync(progressFile, JSON.stringify({
      next_index: 0,
      daily_post_count: 0,
      daily_post_limit: 300,
      last_post_date: getTodayDateString()
    }, null, 2), "utf-8");
  }
  const tsFile = path.join(dir, "timestamps.json");
  if (!fs.existsSync(tsFile)) {
    fs.writeFileSync(tsFile, JSON.stringify({
      coinsFetchedAt: null,
      coinsFetchedTime: null,
      commentsGeneratedAt: null,
      commentsGeneratedTime: null
    }, null, 2), "utf-8");
  }
}

export function updateActiveProfilePaths() {
  const activeId = getActiveProfileId();
  if (activeId) {
    ensureProfileDirectory(activeId);
    const dir = path.join(st.OUTPUT_DIR, activeId);
    st.LAST_TRENDING_FILE = path.join(dir, "last_trending.json");
    st.GENERATED_MESSAGES_FILE = path.join(dir, "generated_messages.json");
    st.RESULTS_FILE = path.join(dir, "results.json");
    st.POST_PROGRESS_FILE = path.join(dir, "post_progress.json");
    st.TIMESTAMPS_FILE = path.join(dir, "timestamps.json");
  } else {
    st.LAST_TRENDING_FILE = path.join(st.OUTPUT_DIR, "last_trending.json");
    st.GENERATED_MESSAGES_FILE = path.join(st.OUTPUT_DIR, "generated_messages.json");
    st.RESULTS_FILE = path.join(st.OUTPUT_DIR, "results.json");
    st.POST_PROGRESS_FILE = path.join(st.OUTPUT_DIR, "post_progress.json");
    st.TIMESTAMPS_FILE = path.join(st.OUTPUT_DIR, "timestamps.json");
  }
  if (!isTestEnv) {
    console.log(`[PATHS] Dynamic paths updated. Active profile: ${activeId || "None"}`);
  }
}

export function getActiveProfile(): any | null {
  try {
    if (fs.existsSync(st.PROFILES_FILE)) {
      const profiles = JSON.parse(fs.readFileSync(st.PROFILES_FILE, "utf-8"));
      return profiles.find((p: any) => p.isActive) || null;
    }
  } catch (_) {}
  return null;
}

export function getAccountDailyPostLimit(profileId?: string | null): number {
  if (profileId) {
    try {
      if (fs.existsSync(st.PROFILES_FILE)) {
        const profiles = JSON.parse(fs.readFileSync(st.PROFILES_FILE, "utf-8"));
        const target = profiles.find((p: any) => p.id === profileId);
        if (target && typeof target.dailyPostLimit === "number" && target.dailyPostLimit > 0) {
          if (target.dailyPostLimit === 500) return 300;
          return target.dailyPostLimit;
        }
      }
    } catch (_) {}
  } else {
    const active = getActiveProfile();
    if (active && typeof active.dailyPostLimit === "number" && active.dailyPostLimit > 0) {
      if (active.dailyPostLimit === 500) return 300;
      return active.dailyPostLimit;
    }
  }
  const envVal = Number(process.env.DAILY_POST_LIMIT);
  if (!isNaN(envVal) && envVal > 0) {
    if (envVal === 500) return 300;
    return envVal;
  }
  return 300;
}

export function normalizeStateJson(stateJsonStr: string): string {
  try {
    if (!stateJsonStr || !stateJsonStr.trim()) return stateJsonStr;
    const state = JSON.parse(stateJsonStr);
    let changed = false;

    if (state && Array.isArray(state.cookies)) {
      const farFuture = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
      state.cookies = state.cookies.map((c: any) => {
        if (!c || typeof c !== "object") return c;

        if (c.name === "Authorization" && typeof c.value === "string") {
          if (c.value.startsWith("Bearer eyJ")) {
            c.value = "Bearer" + c.value.substring(7);
            changed = true;
            addLog("info", "Automatically normalized 'Authorization' cookie value (removed space to match CoinMarketCap's BearereyJ standard).");
          }
        }

        if (typeof c.expires !== "number" || c.expires < farFuture) {
          c.expires = farFuture;
          changed = true;
        }

        return c;
      });
    }

    return changed ? JSON.stringify(state, null, 2) : stateJsonStr;
  } catch (err) {
    console.error("Error during state.json cookie normalization:", (err as Error).message);
    return stateJsonStr;
  }
}

export function getIsolatedResults(profileId: string | null): PostResult[] {
  if (!profileId) return [];
  ensureProfileDirectory(profileId);
  const profileResultsFile = path.join(st.OUTPUT_DIR, profileId, "results.json");
  const raw = readJsonFile<PostResult[]>(profileResultsFile, []);

  let cmcInfo: { cmcUsername?: string; cmcNickname?: string; communityProfileUrl?: string } = {};
  try {
    if (fs.existsSync(st.PROFILES_FILE)) {
      const profiles = JSON.parse(fs.readFileSync(st.PROFILES_FILE, "utf-8"));
      const target = Array.isArray(profiles) ? profiles.find((p: any) => p.id === profileId) : null;
      if (target && target.stateJson) {
        cmcInfo = extractCmcProfileInfo(target.stateJson);
      }
    }
  } catch (_) {}

  let sanitizedCount = 0;
  const isolated: PostResult[] = [];

  for (const r of raw) {
    if (r.profileId && r.profileId !== profileId) {
      sanitizedCount++;
      continue;
    }
    if (!r.profileId) {
      sanitizedCount++;
    }
    const isDirectPostUrl = typeof r.url === "string" && r.url.includes("/community/post/");
    const baseCoinUrl = r.coinUrl || (!isDirectPostUrl && r.url ? `${r.url.replace(/#.*$/, "")}#Community` : undefined);
    const directPostUrl = r.postUrl || (isDirectPostUrl ? r.url : undefined);
    isolated.push({
      ...r,
      profileId,
      ...(directPostUrl ? { postUrl: directPostUrl } : {}),
      ...(baseCoinUrl ? { coinUrl: baseCoinUrl } : {}),
      ...(r.profileUrl || cmcInfo.communityProfileUrl ? { profileUrl: r.profileUrl || cmcInfo.communityProfileUrl } : {}),
      ...(r.cmcUsername || cmcInfo.cmcUsername ? { cmcUsername: r.cmcUsername || cmcInfo.cmcUsername } : {}),
      ...(r.cmcNickname || cmcInfo.cmcNickname ? { cmcNickname: r.cmcNickname || cmcInfo.cmcNickname } : {}),
    });
  }

  if (sanitizedCount > 0) {
    try {
      fs.writeFileSync(profileResultsFile, JSON.stringify(isolated, null, 2), "utf-8");
      addLog("warning", `[ISOLATION] Enforced strict isolation on "${profileId}" results (cleaned ${sanitizedCount} entries).`);
    } catch (_) {}
  }
  return isolated;
}

export async function autoSyncSessionToProfiles(stateJson: string, email?: string) {
  try {
    if (!stateJson || !stateJson.trim()) return;
    JSON.parse(stateJson);

    let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
    const cleanEmail = email ? email.trim() : "";

    const existingIdx = cleanEmail
      ? profiles.findIndex(p => p.name.toLowerCase() === cleanEmail.toLowerCase())
      : -1;

    if (existingIdx >= 0) {
      profiles = profiles.map(p => ({ ...p, isActive: false }));
      profiles[existingIdx].stateJson = stateJson;
      profiles[existingIdx].isActive = true;
      profiles[existingIdx].loginStatus = "logged_in";
      profiles[existingIdx].updatedAt = new Date().toISOString();
      addLog("success", `Automatically updated account profile: "${profiles[existingIdx].name}" with new session cookies and activated it.`);
    } else if (cleanEmail) {
      if (profiles.length >= 5) {
        addLog("warning", `Maximum limit of 5 accounts reached. Cannot auto-create profile for "${cleanEmail}". Please delete an old account.`);
        return;
      }
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

    await saveProfilesCloudIfChanged(profiles);
  } catch (error) {
    console.error("Error during autoSyncSessionToProfiles:", (error as Error).message);
  }
}

export async function activateProfileInternal(id: string): Promise<{
  success: boolean;
  message: string;
  activeProfile: { id: string; name: string; isActive: boolean; dailyPostLimit: number };
}> {
  let profiles = readJsonFile<any[]>(st.PROFILES_FILE, []);
  const targetIdx = profiles.findIndex(p => p.id === id);
  if (targetIdx === -1) {
    throw new Error("Profile not found.");
  }

  profiles = profiles.map((p, idx) => ({
    ...p,
    isActive: idx === targetIdx
  }));

  const activeProfile = profiles[targetIdx];
  fs.writeFileSync(st.AUTH_STATE_FILE, activeProfile.stateJson, "utf-8");
  fs.writeFileSync(st.PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");

  updateActiveProfilePaths();

  const targetDir = path.join(st.OUTPUT_DIR, activeProfile.id);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const targetResults = path.join(targetDir, "results.json");
  if (!fs.existsSync(targetResults)) {
    fs.writeFileSync(targetResults, "[]", "utf-8");
  }
  const targetProgress = path.join(targetDir, "post_progress.json");
  if (!fs.existsSync(targetProgress)) {
    fs.writeFileSync(targetProgress, JSON.stringify({
      next_index: 0,
      daily_post_count: 0,
      daily_post_limit: activeProfile.dailyPostLimit || 300,
      last_post_date: getTodayDateString()
    }, null, 2), "utf-8");
  }

  const progress = readJsonFile<BotProgressData>(targetProgress, { next_index: 0 });
  st.currentPostingIndex = progress.next_index || 0;

  addLog("success", `Activated account profile: "${activeProfile.name}". Isolated storage and cookies swept.`, activeProfile.id);

  if (!isTestEnv) {
    try {
      await Promise.allSettled([
        saveSessionStateCloud(activeProfile.stateJson, activeProfile.id),
        saveProfilesCloud(profiles)
      ]);
      if (st.syncLocalFromCloudHook) {
        await st.syncLocalFromCloudHook(true);
      }
    } catch (syncErr) {
      console.error("[STORAGE] Error syncing active profile to cloud:", syncErr);
    }
  }

  st.loginState = { status: "idle", message: "" };

  return {
    success: true,
    message: `Successfully activated profile "${activeProfile.name}"`,
    activeProfile: {
      id: activeProfile.id,
      name: activeProfile.name,
      isActive: true,
      dailyPostLimit: activeProfile.dailyPostLimit || 300
    }
  };
}

if (!isTestEnv) {
  updateActiveProfilePaths();
}

