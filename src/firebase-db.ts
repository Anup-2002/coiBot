import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import fs from "fs";
import path from "path";

let db: any = null;

function getDb() {
  if (db) return db;
  try {
    let firebaseConfig: any = null;
    let databaseId: string = "(default)";

    // 1. Check if single JSON environment variable is provided
    if (process.env.FIREBASE_CONFIG) {
      try {
        const parsed = JSON.parse(process.env.FIREBASE_CONFIG);
        firebaseConfig = {
          apiKey: parsed.apiKey,
          authDomain: parsed.authDomain,
          projectId: parsed.projectId,
          storageBucket: parsed.storageBucket,
          messagingSenderId: parsed.messagingSenderId,
          appId: parsed.appId,
        };
        if (parsed.firestoreDatabaseId) {
          databaseId = parsed.firestoreDatabaseId;
        } else if (process.env.FIREBASE_DATABASE_ID) {
          databaseId = process.env.FIREBASE_DATABASE_ID;
        }
        console.log("[FIREBASE] Initializing from FIREBASE_CONFIG environment variable.");
      } catch (e) {
        console.error("[FIREBASE] Failed to parse FIREBASE_CONFIG env variable:", e);
      }
    }

    // 2. Check if individual environment variables are provided
    if (!firebaseConfig && process.env.FIREBASE_API_KEY) {
      firebaseConfig = {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID,
      };
      if (process.env.FIREBASE_DATABASE_ID) {
        databaseId = process.env.FIREBASE_DATABASE_ID;
      }
      console.log("[FIREBASE] Initializing from individual FIREBASE_* environment variables.");
    }

    // 3. Fallback to local firebase-applet-config.json file
    if (!firebaseConfig) {
      const configPath = path.join(process.cwd(), "firebase-applet-config.json");
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        firebaseConfig = {
          apiKey: config.apiKey,
          authDomain: config.authDomain,
          projectId: config.projectId,
          storageBucket: config.storageBucket,
          messagingSenderId: config.messagingSenderId,
          appId: config.appId,
        };
        databaseId = config.firestoreDatabaseId || "(default)";
        console.log("[FIREBASE] Initializing from local firebase-applet-config.json file.");
      }
    }

    if (!firebaseConfig) {
      console.warn("[FIREBASE] No Firebase configuration found (neither in environment variables nor in firebase-applet-config.json). Cloud synchronization will be disabled.");
      return null;
    }

    const app = initializeApp(firebaseConfig);
    db = getFirestore(app, databaseId);
    console.log("[FIREBASE] Firestore initialized successfully with db ID:", databaseId);
    return db;
  } catch (err) {
    console.error("[FIREBASE] Initialization error:", err);
    return null;
  }
}

// Low-level helper to get a document data
async function fetchDoc(docPath: string, defaultVal: any = null): Promise<any> {
  const firestore = getDb();
  if (!firestore) return defaultVal;
  try {
    const docRef = doc(firestore, docPath);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data();
    }
  } catch (err) {
    console.error(`[FIREBASE] Error fetching document ${docPath}:`, err);
  }
  return defaultVal;
}

// Low-level helper to write a document data
async function writeDoc(docPath: string, data: any): Promise<boolean> {
  const firestore = getDb();
  if (!firestore) return false;
  try {
    const docRef = doc(firestore, docPath);
    await setDoc(docRef, data, { merge: true });
    return true;
  } catch (err) {
    console.error(`[FIREBASE] Error writing document ${docPath}:`, err);
    return false;
  }
}

// Session State Sync
export async function getSessionStateCloud(profileId?: string): Promise<string | null> {
  const docPath = profileId ? `bot/session_${profileId}` : "bot/session";
  const data = await fetchDoc(docPath);
  return data ? data.stateJson : null;
}

export async function saveSessionStateCloud(stateJson: string, profileId?: string): Promise<void> {
  const docPath = profileId ? `bot/session_${profileId}` : "bot/session";
  await writeDoc(docPath, {
    stateJson,
    updatedAt: new Date().toISOString()
  });
}

// Trending Coins Sync
export async function getTrendingCoinsCloud(profileId?: string): Promise<any[]> {
  const docPath = profileId ? `coins/trending_${profileId}` : "coins/trending";
  const data = await fetchDoc(docPath, { list: [] });
  return data.list;
}

export async function saveTrendingCoinsCloud(coins: any[], profileId?: string): Promise<void> {
  const docPath = profileId ? `coins/trending_${profileId}` : "coins/trending";
  await writeDoc(docPath, {
    list: coins,
    lastUpdated: new Date().toISOString()
  });
}

// Generated Messages Sync
export async function getGeneratedMessagesCloud(profileId?: string): Promise<any[]> {
  const docPath = profileId ? `messages/generated_${profileId}` : "messages/generated";
  const data = await fetchDoc(docPath, { list: [] });
  return data.list;
}

export async function saveGeneratedMessagesCloud(messages: any[], profileId?: string): Promise<void> {
  const docPath = profileId ? `messages/generated_${profileId}` : "messages/generated";
  await writeDoc(docPath, {
    list: messages,
    lastUpdated: new Date().toISOString()
  });
}

// Post Results Sync
export async function getPostResultsCloud(profileId?: string): Promise<any[]> {
  const docPath = profileId ? `results/all_${profileId}` : "results/all";
  const data = await fetchDoc(docPath, { list: [] });
  return data.list;
}

export async function savePostResultsCloud(results: any[], profileId?: string): Promise<void> {
  const docPath = profileId ? `results/all_${profileId}` : "results/all";
  await writeDoc(docPath, {
    list: results,
    lastUpdated: new Date().toISOString()
  });
}

// Bot Progress Sync
export async function getBotProgressCloud(profileId?: string): Promise<{ next_index: number } | null> {
  const docPath = profileId ? `bot/progress_${profileId}` : "bot/progress";
  const data = await fetchDoc(docPath);
  return data ? { next_index: data.next_index } : null;
}

export async function saveBotProgressCloud(next_index: number, profileId?: string): Promise<void> {
  const docPath = profileId ? `bot/progress_${profileId}` : "bot/progress";
  await writeDoc(docPath, {
    next_index,
    lastUpdated: new Date().toISOString()
  });
}

// Circular System Logs Sync (saves last 200 logs)
export async function getSystemLogsCloud(): Promise<any[]> {
  const data = await fetchDoc("logs/all", { list: [] });
  return data.list;
}

export async function saveSystemLogsCloud(logs: any[]): Promise<void> {
  // Take last 200 logs to prevent exceeding document size limit
  const recentLogs = logs.slice(-200);
  await writeDoc("logs/all", {
    list: recentLogs,
    lastUpdated: new Date().toISOString()
  });
}

// Multi-profile Support Sync
export async function getProfilesCloud(): Promise<any[]> {
  const data = await fetchDoc("bot/profiles", { list: [] });
  return data.list || [];
}

export async function saveProfilesCloud(profiles: any[]): Promise<void> {
  await writeDoc("bot/profiles", {
    list: profiles,
    lastUpdated: new Date().toISOString()
  });
}

