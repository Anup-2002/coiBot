import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import fs from "fs";
import path from "path";

let db: any = null;

function getDb() {
  if (db) return db;
  try {
    let config: any = null;
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      } catch (err) {
        console.error("[FIREBASE] Error parsing firebase-applet-config.json:", err);
      }
    }

    // Fallback to environment variables if config file not found or invalid
    if (!config || !config.projectId) {
      if (process.env.FIREBASE_PROJECT_ID) {
        config = {
          apiKey: process.env.FIREBASE_API_KEY,
          authDomain: process.env.FIREBASE_AUTH_DOMAIN,
          projectId: process.env.FIREBASE_PROJECT_ID,
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
          messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
          appId: process.env.FIREBASE_APP_ID,
          firestoreDatabaseId: process.env.FIREBASE_FIRESTORE_DATABASE_ID,
        };
      }
    }

    if (!config || !config.projectId) {
      console.warn("[FIREBASE] Config file not found and environment variables not set. Running in local-only mode.");
      return null;
    }

    const firebaseConfig = {
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
    };
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app, config.firestoreDatabaseId || "(default)");
    console.log("[FIREBASE] Firestore initialized successfully with db ID:", config.firestoreDatabaseId || "(default)");
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
export async function getSessionStateCloud(): Promise<string | null> {
  const data = await fetchDoc("bot/session");
  return data ? data.stateJson : null;
}

export async function saveSessionStateCloud(stateJson: string): Promise<void> {
  await writeDoc("bot/session", {
    stateJson,
    updatedAt: new Date().toISOString()
  });
}

// Trending Coins Sync
export async function getTrendingCoinsCloud(): Promise<any[]> {
  const data = await fetchDoc("coins/trending", { list: [] });
  return data.list;
}

export async function saveTrendingCoinsCloud(coins: any[]): Promise<void> {
  await writeDoc("coins/trending", {
    list: coins,
    lastUpdated: new Date().toISOString()
  });
}

// Generated Messages Sync
export async function getGeneratedMessagesCloud(): Promise<any[]> {
  const data = await fetchDoc("messages/generated", { list: [] });
  return data.list;
}

export async function saveGeneratedMessagesCloud(messages: any[]): Promise<void> {
  await writeDoc("messages/generated", {
    list: messages,
    lastUpdated: new Date().toISOString()
  });
}

// Post Results Sync
export async function getPostResultsCloud(): Promise<any[]> {
  const data = await fetchDoc("results/all", { list: [] });
  return data.list;
}

export async function savePostResultsCloud(results: any[]): Promise<void> {
  await writeDoc("results/all", {
    list: results,
    lastUpdated: new Date().toISOString()
  });
}

// Bot Progress Sync
export async function getBotProgressCloud(): Promise<{ next_index: number } | null> {
  const data = await fetchDoc("bot/progress");
  return data ? { next_index: data.next_index } : null;
}

export async function saveBotProgressCloud(next_index: number): Promise<void> {
  await writeDoc("bot/progress", {
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

