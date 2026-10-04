import { MongoClient, Db } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;
let isConnecting = false;
let isFailed = false;

export function sanitizeMongoUri(rawUri: string): string {
  if (!rawUri || !rawUri.includes("://")) return rawUri;
  const proto = rawUri.split("://")[0] + "://";
  const rest = rawUri.substring(proto.length);
  const lastAtIndex = rest.lastIndexOf("@");
  if (lastAtIndex === -1) return rawUri;
  
  const authPart = rest.substring(0, lastAtIndex);
  const hostPart = rest.substring(lastAtIndex + 1);
  
  const firstColon = authPart.indexOf(":");
  if (firstColon === -1) return rawUri;
  
  const user = authPart.substring(0, firstColon);
  const pass = authPart.substring(firstColon + 1);
  
  // Re-encode password properly (decode first to avoid double encoding)
  const decodedPass = decodeURIComponent(pass);
  const encodedPass = encodeURIComponent(decodedPass);
  
  return `${proto}${user}:${encodedPass}@${hostPart}`;
}

export async function getMongoDb(): Promise<Db | null> {
  if (db) return db;
  if (isFailed) return null;

  const rawUri = process.env.MONGO_URI;
  if (!rawUri) return null;
  const mongoUri = sanitizeMongoUri(rawUri);

  if (isConnecting) {
    while (isConnecting) {
      await new Promise(r => setTimeout(r, 200));
    }
    return db;
  }

  isConnecting = true;
  try {
    console.log("[MONGODB] Connecting to MongoDB Atlas cluster...");
    client = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    await client.connect();
    
    // Isolated dedicated database name for CoinMarketCap bot (strictly isolates from existing collections)
    let dbName = "cmc_bot";
    try {
      const parsedUrl = new URL(mongoUri);
      const pathname = parsedUrl.pathname.replace(/^\//, "");
      if (pathname && !pathname.toLowerCase().includes("halo") && pathname !== "admin") {
        dbName = pathname;
      }
    } catch (_) {}

    db = client.db(dbName);
    console.log(`[MONGODB] Successfully connected to database: "${dbName}"!`);
    return db;
  } catch (err) {
    isFailed = true;
    console.warn(`[MONGODB] Could not connect to MongoDB Atlas (${(err as Error).message}). Note: In cloud sandbox environments with restricted TCP egress, standard port 27017 may be blocked, but it connects directly on AWS / Railway.`);
    return null;
  } finally {
    isConnecting = false;
  }
}

// 1. Session state
export async function getSessionStateMongo(profileId?: string): Promise<string | null> {
  try {
    const database = await getMongoDb();
    if (!database) return null;
    const docId = profileId ? `session_${profileId}` : "session";
    const res = await database.collection("bot_sessions").findOne({ _id: docId as any });
    return res ? res.stateJson : null;
  } catch (err) {
    console.error("[MONGODB] Error fetching session:", (err as Error).message);
    return null;
  }
}

export async function saveSessionStateMongo(stateJson: string, profileId?: string): Promise<void> {
  try {
    const database = await getMongoDb();
    if (!database) return;
    const docId = profileId ? `session_${profileId}` : "session";
    await database.collection("bot_sessions").updateOne(
      { _id: docId as any },
      { $set: { stateJson, updatedAt: new Date().toISOString() } },
      { upsert: true }
    );
  } catch (err) {
    console.error("[MONGODB] Error saving session:", (err as Error).message);
  }
}

// 2. Trending Coins
export async function getTrendingCoinsMongo(profileId?: string): Promise<any[]> {
  try {
    const database = await getMongoDb();
    if (!database) return [];
    const docId = profileId ? `trending_${profileId}` : "trending";
    const res = await database.collection("trending_coins").findOne({ _id: docId as any });
    return res && Array.isArray(res.list) ? res.list : [];
  } catch (err) {
    console.error("[MONGODB] Error fetching trending coins:", (err as Error).message);
    return [];
  }
}

export async function saveTrendingCoinsMongo(coins: any[], profileId?: string): Promise<void> {
  try {
    const database = await getMongoDb();
    if (!database) return;
    const docId = profileId ? `trending_${profileId}` : "trending";
    await database.collection("trending_coins").updateOne(
      { _id: docId as any },
      { $set: { list: coins, lastUpdated: new Date().toISOString() } },
      { upsert: true }
    );
  } catch (err) {
    console.error("[MONGODB] Error saving trending coins:", (err as Error).message);
  }
}

// 3. Generated Messages
export async function getGeneratedMessagesMongo(profileId?: string): Promise<any[]> {
  try {
    const database = await getMongoDb();
    if (!database) return [];
    const docId = profileId ? `generated_${profileId}` : "generated";
    const res = await database.collection("generated_messages").findOne({ _id: docId as any });
    return res && Array.isArray(res.list) ? res.list : [];
  } catch (err) {
    console.error("[MONGODB] Error fetching generated messages:", (err as Error).message);
    return [];
  }
}

export async function saveGeneratedMessagesMongo(messages: any[], profileId?: string): Promise<void> {
  try {
    const database = await getMongoDb();
    if (!database) return;
    const docId = profileId ? `generated_${profileId}` : "generated";
    await database.collection("generated_messages").updateOne(
      { _id: docId as any },
      { $set: { list: messages, lastUpdated: new Date().toISOString() } },
      { upsert: true }
    );
  } catch (err) {
    console.error("[MONGODB] Error saving generated messages:", (err as Error).message);
  }
}

// 4. Post Results
export async function getPostResultsMongo(profileId?: string): Promise<any[]> {
  try {
    const database = await getMongoDb();
    if (!database) return [];
    const docId = profileId ? `results_${profileId}` : "results";
    const res = await database.collection("post_results").findOne({ _id: docId as any });
    return res && Array.isArray(res.list) ? res.list : [];
  } catch (err) {
    console.error("[MONGODB] Error fetching post results:", (err as Error).message);
    return [];
  }
}

export async function savePostResultsMongo(results: any[], profileId?: string): Promise<void> {
  try {
    const database = await getMongoDb();
    if (!database) return;
    const docId = profileId ? `results_${profileId}` : "results";
    await database.collection("post_results").updateOne(
      { _id: docId as any },
      { $set: { list: results, lastUpdated: new Date().toISOString() } },
      { upsert: true }
    );
  } catch (err) {
    console.error("[MONGODB] Error saving post results:", (err as Error).message);
  }
}

// 5. Bot Progress
export async function getBotProgressMongo(profileId?: string): Promise<{ next_index: number } | null> {
  try {
    const database = await getMongoDb();
    if (!database) return null;
    const docId = profileId ? `progress_${profileId}` : "progress";
    const res = await database.collection("bot_progress").findOne({ _id: docId as any });
    return res ? { next_index: res.next_index } : null;
  } catch (err) {
    console.error("[MONGODB] Error fetching bot progress:", (err as Error).message);
    return null;
  }
}

export async function saveBotProgressMongo(next_index: number, profileId?: string): Promise<void> {
  try {
    const database = await getMongoDb();
    if (!database) return;
    const docId = profileId ? `progress_${profileId}` : "progress";
    await database.collection("bot_progress").updateOne(
      { _id: docId as any },
      { $set: { next_index, lastUpdated: new Date().toISOString() } },
      { upsert: true }
    );
  } catch (err) {
    console.error("[MONGODB] Error saving bot progress:", (err as Error).message);
  }
}

// 6. System Logs
export async function getSystemLogsMongo(): Promise<any[]> {
  try {
    const database = await getMongoDb();
    if (!database) return [];
    const res = await database.collection("system_logs").findOne({ _id: "all" as any });
    return res && Array.isArray(res.list) ? res.list : [];
  } catch (err) {
    console.error("[MONGODB] Error fetching system logs:", (err as Error).message);
    return [];
  }
}

export async function saveSystemLogsMongo(logs: any[]): Promise<void> {
  try {
    const database = await getMongoDb();
    if (!database) return;
    const recentLogs = logs.slice(-200);
    await database.collection("system_logs").updateOne(
      { _id: "all" as any },
      { $set: { list: recentLogs, lastUpdated: new Date().toISOString() } },
      { upsert: true }
    );
  } catch (err) {
    console.error("[MONGODB] Error saving system logs:", (err as Error).message);
  }
}

// 7. Profiles
export async function getProfilesMongo(): Promise<any[]> {
  try {
    const database = await getMongoDb();
    if (!database) return [];
    const res = await database.collection("user_profiles").findOne({ _id: "profiles" as any });
    return res && Array.isArray(res.list) ? res.list : [];
  } catch (err) {
    console.error("[MONGODB] Error fetching profiles:", (err as Error).message);
    return [];
  }
}

export async function saveProfilesMongo(profiles: any[]): Promise<void> {
  try {
    const database = await getMongoDb();
    if (!database) return;
    await database.collection("user_profiles").updateOne(
      { _id: "profiles" as any },
      { $set: { list: profiles, lastUpdated: new Date().toISOString() } },
      { upsert: true }
    );
  } catch (err) {
    console.error("[MONGODB] Error saving profiles:", (err as Error).message);
  }
}
