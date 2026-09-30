import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import fs from "fs";
import path from "path";

let db: any = null;
let isFirebaseInitialized = false;

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyADgd9kq0YUFjSjVgOaZXMMJmo2Ye8PWls",
  authDomain: "cmc-bot-project2.firebaseapp.com",
  projectId: "cmc-bot-project2",
  storageBucket: "cmc-bot-project2.firebasestorage.app",
  messagingSenderId: "1035058754010",
  appId: "1:1035058754010:web:8038d6776f5a5a49dad0e3",
  measurementId: "G-J81TX46MQ6",
  databaseURL: "https://cmc-bot-project2-default-rtdb.firebaseio.com",
  firestoreDatabaseId: "(default)",
};

function getDb() {
  if (isFirebaseInitialized) return db;
  isFirebaseInitialized = true;
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
          measurementId: parsed.measurementId,
          databaseURL: parsed.databaseURL || "https://cmc-bot-project2-default-rtdb.firebaseio.com",
        };
        const rawDbId = parsed.firestoreDatabaseId || process.env.FIREBASE_DATABASE_ID;
        if (rawDbId && (rawDbId.startsWith("http://") || rawDbId.startsWith("https://"))) {
          firebaseConfig.databaseURL = rawDbId;
          databaseId = "(default)";
        } else if (rawDbId) {
          databaseId = rawDbId;
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
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || "cmc-bot-project2.firebaseapp.com",
        projectId: process.env.FIREBASE_PROJECT_ID || "cmc-bot-project2",
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "cmc-bot-project2.firebasestorage.app",
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "1035058754010",
        appId: process.env.FIREBASE_APP_ID || "1:1035058754010:web:8038d6776f5a5a49dad0e3",
        measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-J81TX46MQ6",
        databaseURL: process.env.FIREBASE_DATABASE_URL || "https://cmc-bot-project2-default-rtdb.firebaseio.com",
      };
      const rawDbId = process.env.FIREBASE_DATABASE_ID;
      if (rawDbId && (rawDbId.startsWith("http://") || rawDbId.startsWith("https://"))) {
        firebaseConfig.databaseURL = rawDbId;
        databaseId = "(default)";
      } else if (rawDbId) {
        databaseId = rawDbId;
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
          measurementId: config.measurementId,
          databaseURL: config.databaseURL || "https://cmc-bot-project2-default-rtdb.firebaseio.com",
        };
        const rawDbId = config.firestoreDatabaseId;
        if (rawDbId && (rawDbId.startsWith("http://") || rawDbId.startsWith("https://"))) {
          firebaseConfig.databaseURL = rawDbId;
          databaseId = "(default)";
        } else {
          databaseId = config.firestoreDatabaseId || "(default)";
        }
        console.log("[FIREBASE] Initializing from local firebase-applet-config.json file.");
      }
    }

    // 4. Default fallback to verified application config
    if (!firebaseConfig) {
      firebaseConfig = { ...DEFAULT_FIREBASE_CONFIG };
      databaseId = DEFAULT_FIREBASE_CONFIG.firestoreDatabaseId;
      console.log("[FIREBASE] Initializing from DEFAULT_FIREBASE_CONFIG.");
    }

    const app = initializeApp(firebaseConfig);
    const enableFirestore = process.env.FIREBASE_ENABLE_FIRESTORE === "true";
    if (enableFirestore) {
      db = getFirestore(app, databaseId);
      console.log("[FIREBASE] Firestore initialized with db ID:", databaseId);
    } else {
      console.log("[FIREBASE] Connected to Firebase Realtime Database at:", getRtdbUrl());
    }
    return db;
  } catch (err) {
    console.error("[FIREBASE] Initialization error:", err);
    return null;
  }
}

// Low-level Realtime Database REST helpers
export function getRtdbUrl(): string | null {
  if (process.env.FIREBASE_DATABASE_URL) return process.env.FIREBASE_DATABASE_URL.replace(/\/+$/, "");
  if (process.env.FIREBASE_DATABASE_ID && process.env.FIREBASE_DATABASE_ID.startsWith("http")) {
    return process.env.FIREBASE_DATABASE_ID.replace(/\/+$/, "");
  }
  return DEFAULT_FIREBASE_CONFIG.databaseURL || "https://cmc-bot-project2-default-rtdb.firebaseio.com";
}

async function fetchFromRtdb(docPath: string): Promise<any> {
  const rtdbUrl = getRtdbUrl();
  if (!rtdbUrl) return null;
  try {
    const sanitizedPath = docPath.replace(/[^a-zA-Z0-9_\-\/]/g, "_");
    const res = await fetch(`${rtdbUrl}/${sanitizedPath}.json`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      return await res.json();
    }
  } catch (_) {}
  return null;
}

async function writeToRtdb(docPath: string, data: any): Promise<boolean> {
  const rtdbUrl = getRtdbUrl();
  if (!rtdbUrl) return false;
  try {
    const sanitizedPath = docPath.replace(/[^a-zA-Z0-9_\-\/]/g, "_");
    const res = await fetch(`${rtdbUrl}/${sanitizedPath}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(4000)
    });
    return res.ok;
  } catch (_) {}
  return false;
}

let firestoreUnavailable = false;
let lastFirestoreCheck = 0;

// Low-level helper to get a document data
async function fetchDoc(docPath: string, defaultVal: any = null): Promise<any> {
  // 1. Try Firestore if not known to be unprovisioned
  if (!firestoreUnavailable || (Date.now() - lastFirestoreCheck > 300000)) {
    const firestore = getDb();
    if (firestore) {
      try {
        const docRef = doc(firestore, docPath);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          return snap.data();
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg.includes("client is offline") || msg.includes("NOT_FOUND") || msg.includes("5")) {
          if (!firestoreUnavailable) {
            console.warn(`[FIREBASE] Cloud Firestore not provisioned in project; using Realtime Database & MongoDB storage.`);
            firestoreUnavailable = true;
            lastFirestoreCheck = Date.now();
          }
        } else {
          console.error(`[FIREBASE] Error fetching document ${docPath}:`, msg);
        }
      }
    }
  }

  // 2. Fallback to Realtime Database
  const rtdbData = await fetchFromRtdb(docPath);
  if (rtdbData !== null && rtdbData !== undefined) {
    return rtdbData;
  }

  return defaultVal;
}

// Low-level helper to write a document data
async function writeDoc(docPath: string, data: any): Promise<boolean> {
  let success = false;

  // 1. Save to Realtime Database
  const rtdbOk = await writeToRtdb(docPath, data);
  if (rtdbOk) success = true;

  // 2. Save to Firestore if available
  if (!firestoreUnavailable) {
    const firestore = getDb();
    if (firestore) {
      try {
        const docRef = doc(firestore, docPath);
        await setDoc(docRef, data, { merge: true });
        success = true;
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg.includes("client is offline") || msg.includes("NOT_FOUND") || msg.includes("5")) {
          firestoreUnavailable = true;
          lastFirestoreCheck = Date.now();
        }
      }
    }
  }

  return success;
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

