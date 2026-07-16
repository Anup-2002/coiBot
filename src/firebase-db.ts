import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import fs from "fs";
import path from "path";

let db: any = null;

function getDb() {
  if (db) return db;
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (!fs.existsSync(configPath)) {
      console.error("[FIREBASE] Config file not found at:", configPath);
      return null;
    }
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
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

// Helper to determine path based on instance ID
function resolvePath(basePath: string, instanceId?: string): string {
  if (!instanceId || instanceId === "default") {
    return basePath;
  }
  const normalized = basePath.replace("/", "_");
  return `instances/${instanceId}/${normalized}`;
}

// Session State Sync
export async function getSessionStateCloud(instanceId?: string): Promise<string | null> {
  const data = await fetchDoc(resolvePath("bot/session", instanceId));
  return data ? data.stateJson : null;
}

export async function saveSessionStateCloud(stateJson: string, instanceId?: string): Promise<void> {
  await writeDoc(resolvePath("bot/session", instanceId), {
    stateJson,
    updatedAt: new Date().toISOString()
  });
}

// Trending Coins Sync
export async function getTrendingCoinsCloud(instanceId?: string): Promise<any[]> {
  const data = await fetchDoc(resolvePath("coins/trending", instanceId), { list: [] });
  return data.list;
}

export async function saveTrendingCoinsCloud(coins: any[], instanceId?: string): Promise<void> {
  await writeDoc(resolvePath("coins/trending", instanceId), {
    list: coins,
    lastUpdated: new Date().toISOString()
  });
}

// Generated Messages Sync
export async function getGeneratedMessagesCloud(instanceId?: string): Promise<any[]> {
  const data = await fetchDoc(resolvePath("messages/generated", instanceId), { list: [] });
  return data.list;
}

export async function saveGeneratedMessagesCloud(messages: any[], instanceId?: string): Promise<void> {
  await writeDoc(resolvePath("messages/generated", instanceId), {
    list: messages,
    lastUpdated: new Date().toISOString()
  });
}

// Post Results Sync
export async function getPostResultsCloud(instanceId?: string): Promise<any[]> {
  const data = await fetchDoc(resolvePath("results/all", instanceId), { list: [] });
  return data.list;
}

export async function savePostResultsCloud(results: any[], instanceId?: string): Promise<void> {
  await writeDoc(resolvePath("results/all", instanceId), {
    list: results,
    lastUpdated: new Date().toISOString()
  });
}

// Bot Progress Sync
export async function getBotProgressCloud(instanceId?: string): Promise<{ next_index: number } | null> {
  const data = await fetchDoc(resolvePath("bot/progress", instanceId));
  return data ? { next_index: data.next_index } : null;
}

export async function saveBotProgressCloud(next_index: number, instanceId?: string): Promise<void> {
  await writeDoc(resolvePath("bot/progress", instanceId), {
    next_index,
    lastUpdated: new Date().toISOString()
  });
}

// Circular System Logs Sync (saves last 200 logs)
export async function getSystemLogsCloud(instanceId?: string): Promise<any[]> {
  const data = await fetchDoc(resolvePath("logs/all", instanceId), { list: [] });
  return data.list;
}

export async function saveSystemLogsCloud(logs: any[], instanceId?: string): Promise<void> {
  // Take last 200 logs to prevent exceeding document size limit
  const recentLogs = logs.slice(-200);
  await writeDoc(resolvePath("logs/all", instanceId), {
    list: recentLogs,
    lastUpdated: new Date().toISOString()
  });
}

// Multi-profile Support Sync
export async function getProfilesCloud(instanceId?: string): Promise<any[]> {
  const data = await fetchDoc(resolvePath("bot/profiles", instanceId), { list: [] });
  return data.list || [];
}

export async function saveProfilesCloud(profiles: any[], instanceId?: string): Promise<void> {
  await writeDoc(resolvePath("bot/profiles", instanceId), {
    list: profiles,
    lastUpdated: new Date().toISOString()
  });
}

