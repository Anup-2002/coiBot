import { fs, path, isTestEnv, type ProfileTimestamps, type BotProgressData } from "./config.ts";
import { st } from "./state.ts";
import { getTodayDateString, readJsonFile, writeJsonFile } from "./files.ts";
import { getActiveProfileId, getAccountDailyPostLimit } from "./profiles.ts";
import { saveSettingsCloud, saveTimestampsCloud, saveBotProgressCloud } from "../src/storage.ts";
import { parseBotSettings, type BotSettings } from "../src/utils/scheduler.ts";

export function getLocalBotSettings(): BotSettings {
  try {
    if (fs.existsSync(st.SETTINGS_FILE)) {
      const raw = fs.readFileSync(st.SETTINGS_FILE, "utf-8");
      return parseBotSettings(raw);
    }
  } catch (_) {}
  return { schedulerEnabled: false };
}

export function saveLocalBotSettings(settings: BotSettings): void {
  try {
    const dir = path.dirname(st.SETTINGS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(st.SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
  } catch (err) {
    console.error("[SERVER] Error writing settings.json:", err);
  }
  if (!isTestEnv) {
    saveSettingsCloud(settings).catch(() => {});
  }
}

export function getAvailableMarketingImages(): string[] {
  try {
    if (!fs.existsSync(st.MARKETING_IMAGES_DIR)) return [];
    const validExts = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
    return fs.readdirSync(st.MARKETING_IMAGES_DIR)
      .filter(f => validExts.includes(path.extname(f).toLowerCase()))
      .sort();
  } catch (_) {
    return [];
  }
}

export function getNextSingleMarketingImage(): { filename: string; filePath: string } | null {
  const images = getAvailableMarketingImages();
  if (images.length === 0) return null;

  const settings = getLocalBotSettings();
  if (!settings.imageUploadEnabled) return null;

  let selectedIndex = 0;
  if (settings.imageSelectionMode === "random") {
    selectedIndex = Math.floor(Math.random() * images.length);
  } else {
    const currentIndex = typeof settings.activeImageIndex === "number" ? settings.activeImageIndex : 0;
    selectedIndex = (currentIndex >= 0 && currentIndex < images.length) ? currentIndex : 0;
    const nextIndex = (selectedIndex + 1) % images.length;
    settings.activeImageIndex = nextIndex;
    saveLocalBotSettings(settings);
  }

  const filename = images[selectedIndex];
  let filePath = path.join(st.MARKETING_IMAGES_DIR, filename);
  if (!fs.existsSync(filePath)) {
    const pubPath = path.join(process.cwd(), "public", "uploads", "marketing_images", filename);
    if (fs.existsSync(pubPath)) {
      filePath = pubPath;
    } else {
      return null;
    }
  }
  return { filename, filePath };
}

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
  if (activeId && !isTestEnv) {
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
  if (activeId && !isTestEnv) {
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
  if (activeId && !isTestEnv) {
    saveTimestampsCloud(emptyTs, activeId).catch(() => {});
  }
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

  if (!data.last_post_date || data.last_post_date !== todayStr) {
    data.daily_post_count = 0;
    data.last_post_date = todayStr;
    writeJsonFile(filePath, data);
    if (activeId && !isTestEnv) {
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

