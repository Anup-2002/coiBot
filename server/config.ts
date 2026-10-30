import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { execSync } from "child_process";
export { fs, path, os, crypto, execSync };
import dotenv from "dotenv";
import { createRequire } from "module";

// Auto-detect production mode if running from bundled dist/server.cjs or process.env.NODE_ENV is not explicitly set
if (!process.env.NODE_ENV) {
  const isCjs = typeof __filename !== "undefined";
  const isBundled = isCjs && (__filename.endsWith("server.cjs") || __filename.includes("dist"));
  const hasSrcDir = fs.existsSync(path.join(process.cwd(), "src"));
  if (isBundled || !hasSrcDir) {
    process.env.NODE_ENV = "production";
  } else {
    process.env.NODE_ENV = "development";
  }
}
console.log(`[SERVER] Detected environment: NODE_ENV=${process.env.NODE_ENV}`);

// Auto-detect where Playwright browser is actually installed on disk (user home cache, project local cache, root cache, or custom env)
function resolvePlaywrightBrowsersPath(): string {
  const candidates: string[] = [];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    candidates.push(path.resolve(process.env.PLAYWRIGHT_BROWSERS_PATH));
  }
  candidates.push(path.join(os.homedir(), ".cache", "ms-playwright"));
  candidates.push(path.join(process.cwd(), ".cache", "ms-playwright"));
  candidates.push("/root/.cache/ms-playwright");

  // Check each candidate for existing chromium / chrome folders
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const items = fs.readdirSync(c);
        if (items.some(f => f.startsWith("chromium") || f.startsWith("chrome") || f.startsWith("firefox"))) {
          return c;
        }
      } catch (_) {}
    }
  }

  // If candidate with browser files not found yet, prefer home cache or project cache
  const homeCache = path.join(os.homedir(), ".cache", "ms-playwright");
  if (fs.existsSync(homeCache)) return homeCache;
  return path.join(process.cwd(), ".cache", "ms-playwright");
}

process.env.PLAYWRIGHT_BROWSERS_PATH = resolvePlaywrightBrowsersPath();
console.log(`[PLAYWRIGHT] Auto-detected PLAYWRIGHT_BROWSERS_PATH to: ${process.env.PLAYWRIGHT_BROWSERS_PATH}`);

// Bridge symlink: If browser exists in home cache but project .cache doesn't have it, create symlink
try {
  const projectCache = path.join(process.cwd(), ".cache", "ms-playwright");
  const homeCache = path.join(os.homedir(), ".cache", "ms-playwright");
  if (fs.existsSync(homeCache) && !fs.existsSync(projectCache)) {
    const parentDir = path.dirname(projectCache);
    if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
    fs.symlinkSync(homeCache, projectCache, "dir");
    console.log(`[PLAYWRIGHT] Linked ${projectCache} -> ${homeCache}`);
  }
} catch (_) {}


export const customRequire = typeof require !== "undefined" ? require : createRequire(typeof process !== "undefined" && process.cwd ? "file://" + process.cwd() + "/server.js" : "file:///app/server.js");
export const { chromium } = customRequire("playwright") as typeof import("playwright");

dotenv.config({ override: true });

export const PORT = Number(process.env.PORT) || 3000;

let initialOutputDir = path.join(process.cwd(), "output");
let initialAuthDir = path.join(process.cwd(), "auth");

try {
  if (!fs.existsSync(initialOutputDir)) {
    fs.mkdirSync(initialOutputDir, { recursive: true });
  }
  const testFile = path.join(initialOutputDir, ".write-test");
  fs.writeFileSync(testFile, "test");
  fs.unlinkSync(testFile);
} catch (err) {
  console.warn("[SERVER] Root output directory is not writable. Falling back to /tmp/bot-output for AWS/Serverless compatibility.");
  initialOutputDir = "/tmp/bot-output";
  if (!fs.existsSync(initialOutputDir)) {
    fs.mkdirSync(initialOutputDir, { recursive: true });
  }
}

try {
  if (!fs.existsSync(initialAuthDir)) {
    fs.mkdirSync(initialAuthDir, { recursive: true });
  }
  const testFile = path.join(initialAuthDir, ".write-test");
  fs.writeFileSync(testFile, "test");
  fs.unlinkSync(testFile);
} catch (err) {
  console.warn("[SERVER] Root auth directory is not writable. Falling back to /tmp/bot-auth for AWS/Serverless compatibility.");
  initialAuthDir = "/tmp/bot-auth";
  if (!fs.existsSync(initialAuthDir)) {
    fs.mkdirSync(initialAuthDir, { recursive: true });
  }
}

export { initialOutputDir, initialAuthDir };

export const isOpenAiConfigured = !!process.env.OPENAI_API_KEY;
export const isCmcConfigured = !!process.env.CMC_API_KEY;

export interface ProfileTimestamps {
  coinsFetchedAt: number | null;
  coinsFetchedTime: string | null;
  commentsGeneratedAt: number | null;
  commentsGeneratedTime: string | null;
}

export interface BotProgressData {
  next_index: number;
  daily_post_count?: number;
  last_post_date?: string;
  daily_post_limit?: number;
  updated_at?: string;
}

export interface LogEntry {
  timestamp: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
  profileId?: string | null;
}

export interface Coin {
  name: string;
  symbol: string;
  price: number;
  change_1h?: number;
  change_24h: number;
  change_7d?: number;
  market_cap: number;
  volume_24h: number;
  cmc_rank?: number;
  slug: string;
  url: string;
}

export interface GeneratedMessage {
  name: string;
  symbol: string;
  url: string;
  message: string;
  sentiment?: "bullish" | "bearish" | "neutral";
}

export interface PostResult {
  name: string;
  symbol: string;
  url: string;
  status: "success" | "captcha" | "expired" | "failed" | "retry" | "skipped";
  message: string;
  timestamp: string;
  createdAt?: number;
  sentiment?: "bullish" | "bearish" | "neutral";
  profileId?: string;
}

export type SystemProcessType =
  | "none"
  | "single_posting"
  | "scheduler_cycle"
  | "continuous_loop"
  | "fetching_coins"
  | "generating_comments"
  | "refresh_fresh"
  | "retry_single"
  | "authenticating"
  | "checking_login"
  | "clearing_storage";

export interface LoginSession {
  browser: any;
  context: any;
  page: any;
  email: string;
}
