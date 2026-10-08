import * as firebaseStorage from "./firebase-db";
import * as mongoStorage from "./mongo-db";

export function isCloudSyncDisabled(): boolean {
  return process.env.DISABLE_CLOUD_SYNC === "true";
}

export function isMongoEnabled(): boolean {
  if (isCloudSyncDisabled()) return false;
  return !!process.env.MONGO_URI;
}

export function getActiveStoreName(): string {
  if (isCloudSyncDisabled()) {
    return "Cloud Sync Disabled (Local Only)";
  }
  return "Firebase (Primary) + MongoDB (Fallback)";
}

// 1. Session State
export async function getSessionStateCloud(profileId?: string): Promise<string | null> {
  if (isCloudSyncDisabled()) return null;
  try {
    const firebaseRes = await firebaseStorage.getSessionStateCloud(profileId);
    if (firebaseRes) return firebaseRes;
  } catch (err) {
    console.warn("[STORAGE] Firebase getSessionState failed, attempting MongoDB fallback...");
  }

  // Fallback to MongoDB
  if (isMongoEnabled()) {
    try {
      const mongoRes = await mongoStorage.getSessionStateMongo(profileId);
      if (mongoRes) return mongoRes;
    } catch (_) {}
  }

  return null;
}

export async function saveSessionStateCloud(stateJson: string, profileId?: string): Promise<void> {
  if (isCloudSyncDisabled()) return;
  // 1. Save to Firebase (Primary)
  await firebaseStorage.saveSessionStateCloud(stateJson, profileId).catch((err) => {
    console.warn("[STORAGE] Firebase saveSessionState error, saving to MongoDB fallback:", err?.message || err);
  });

  // 2. Also keep MongoDB synced as warm fallback
  if (isMongoEnabled()) {
    await mongoStorage.saveSessionStateMongo(stateJson, profileId).catch(() => {});
  }
}

// 2. Trending Coins
export async function getTrendingCoinsCloud(profileId?: string): Promise<any[]> {
  if (isCloudSyncDisabled()) return [];
  try {
    const firebaseRes = await firebaseStorage.getTrendingCoinsCloud(profileId);
    if (firebaseRes && Array.isArray(firebaseRes) && firebaseRes.length > 0) {
      return firebaseRes;
    }
  } catch (err) {
    console.warn("[STORAGE] Firebase getTrendingCoins failed, attempting MongoDB fallback...");
  }

  if (isMongoEnabled()) {
    try {
      const mongoRes = await mongoStorage.getTrendingCoinsMongo(profileId);
      if (mongoRes && Array.isArray(mongoRes) && mongoRes.length > 0) {
        return mongoRes;
      }
    } catch (_) {}
  }

  return [];
}

export async function saveTrendingCoinsCloud(coins: any[], profileId?: string): Promise<void> {
  if (isCloudSyncDisabled()) return;
  await firebaseStorage.saveTrendingCoinsCloud(coins, profileId).catch(() => {});
  if (isMongoEnabled()) {
    await mongoStorage.saveTrendingCoinsMongo(coins, profileId).catch(() => {});
  }
}

// 3. Generated Messages
export async function getGeneratedMessagesCloud(profileId?: string): Promise<any[]> {
  if (isCloudSyncDisabled()) return [];
  try {
    const firebaseRes = await firebaseStorage.getGeneratedMessagesCloud(profileId);
    if (firebaseRes && Array.isArray(firebaseRes) && firebaseRes.length > 0) {
      return firebaseRes;
    }
  } catch (err) {
    console.warn("[STORAGE] Firebase getGeneratedMessages failed, attempting MongoDB fallback...");
  }

  if (isMongoEnabled()) {
    try {
      const mongoRes = await mongoStorage.getGeneratedMessagesMongo(profileId);
      if (mongoRes && Array.isArray(mongoRes) && mongoRes.length > 0) {
        return mongoRes;
      }
    } catch (_) {}
  }

  return [];
}

export async function saveGeneratedMessagesCloud(messages: any[], profileId?: string): Promise<void> {
  if (isCloudSyncDisabled()) return;
  await firebaseStorage.saveGeneratedMessagesCloud(messages, profileId).catch(() => {});
  if (isMongoEnabled()) {
    await mongoStorage.saveGeneratedMessagesMongo(messages, profileId).catch(() => {});
  }
}

// 4. Post Results
export async function getPostResultsCloud(profileId?: string): Promise<any[]> {
  if (isCloudSyncDisabled()) return [];
  try {
    const firebaseRes = await firebaseStorage.getPostResultsCloud(profileId);
    if (firebaseRes && Array.isArray(firebaseRes) && firebaseRes.length > 0) {
      return firebaseRes;
    }
  } catch (err) {
    console.warn("[STORAGE] Firebase getPostResults failed, attempting MongoDB fallback...");
  }

  if (isMongoEnabled()) {
    try {
      const mongoRes = await mongoStorage.getPostResultsMongo(profileId);
      if (mongoRes && Array.isArray(mongoRes) && mongoRes.length > 0) {
        return mongoRes;
      }
    } catch (_) {}
  }

  return [];
}

export async function savePostResultsCloud(results: any[], profileId?: string): Promise<void> {
  if (isCloudSyncDisabled()) return;
  await firebaseStorage.savePostResultsCloud(results, profileId).catch(() => {});
  if (isMongoEnabled()) {
    await mongoStorage.savePostResultsMongo(results, profileId).catch(() => {});
  }
}

// 5. Bot Progress
export interface StorageBotProgress {
  next_index: number;
  daily_post_count?: number;
  last_post_date?: string;
  daily_post_limit?: number;
}

export async function getBotProgressCloud(profileId?: string): Promise<StorageBotProgress | null> {
  if (isCloudSyncDisabled()) return null;
  try {
    const firebaseRes = await firebaseStorage.getBotProgressCloud(profileId);
    if (firebaseRes && typeof firebaseRes.next_index === "number") {
      return firebaseRes;
    }
  } catch (err) {
    console.warn("[STORAGE] Firebase getBotProgress failed, attempting MongoDB fallback...");
  }

  if (isMongoEnabled()) {
    try {
      const mongoRes = await mongoStorage.getBotProgressMongo(profileId);
      if (mongoRes && typeof mongoRes.next_index === "number") {
        return mongoRes;
      }
    } catch (_) {}
  }

  return null;
}

export async function saveBotProgressCloud(progress: number | StorageBotProgress, profileId?: string): Promise<void> {
  if (isCloudSyncDisabled()) return;
  await firebaseStorage.saveBotProgressCloud(progress, profileId).catch(() => {});
  if (isMongoEnabled()) {
    await mongoStorage.saveBotProgressMongo(progress, profileId).catch(() => {});
  }
}

// 6. System Logs
export async function getSystemLogsCloud(): Promise<any[]> {
  if (isCloudSyncDisabled()) return [];
  try {
    const firebaseRes = await firebaseStorage.getSystemLogsCloud();
    if (firebaseRes && Array.isArray(firebaseRes) && firebaseRes.length > 0) {
      return firebaseRes;
    }
  } catch (err) {
    console.warn("[STORAGE] Firebase getSystemLogs failed, attempting MongoDB fallback...");
  }

  if (isMongoEnabled()) {
    try {
      const mongoRes = await mongoStorage.getSystemLogsMongo();
      if (mongoRes && Array.isArray(mongoRes) && mongoRes.length > 0) {
        return mongoRes;
      }
    } catch (_) {}
  }

  return [];
}

export async function saveSystemLogsCloud(logs: any[]): Promise<void> {
  if (isCloudSyncDisabled()) return;
  await firebaseStorage.saveSystemLogsCloud(logs).catch(() => {});
  if (isMongoEnabled()) {
    await mongoStorage.saveSystemLogsMongo(logs).catch(() => {});
  }
}

// 7. User Profiles
export async function getProfilesCloud(): Promise<any[]> {
  if (isCloudSyncDisabled()) return [];
  try {
    const firebaseRes = await firebaseStorage.getProfilesCloud();
    if (firebaseRes && Array.isArray(firebaseRes) && firebaseRes.length > 0) {
      return firebaseRes;
    }
  } catch (err) {
    console.warn("[STORAGE] Firebase getProfiles failed, attempting MongoDB fallback...");
  }

  if (isMongoEnabled()) {
    try {
      const mongoRes = await mongoStorage.getProfilesMongo();
      if (mongoRes && Array.isArray(mongoRes) && mongoRes.length > 0) {
        return mongoRes;
      }
    } catch (_) {}
  }

  return [];
}

export async function saveProfilesCloud(profiles: any[]): Promise<void> {
  if (isCloudSyncDisabled()) return;
  await firebaseStorage.saveProfilesCloud(profiles).catch(() => {});
  if (isMongoEnabled()) {
    await mongoStorage.saveProfilesMongo(profiles).catch(() => {});
  }
}
